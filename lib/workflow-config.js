// 工作流模板：加载 `workflow/base.yml` 与 `workflow/presets/*.yml`，合并 `extends`，校验并钉住版本。
//
// 三条纪律（design: docs/sage/workflow-schema.md）：
//   ① 模板是**数据**：换项目只换预设，不改代码；
//   ② 未知阶段 / 未知路线 / 引用了不存在的 skill ⇒ **报错并列合法值**，不静默跳过；
//   ③ 项目启动时钉住 `version + preset`，之后改模板不影响在跑项目。

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./workflow-yaml.js";

export const PHASE_IDS = ["kickoff", "discovery", "prd", "prototype", "tech-plan", "dev"];
export const KNOWN_ROUTES = ["internal", "users", "competitors", "policy", "tech-form", "market"];
export const ARTIFACT_KEYS = ["kickoffDraft", "kickoff", "agents", "research", "prd", "prototype", "techPlan", "decisions", "state"];

const PKG_WORKFLOW_DIR = fileURLToPath(new URL("../workflow/", import.meta.url)).replace(/[\\/]+$/, "");
const PKG_SKILLS_DIR = fileURLToPath(new URL("../skills/", import.meta.url)).replace(/[\\/]+$/, "");

/** 读一个 yml；读不到 ⇒ 抛错（模板缺失不该被当成「用默认值」）。 */
export function readTemplateYaml(file) {
  return parseYaml(readFileSync(file, "utf8"));
}

/** 深合并：对象逐层合并；数组/标量整体替换（预设覆盖，不做数组拼接）。 */
export function mergeDeep(base, over) {
  if (Array.isArray(over) || typeof over !== "object" || over === null) return over;
  const out = Array.isArray(base) || typeof base !== "object" || base === null ? {} : { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = mergeDeep(out[k], v);
  return out;
}

/** 列出可用预设（目录下 *.yml）。 */
export function listPresets(workflowDir = PKG_WORKFLOW_DIR) {
  try {
    return readdirSync(join(workflowDir, "presets"))
      .filter((n) => n.endsWith(".yml"))
      .map((n) => n.slice(0, -4))
      .sort();
  } catch { return []; }
}

/**
 * 加载模板：base + 预设（最多两级 extends）。
 * @returns { template, problems }；problems 非空时调用方必须拒绝启动流程。
 */
export function loadTemplate(presetId, { workflowDir = PKG_WORKFLOW_DIR, skillsDir = PKG_SKILLS_DIR } = {}) {
  const problems = [];
  const baseFile = join(workflowDir, "base.yml");
  if (!existsSync(baseFile)) return { template: null, problems: ["缺少 workflow/base.yml"] };
  const base = readTemplateYaml(baseFile);
  let template = { ...base };
  const chain = [];
  let current = presetId || base.id || "base";
  while (current && current !== "base") {
    const file = join(workflowDir, "presets", current + ".yml");
    if (!existsSync(file)) { problems.push("预设不存在：" + current + "（可用：base、" + listPresets(workflowDir).join("、") + "）"); break; }
    const preset = readTemplateYaml(file);
    chain.unshift(current);
    template = mergeDeep(template, preset);
    current = preset.extends || "";
    if (chain.length > 2) { problems.push("extends 最多两级：" + chain.join(" → ")); break; }
  }
  problems.push(...validateTemplate(template, { skillsDir }));
  return { template, problems };
}

/** 结构校验：阶段/路线/产物/技能引用。 */
export function validateTemplate(t, { skillsDir = PKG_SKILLS_DIR } = {}) {
  const problems = [];
  if (!t || typeof t !== "object") return ["模板不是对象"];
  const phases = t.phases;
  if (!phases || typeof phases !== "object") return ["模板缺 phases"];
  for (const [id, p] of Object.entries(phases)) {
    if (!PHASE_IDS.includes(id)) problems.push("未知阶段：" + id + "（合法：" + PHASE_IDS.join("、") + "）");
    if (p && p.routes) {
      for (const r of p.routes) if (!KNOWN_ROUTES.includes(r)) problems.push("未知发现路线：" + r + "（合法：" + KNOWN_ROUTES.join("、") + "）");
    }
    // 只有「默认启用或必做」的阶段才强制 skill 存在：可选阶段可以先在 schema 里占位，
    // 等真正启用时（预设启用 / 用户打开）就必须有 skill —— 由 workflow-state 再查一次。
    const mustHaveSkill = !!(p && (p.required === true || p.enabledByDefault === true));
    if (mustHaveSkill && p.skill) {
      const f = join(skillsDir, p.skill, "SKILL.md");
      if (!existsSync(f)) problems.push("阶段 " + id + " 引用了不存在的 skill：" + p.skill);
    }
  }
  if (t.discovery && t.discovery.routes) {
    for (const r of t.discovery.routes) if (!KNOWN_ROUTES.includes(r)) problems.push("未知发现路线：" + r);
  }
  const arts = t.artifacts || {};
  for (const k of Object.keys(arts)) if (!ARTIFACT_KEYS.includes(k)) problems.push("未知产物键：" + k + "（合法：" + ARTIFACT_KEYS.join("、") + "）");
  return problems;
}

/** 读项目的工作流决定（`.sage/state.json` 的 workflow 段）；坏 JSON ⇒ 报错而不是静默。 */
export function readProjectWorkflow(root, { statePath = ".sage/state.json" } = {}) {
  const file = join(root, statePath);
  if (!existsSync(file)) return { config: {}, problems: [] };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return { config: (raw && raw.workflow) || {}, problems: [] };
  } catch (e) {
    return { config: {}, problems: ["状态文件不是合法 JSON：" + String((e && e.message) || e).slice(0, 100)] };
  }
}

/** 默认工作流决定（设置页的默认值；只存人的决定）。 */
export const DEFAULT_WORKFLOW_CONFIG = Object.freeze({
  template: "base",
  preset: "base",
  phases: { discovery: true, prototype: false, "tech-plan": false },
  routes: ["internal", "users"],
  strict: false,
  runKinds: { prototype: false, plan: false },
  paths: {},
});

/** 把全局设置（settings.workflow）映射成工作流决定的形状；只保留显式设置的键。 */
export function workflowConfigFromSettings(sw) {
  if (!sw || typeof sw !== "object") return {};
  const out = {};
  if (sw.template) out.template = sw.template;
  if (sw.preset) out.preset = sw.preset;
  const phases = {};
  if (typeof sw.discovery === "boolean") phases.discovery = sw.discovery;
  if (typeof sw.prototype === "boolean") phases.prototype = sw.prototype;
  if (typeof sw.techPlan === "boolean") phases["tech-plan"] = sw.techPlan;
  if (Object.keys(phases).length) out.phases = phases;
  if (Array.isArray(sw.routes) && sw.routes.length) out.routes = sw.routes;
  if (typeof sw.strict === "boolean") out.strict = sw.strict;
  const runKinds = {};
  if (typeof sw.runKindPrototype === "boolean") runKinds.prototype = sw.runKindPrototype;
  if (typeof sw.runKindPlan === "boolean") runKinds.plan = sw.runKindPlan;
  if (Object.keys(runKinds).length) out.runKinds = runKinds;
  return out;
}

/**
 * 合并决定（纯函数）：默认值 ← 全局设置 ← 项目 `.sage/state.json`（项目优先）。
 * 未知发现路线 ⇒ 进 problems（不静默采用）。
 */
export function resolveWorkflowConfig(raw, { global } = {}) {
  const fromSettings = workflowConfigFromSettings(global && global.workflow);
  const src = raw && typeof raw === "object" ? raw : {};
  // phases 不写默认值：未设置（undefined）表示「按模板预设的 enabledByDefault」。
  const phases = { ...(fromSettings.phases || {}), ...(src.phases || {}) };
  const runKinds = { ...DEFAULT_WORKFLOW_CONFIG.runKinds, ...(fromSettings.runKinds || {}), ...(src.runKinds || {}) };
  const paths = { ...(src.paths || {}) };
  let routes = Array.isArray(src.routes) && src.routes.length ? src.routes
    : Array.isArray(fromSettings.routes) && fromSettings.routes.length ? fromSettings.routes
      : [];
  const problems = [];
  const badRoutes = routes.filter((r) => !KNOWN_ROUTES.includes(r));
  if (badRoutes.length) problems.push("未知发现路线：" + badRoutes.join("、") + "（合法：" + KNOWN_ROUTES.join("、") + "）");
  routes = routes.filter((r) => KNOWN_ROUTES.includes(r));
  return {
    template: String(src.template || fromSettings.template || DEFAULT_WORKFLOW_CONFIG.template),
    preset: String(src.preset || fromSettings.preset || DEFAULT_WORKFLOW_CONFIG.preset),
    phases,
    routes,
    strict: src.strict === undefined ? fromSettings.strict === true : src.strict === true,
    runKinds,
    paths,
    problems,
  };
}
