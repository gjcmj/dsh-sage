// 项目级链（K1–K4 / G1–G4）的路径配置：默认认领 CDI 现状，可用 `.sage/config.json` 覆盖。
//
// 为什么单独成模块：门禁、状态推导、驾驶舱三处都要读同一套路径；散着写就是第二份事实。
// 本模块只做「合并默认值 + 读配置」，不判断任何业务语义。

import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** 默认路径（对齐 CDI 项目现状，见 docs/sage/decisions.md D-010）。 */
export const DEFAULT_PROJECT_PATHS = Object.freeze({
  inputs: "inputs",
  research: "research",
  researchSources: "research/sources",
  baseline: "research/00-资料理解与基线.md",
  kickoffDraft: "tasks/00-kickoff-draft.md",
  kickoff: "tasks/00-kickoff.md",
  agents: "AGENTS.md",
  agentsArchiveDir: "docs/agents",
  decisions: "decisions.md",
  prd: "docs/PRD.md",
  techPlan: "docs/tech-plan/TECH-PLAN.md",
  prototypeDir: "docs/prototype",
  prototypeDoc: "docs/prototype/PROTOTYPE.md",
  stateFile: ".sage/state.json",
  configFile: ".sage/config.json",
});

/** 合并配置（纯函数）；未知键原样保留，缺省键用默认值补齐。 */
export function resolveProjectPaths(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = { ...DEFAULT_PROJECT_PATHS };
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
  }
  return out;
}

/** 读 `.sage/config.json`（不存在或坏掉 ⇒ 全默认，并给出 note，不抛错）。 */
export async function readProjectConfig(root) {
  const file = join(root, DEFAULT_PROJECT_PATHS.configFile);
  try {
    const text = await readFile(file, "utf8");
    const raw = JSON.parse(text);
    return { paths: resolveProjectPaths(raw.paths), notes: [] };
  } catch (e) {
    const note = e && e.code === "ENOENT" ? null : `配置读取失败，按默认值继续：${String((e && e.message) || e).slice(0, 120)}`;
    return { paths: resolveProjectPaths(null), notes: note ? [note] : [] };
  }
}
