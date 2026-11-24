// run 的种类（kind）：**同一套 9 阶段，按交付物裁剪**（docs/sage/spec.md §1.4）。
//
// 为什么需要 kind：P3 原型与 P4 技术方案由 team 的专家团产出，但它们不是「实现生产代码」：
//   · prototype 的 implement = 写低保真页面，产物不得进 src/，SUMMARY 必须标「不可上生产」；
//   · plan 不跑 implement / test（没有代码），产物是文档，评审由 spec-review 完成。
// 三条纪律：
//   ① 阶段名全部沿用 vocab.js 的 PHASES，**不加新阶段词**；
//   ② 认不出的 kind **拒绝**，不静默退回 code（沉默 ≠ 允许）；
//   ③ K4（开发版 AGENTS）只约束 code；prototype / plan 用方案版 AGENTS。

import { PHASES, DEFAULT_ROLES, KNOWN_ROLES } from "./vocab.js";

export const RUN_KINDS = ["code", "prototype", "plan"];
export const DEFAULT_RUN_KIND = "code";

export const KIND_LABELS_ZH = {
  code: "实现型（写生产代码）",
  prototype: "原型型（低保真 + 走查）",
  plan: "方案型（技术方案，不写代码）",
};

/** 各 kind 的裁剪表：roles 是默认编制，phases 是该 kind 要跑的阶段。 */
export const KIND_SPEC = Object.freeze({
  code: {
    label: KIND_LABELS_ZH.code,
    roles: null, // 用 team 三档的默认班底
    phases: null, // 用 team 档位决定的阶段
    agentsMode: "dev",
    allowsProductionCode: true,
    archiveDir: null,
    note: "默认：写生产代码；implement 前需 K4（开发版 AGENTS）。",
  },
  prototype: {
    label: KIND_LABELS_ZH.prototype,
    roles: ["pm", "ui", "researcher", "reviewer"],
    phases: ["clarify", "design", "implement", "review", "test", "deliver"],
    agentsMode: "solution",
    allowsProductionCode: false,
    archiveDir: "docs/prototype",
    archiveFiles: ["UI.md", "PROTOTYPE.md", "REVIEW.md", "TEST.md", "SUMMARY.md"],
    note: "低保真页面与走查；产物不得进 src/，SUMMARY 必须标「不可上生产」。",
  },
  plan: {
    label: KIND_LABELS_ZH.plan,
    roles: ["pm", "architect", "researcher", "dba", "sec", "devops"],
    phases: ["clarify", "research", "design", "spec-review", "方案确认", "deliver"],
    agentsMode: "solution",
    allowsProductionCode: false,
    archiveDir: "docs/tech-plan",
    archiveFiles: ["PLAN.md", "REVIEW-SPEC.md", "SUMMARY.md"],
    note: "不跑 implement / test；产物是文档，评审由 spec-review 完成。",
  },
});

/** 归一化 kind：认英文 id 与中文标签；认不出返回 null（不猜）。 */
export function normalizeKind(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (RUN_KINDS.includes(s)) return s;
  for (const k of RUN_KINDS) {
    if (KIND_LABELS_ZH[k].toLowerCase().startsWith(s)) return k;
  }
  return null;
}

export function kindSpec(kind) {
  return KIND_SPEC[normalizeKind(kind) || DEFAULT_RUN_KIND];
}

export function kindRoles(kind) {
  return kindSpec(kind).roles;
}

export function kindPhases(kind) {
  return kindSpec(kind).phases;
}

export function allowsProductionCode(kind) {
  return kindSpec(kind).allowsProductionCode === true;
}

export function forbidsSrc(kind) {
  return kindSpec(kind).allowsProductionCode === false;
}

/** 自检：kind 的阶段与编制必须落在既有词表里（拼错一个阶段名就会静默跳过门禁）。 */
export function validateKindSpecs() {
  const problems = [];
  for (const k of RUN_KINDS) {
    const s = KIND_SPEC[k];
    if (s.phases) {
      for (const p of s.phases) if (!PHASES.includes(p)) problems.push('kind "' + k + '" 的阶段 "' + p + '" 不在 PHASES');
      if (!s.phases.includes("clarify") || !s.phases.includes("deliver")) problems.push('kind "' + k + '" 必须含 clarify 与 deliver（不裁验收面）');
    }
    if (s.roles) {
      for (const r of s.roles) if (!KNOWN_ROLES.has(r)) problems.push('kind "' + k + '" 的角色 "' + r + '" 不在 KNOWN_ROLES');
    }
  }
  return problems;
}

/** code kind 的默认编制就是 team 的基线班底（保持原行为）。 */
export function defaultRolesForKind(kind) {
  return kindRoles(kind) || DEFAULT_ROLES;
}
