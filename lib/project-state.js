// 项目级状态：**从工件推导**，不记账（docs/sage/decisions.md D-004）。
//
// 为什么推导而不是维护状态文件：手工改文件、skill 单独跑、换项目时，状态文件必然和文件打架；
// 唯一要持久化的是「人做的决定」——跳过某一步、接受某条假设、切开发版 AGENTS 的时间戳。
// 状态文件里没有「当前阶段」这个字段，阶段永远是本模块算出来的。
//
// IO 与判据分离：判据在 project-gates.js（纯函数），这里只负责读文件、拼事实、套用人的决定。

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  gateK1, gateK2, gateK3, gateK4, gateG1, gateG2, gateG3, gateG4,
  parseAgents, parseDecisions, REQUIRED_TEMPLATE_HEADINGS, checkTemplateContract,
} from "./project-gates.js";
import { readProjectConfig } from "./project-config.js";

/** 项目链的顺序（K4 是 P5 的入场门，所以排在 G4 之后）。 */
export const PROJECT_SEQUENCE = ["K1", "K2", "K3", "G1", "G2", "G3", "G4", "K4"];

export const STEP_LABELS_ZH = {
  K1: "资料基线", K2: "章程定稿", K3: "方案版 AGENTS",
  G1: "发现", G2: "产品定义", G3: "原型评审", G4: "立项", K4: "开发版 AGENTS",
};

async function readText(file) {
  try { return await readFile(file, "utf8"); } catch { return null; }
}

async function listDir(dir) {
  try { return (await readdir(dir)).filter((n) => !n.startsWith(".")); } catch { return []; }
}

async function readStateFile(root, stateFile) {
  const text = await readText(join(root, stateFile));
  if (text === null) return { decisions: {}, notes: [] };
  try {
    const raw = JSON.parse(text);
    return { decisions: raw && typeof raw === "object" ? raw : {}, notes: [] };
  } catch (e) {
    return { decisions: {}, notes: ["状态文件不是合法 JSON，按「没有决定」继续：" + String(e.message).slice(0, 100)] };
  }
}

/**
 * 推导项目状态。
 * @param root - 项目根目录。
 * @returns 每一步的结果、门禁、当前阶段、下一步缺项、生效的 AGENTS 版本。
 */
export async function deriveProjectState(root) {
  const cfg = await readProjectConfig(root);
  const p = cfg.paths;
  const notes = [...cfg.notes];
  const [kickoffText, draftText, agentsText, decisionsText, prdText, techPlanText, prototypeText, baselineText] = await Promise.all([
    readText(join(root, p.kickoff)), readText(join(root, p.kickoffDraft)), readText(join(root, p.agents)),
    readText(join(root, p.decisions)), readText(join(root, p.prd)), readText(join(root, p.techPlan)),
    readText(join(root, p.prototypeDoc)), readText(join(root, p.baseline)),
  ]);
  const [inputNames, sourceNames, agentsArchive, prototypeFiles] = await Promise.all([
    listDir(join(root, p.inputs)), listDir(join(root, p.researchSources)), listDir(join(root, p.agentsArchiveDir)), listDir(join(root, p.prototypeDir)),
  ]);
  const routes = {
    policy: await readText(join(root, p.research, "10-industry-policy.md")),
    competitors: await readText(join(root, p.research, "20-competitors.md")),
    users: await readText(join(root, p.research, "30-users-requirements.md")),
    form: await readText(join(root, p.research, "40-form-interaction.md")),
  };
  const synthesisText = await readText(join(root, p.research, "99-synthesis.md"));

  const steps = {
    K1: gateK1({ inputNames, baselineText: baselineText || "", sourceNames }),
    K2: gateK2({ kickoffText: kickoffText || "", draftText: draftText || "", decisionsText: decisionsText || "" }),
    K3: gateK3({ agentsText: agentsText || "", kickoffText: kickoffText || "", archiveNames: agentsArchive }),
    G1: gateG1({ routes: { policy: routes.policy || "", competitors: routes.competitors || "", users: routes.users || "", form: routes.form || "" }, competitorText: routes.competitors || "", synthesisText: synthesisText || "" }),
    G2: gateG2({ prdText: prdText || "", decisionsText: decisionsText || "" }),
    G3: gateG3({ prototypeText: prototypeText || "", decisionsText: decisionsText || "" }),
    G4: gateG4({ techPlanText: techPlanText || "", decisionsText: decisionsText || "" }),
    K4: gateK4({ agentsText: agentsText || "", decisionsText: decisionsText || "", archiveNames: agentsArchive }),
  };

  const st = await readStateFile(root, p.stateFile);
  notes.push(...st.notes);
  const skips = st.decisions && st.decisions.skips && typeof st.decisions.skips === "object" ? st.decisions.skips : {};
  const finalSteps = {};
  for (const [id, res] of Object.entries(steps)) {
    const skip = skips[id];
    const reason = skip && typeof skip === "object" ? String(skip.reason || "").trim() : "";
    finalSteps[id] = reason ? { ...res, ok: true, skipped: true, reason } : res;
  }

  // K4 是入场门，不参与「当前阶段」的推进：前面的步骤全过之后，阶段才停在 K4 等待切换。
  const current = PROJECT_SEQUENCE.find((id) => !finalSteps[id].ok) || null;
  const agents = parseAgents(agentsText || "");
  const decisionsRows = parseDecisions(decisionsText || "");
  return {
    root,
    paths: p,
    steps: finalSteps,
    gates: { G0: finalSteps.K3.ok, G1: finalSteps.G1.ok, G2: finalSteps.G2.ok, G3: finalSteps.G3.ok, G4: finalSteps.G4.ok },
    stage: current || "P5",
    next: current ? { id: current, label: STEP_LABELS_ZH[current], missing: finalSteps[current].missing } : null,
    agents: { version: agents.version, devMode: agents.devMode, effective: agents.effective },
    skips: Object.entries(skips).map(([id, v]) => ({ id, reason: String((v && v.reason) || "") })),
    // 是否「在走项目链」：有任何项目级工件才算项目；一无所有 ⇒ legacy 工作区（门禁放行，只提示）。
    isProject: Boolean((kickoffText || '').trim() || (agentsText || '').trim() || inputNames.length > 0),
    counts: { inputs: inputNames.length, sources: sourceNames.length, prototypes: prototypeFiles.length, decisions: decisionsRows.length },
    notes,
  };
}

/** 一行进度（dock 用）：资料✓ → 章程✓ → AGENTS✓ → 发现进行中。 */
export function dockLine(state) {
  const order = ["K1", "K2", "K3", "G1", "G2", "G3", "G4", "K4"];
  // 只有「第一个没过」的步骤算进行中；后面的都是待办 —— 否则 dock 会把还没轮到的步骤
  // 说成"进行中"，那是假信号（用户会以为四个阶段同时在跑）。
  const current = order.find((id) => !(state.steps[id] && state.steps[id].ok)) || null;
  const parts = order.map((id) => {
    const s = state.steps[id];
    if (!s) return STEP_LABELS_ZH[id] + "待办";
    if (s.ok && s.skipped) return STEP_LABELS_ZH[id] + "(skip)";
    if (s.ok) return STEP_LABELS_ZH[id] + "✓";
    return STEP_LABELS_ZH[id] + (id === current ? "进行中" : "待办");
  });
  return parts.join(" → ");
}

/** 读模板并做契约检查（模板是判据字段的来源，缺字段即红）。 */
export async function checkTemplatesAgainstGates(templatesDir) {
  const names = Object.keys(REQUIRED_TEMPLATE_HEADINGS);
  const map = {};
  for (const name of names) {
    const text = await readText(join(templatesDir, name));
    map[name] = text === null ? "" : text;
  }
  return { missing: checkTemplateContract(map), templates: map };
}
