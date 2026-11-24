// run 产物「提升」到项目级路径（C3b）：deliver 之后把 prototype / plan 的产物复制到
// docs/prototype、docs/tech-plan，并写下 .archive.json 记住是哪个 run 产出的。
//
// 为什么不在 deliver 那一刻同步做：team 没有单一的「完成钩子」（阶段由 lead 推进），
// 所以做成**幂等 reconcile**：每次 /team status 或建 run 前跑一遍，已归档的跳过。
// 三条纪律：
//   ① 只复制 run-kinds 里声明过的文件名（不把整个 run 目录倒进项目）；
//   ② 缺件如实记进 manifest 的 missing，不假装成功；
//   ③ 用 manifest 里的 runId 判幂等，重复调用不改写文件。

import { copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { KIND_SPEC, normalizeKind } from "./run-kinds.js";

export const ARCHIVE_MANIFEST = ".archive.json";

/** 完成的 run 状态（与 team 本身的写法保持一致）。 */
const COMPLETE = new Set(["complete", "completed", "done"]);

/** kind 的归档映射（纯函数）：from = run 目录里的文件名，to = 项目级相对路径。 */
export function archiveTargets(kind) {
  const k = normalizeKind(kind);
  if (!k || !KIND_SPEC[k] || !KIND_SPEC[k].archiveDir) return [];
  const dir = KIND_SPEC[k].archiveDir;
  return (KIND_SPEC[k].archiveFiles || []).map((name) => ({ from: name, to: join(dir, name) }));
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function readJson(p) {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; }
}

/**
 * 归档一个已完成的 run（幂等）。
 * @param cwd - 项目根目录。
 * @param runDir - team/<runId> 目录。
 * @param state - 该 run 的 STATE.json 内容。
 * @param now - 注入时间（测试用）。
 * @returns { archived, skipped, missing, manifest }
 */
export async function archiveRun({ cwd, runDir, state, now = new Date().toISOString(), write = null } = {}) {
  // 写入必须走调用方的受控入口（artifact-writer）：本模块**不做直写**（write-bypass 棘轮盯着 lib/）。
  if (typeof write !== "function") return { archived: [], skipped: true, missing: ["缺少受控写入函数（write）"], manifest: null };
  const kind = normalizeKind(state && state.kind);
  const targets = archiveTargets(kind);
  if (targets.length === 0) return { archived: [], skipped: true, missing: [], manifest: null };
  const runId = String((state && state.runId) || "");
  if (!runId) return { archived: [], skipped: true, missing: ["STATE.json 缺 runId"], manifest: null };
  if (!COMPLETE.has(String(state.status || "").toLowerCase())) return { archived: [], skipped: true, missing: [], manifest: null };

  const manifestPath = join(cwd, KIND_SPEC[kind].archiveDir, ARCHIVE_MANIFEST);
  const prev = await readJson(manifestPath);
  const present = [];
  for (const t of targets) {
    if (await exists(join(runDir, t.from))) present.push(t);
  }
  const missing = targets.filter((t) => !present.includes(t)).map((t) => t.from);
  // 幂等：同一个 run 已归档过、且目标文件都在 ⇒ 什么都不做（不刷新时间戳）。
  if (prev && prev.runId === runId && prev.files && prev.files.length === present.length) {
    const allThere = await Promise.all(present.map((t) => exists(join(cwd, t.to))));
    if (allThere.every(Boolean) && (prev.missing || []).join(",") === missing.join(",")) {
      return { archived: [], skipped: true, missing, manifest: prev };
    }
  }
  await mkdir(join(cwd, KIND_SPEC[kind].archiveDir), { recursive: true });
  const archived = [];
  for (const t of present) {
    await copyFile(join(runDir, t.from), join(cwd, t.to));
    archived.push(t.to.replace(/\\\\/g, "/"));
  }
  const manifest = {
    kind,
    runId,
    archivedAt: now,
    files: archived,
    missing,
    ...(prev && prev.runId && prev.runId !== runId ? { previousRunId: prev.runId } : {}),
  };
  await write(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return { archived, skipped: false, missing, manifest };
}

/** 扫 team/：把已完成的 prototype / plan run 归档（幂等，best-effort 由调用方兜住异常）。 */
export async function reconcileArchives(cwd, { now, write = null } = {}) {
  let dirs = [];
  try { dirs = await readdir(join(cwd, "team")); } catch { return []; }
  const out = [];
  for (const name of dirs) {
    if (name.startsWith(".")) continue;
    const runDir = join(cwd, "team", name);
    const state = await readJson(join(runDir, "STATE.json"));
    if (!state) continue;
    const kind = normalizeKind(state.kind);
    if (!kind || kind === "code") continue;
    const r = await archiveRun({ cwd, runDir, state, now, write });
    if (!r.skipped) out.push({ runId: name, ...r });
  }
  return out;
}
