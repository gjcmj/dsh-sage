// 工作流状态：读模板 + 项目决定，**从产物推导**阶段（不记账）。
//
// 与旧 project-state 的区别：阶段来自模板（可配置），不写死 K/G 编号；
// 只把「人的决定」（阶段开关、严格模式、指纹）写进 `.sage/state.json`。

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadTemplate, readProjectWorkflow, resolveWorkflowConfig,
} from "./workflow-config.js";
import {
  checkKickoff, checkAgents, checkPrdDraft, checkPrdFinal, traceRate,
} from "./workflow-checks.js";

const PKG_WORKFLOW_DIR = fileURLToPath(new URL("../workflow/", import.meta.url));
const PKG_SKILLS_DIR = fileURLToPath(new URL("../skills/", import.meta.url));

function readText(file) {
  try { return readFileSync(file, "utf8"); } catch { return null; }
}

function dirFiles(dir) {
  try { return readdirSync(dir).filter((n) => !n.startsWith(".") && /^\.(md|txt|html)$/.test(n) || !n.startsWith(".")); } catch { return []; }
}

function pathState(root, rel) {
  if (!rel) return { exists: false };
  const p = join(root, rel);
  if (!existsSync(p)) return { exists: false, path: rel };
  try {
    const st = statSync(p);
    if (st.isDirectory()) {
      const n = readdirSync(p).filter((x) => !x.startsWith(".")).length;
      return { exists: n > 0, path: rel, isDir: true, count: n };
    }
    return { exists: true, path: rel, bytes: st.size };
  } catch { return { exists: false, path: rel }; }
}

export const PHASE_LABELS_ZH = {
  kickoff: "立项（章程）",
  discovery: "发现",
  prd: "PRD",
  prototype: "原型（可选）",
  "tech-plan": "技术方案（可选）",
  dev: "开发（team）",
};

/**
 * 推导工作流状态。
 * @param root - 项目根目录。
 * @param opts - workflowDir / skillsDir / statePath（测试注入）。
 */
export function deriveWorkflowState(root, opts = {}) {
  const workflowDir = opts.workflowDir || PKG_WORKFLOW_DIR;
  const wf = readProjectWorkflow(root, { statePath: opts.statePath || ".sage/state.json" });
  const config = resolveWorkflowConfig(wf.config, { global: opts.settings || null });
  const loaded = loadTemplate(config.preset, { workflowDir });
  const problems = [...wf.problems, ...(config.problems || []), ...loaded.problems];
  const template = loaded.template;
  const artifacts = {
  ...(template && template.artifacts ? template.artifacts : {}),
    ...config.paths,
  };
  const paths = {
    kickoffDraft: "tasks/00-kickoff-draft.md",
    kickoff: "tasks/00-kickoff.md",
    agents: "AGENTS.md",
    research: "research/",
    prd: "docs/PRD.md",
    prototype: "docs/prototype/",
    techPlan: "docs/tech-plan/",
    decisions: "decisions.md",
    ...artifacts,
  };
  const texts = {
    kickoff: readText(join(root, paths.kickoff)),
    draft: readText(join(root, paths.kickoffDraft)),
    agents: readText(join(root, paths.agents)),
    prd: readText(join(root, paths.prd)),
    decisions: readText(join(root, paths.decisions)),
  };
  const researchFiles = dirFiles(join(root, paths.research));
  // 开发段：以「是否存在 team run」为完成标志（交接不是状态文件能记的事）。
  const teamRuns = (() => {
    const dir = join(root, "team");
    if (!existsSync(dir)) return 0;
    try { return readdirSync(dir).filter((n) => !n.startsWith(".") && existsSync(join(dir, n, "STATE.json"))).length; } catch { return 0; }
  })();
  const prototypeState = pathState(root, paths.prototype);
  const techPlanState = pathState(root, paths.techPlan);

  const isProject = Boolean((texts.kickoff || "").trim() || (texts.agents || "").trim() || (texts.prd || "").trim() || researchFiles.length);
  const k = texts.kickoff ? checkKickoff(texts.kickoff) : { ok: false, missing: ["章程不存在"] };
  const a = texts.agents ? checkAgents(texts.agents) : { ok: false, missing: ["AGENTS 不存在"], devMode: false };
  const prdDraft = texts.prd ? checkPrdDraft(texts.prd) : { ok: false, missing: ["PRD 不存在"] };
  const prdFinal = texts.prd ? checkPrdFinal(texts.prd, texts.decisions || "") : { ok: false, missing: ["PRD 不存在"] };

  // 可选阶段被启用但 skill 不存在 ⇒ 报问题（不静默让它"看似可用"）。
  const skillsDir = opts.skillsDir || PKG_SKILLS_DIR;
  for (const id of ["prototype", "tech-plan"]) {
    const p = template && template.phases ? template.phases[id] : null;
    if (p && p.skill && config.phases && config.phases[id] === true) {
      const f = join(skillsDir, p.skill, "SKILL.md");
      if (!existsSync(f)) problems.push("已启用 " + id + " 但缺少 skill：" + p.skill);
    }
  }
  const want = config.phases || {};
  // 路线：项目/设置显式指定优先，否则用模板（预设）里的默认路线，最后回落到内置默认。
  if (!config.routes || config.routes.length === 0) {
    config.routes = (template && template.phases && template.phases.discovery && template.phases.discovery.routes) || ["internal", "users"];
  }
  const tplPhase = (id) => (template && template.phases ? template.phases[id] : null);
  const defOn = (id) => !!(tplPhase(id) && tplPhase(id).enabledByDefault === true);
  const enabled = { discovery: false, prototype: false, "tech-plan": false };
  for (const id of Object.keys(enabled)) {
    enabled[id] = want[id] === undefined ? defOn(id) : want[id] === true;
  }
  const phases = [];
  const add = (id, done, missing, extra = {}) => phases.push({ id, label: PHASE_LABELS_ZH[id], done: done === true, missing, skipped: false, ...extra });
  add("kickoff", k.ok && a.ok, [...(k.ok ? [] : k.missing), ...(a.ok ? [] : ["AGENTS：" + a.missing.join("、")])]);
  if (!enabled.discovery) add("discovery", true, [], { skipped: true, reason: "设置里关闭了发现阶段" });
  else add("discovery", researchFiles.length > 0, researchFiles.length ? [] : ["research/ 下没有调研产物"]);
  add("prd", prdFinal.ok, prdFinal.missing, { draftDone: prdDraft.ok, status: (prdFinal.status && prdFinal.status.status) || "unknown" });
  for (const id of ["prototype", "tech-plan"]) {
    if (!enabled[id]) { add(id, true, [], { skipped: true, reason: "未启用（预设/设置关闭）" }); continue; }
    if (!prdFinal.ok) { add(id, false, ["等 PRD 定稿"]); continue; }
    const st = id === "prototype" ? prototypeState : techPlanState;
    const rel = id === "prototype" ? paths.prototype : paths.techPlan;
    const body = st.isDir ? "" : readText(join(root, rel)) || "";
    const trace = body ? traceRate(body) : 0;
    add(id, st.exists && trace > 0, [...(st.exists ? [] : ["产物不存在：" + rel]), ...(trace > 0 ? [] : ["缺回指 PRD 条目"])], { trace });
  }
  add("dev", teamRuns > 0, teamRuns > 0 ? [] : ["PRD 定稿后启动 /team（当前 0 个 run）"], { ready: prdFinal.ok, runs: teamRuns });

  const next = phases.find((p) => !p.done && !p.skipped) || null;
  return {
    root,
    config,
    paths,
    problems,
    template: template ? { id: template.id, version: template.version, preset: config.preset } : null,
    isProject,
    phases,
    prd: {
      status: (prdFinal.status && prdFinal.status.status) || "unknown",
      version: (prdFinal.status && prdFinal.status.version) || null,
      draftOk: prdDraft.ok,
      finalOk: prdFinal.ok,
      missingDraft: prdDraft.missing,
      missingFinal: prdFinal.missing,
      openQuestions: prdFinal.opens || 0,
      dimensions: {
        filled: 18 - ((prdFinal.dims && prdFinal.dims.missingFinal) || []).length,
        total: 18,
        missing: (prdFinal.dims && prdFinal.dims.missingFinal) || [],
      },
      highlights: prdFinal.highlights || { count: 0, complete: 0 },
      scope: prdFinal.scope || { must: 0, nonGoals: 0 },
      metrics: prdFinal.metrics || { has: false, hasCaliber: false, hasAntiGame: false },
    },
    agents: { devMode: a.devMode, version: a.version, ok: a.ok },
    next: next ? { id: next.id, label: next.label, missing: next.missing } : null,
    counts: { researchFiles: researchFiles.length, prototypes: prototypeState.count || 0, teamRuns },
    strict: config.strict,
    runKinds: config.runKinds,
  };
}

/** 一行进度（dock）：只把「第一个未完成」标进行中，其余待办。 */
export function dockLine(state) {
  const parts = (state.phases || []).map((p) => {
    if (p.skipped) return p.label + "(skip)";
    if (p.done) return p.label + "✓";
    return p.label + (p.id === (state.next && state.next.id) ? "进行中" : "待办");
  });
  return parts.join(" → ");
}
