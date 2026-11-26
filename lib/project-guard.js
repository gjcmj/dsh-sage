// 项目级门禁的两道执行（docs/sage/spec.md §4）：
//   · R1 建 run：PRD 未定稿 ⇒ 拒绝建 run（--standalone 例外）；
//   · R2 生产代码：PRD 未定稿或缺开发版 AGENTS ⇒ **写盘之前**拦 src/ 下的写入。
//
// 三条纪律（与 artifact-ownership.js 的 R1 归属门同一口径）：
//   ① 门禁绝不允许成为工具故障源：任何异常 ⇒ 放行 + 留痕；
//   ② 判定不出来（不是项目 / 取不到状态）⇒ 放行（fail-open，宁可漏拦）；
//   ③ 放行要留痕：降级必须可见，不能"没报错"被读成"检查过了"。
//
// ⚠️ 命名：本仓既有「R1 工件归属门」（run 内谁写哪个工件）。这里的 R1/R2 是**项目级**，
// 代码里一律写「项目级 R1 / 项目级 R2」，避免与归属门混淆。

import { resolve, sep } from "node:path";
import { targetOf } from "./interception.js";

/** 目标是否落在 <cwd>/<srcDir> 之下（含自身）。 */
export function isUnderSrc(cwd, abs, srcDir = "src") {
  if (!cwd || !abs) return false;
  const root = resolve(cwd, srcDir);
  const target = resolve(abs);
  return target === root || target.startsWith(root + sep);
}

/**
 * 项目级 R1：建 run 的判定（纯函数）。
 * @param state - deriveWorkflowState 的产物。
 * @param opts.standalone - 显式一次性任务（跳过项目链）。
 * @returns { ok, waived?, legacy?, missing? }
 */
export function runCreationVerdict(state, { standalone = false } = {}) {
  if (standalone) return { ok: true, waived: true };
  if (!state || state.isProject !== true) return { ok: true, legacy: true };
  if (state.prd && state.prd.finalOk === true) return { ok: true };
  const next = state.next ? state.next.label : 'PRD 定稿';
  return {
    ok: false,
    missing: [
      'PRD 未定稿：下一步是 ' + next,
      ...((state.prd && state.prd.missingFinal) || []).slice(0, 3),
    ],
  };
}

/** 项目级 R2：src/ 写入的判定（纯函数）。 */
export function productionVerdict(state) {
  if (!state || state.isProject !== true) return { ok: true, legacy: true };
  const missing = [];
  if (!state.prd || state.prd.finalOk !== true) missing.push('PRD 未定稿（定稿后才允许写生产代码）');
  if (!state.agents || state.agents.devMode !== true) missing.push('缺开发版 AGENTS（进入开发前必须切换并归档方案版）');
  return { ok: missing.length === 0, missing };
}

/**
 * 创建 tools/pre-execute 监听器（写盘之前拦）。
 * @param deps.cwdFor(exec) - 会话工作区；取不到 ⇒ 放行。
 * @param deps.stateFor(cwd) - 推导项目状态（由调用方注入，便于测试与缓存）。
 * @param deps.srcDir - 生产代码目录（默认 src）。
 * @param deps.onEvent(type, payload) - 观测（降级/拒绝都要看得见）。
 */
export function createProductionGuard(deps = {}) {
  const { cwdFor = () => null, stateFor = async () => null, srcDir = "src", onEvent = () => {} } = deps;
  const trace = (type, payload) => { try { onEvent(type, payload); } catch { /* 观测失败不影响工具 */ } };

  return async function productionGuard(exec, next) {
    try {
      const downstream = typeof next === "function" ? await next() : { kind: "allow" };
      if (downstream && downstream.kind && downstream.kind !== "allow") return downstream;

      const raw = targetOf(exec);
      if (!raw) return { kind: "allow" };
      const cwd = cwdFor(exec);
      if (!cwd) return { kind: "allow" };
      if (!isUnderSrc(cwd, resolve(cwd, raw), srcDir)) return { kind: "allow" };

      const state = await stateFor(cwd);
      if (!state) {
        trace("production-gate-degraded", { abs: raw, why: "state-unavailable" });
        return { kind: "allow" };
      }
      const verdict = productionVerdict(state);
      if (verdict.legacy) return { kind: "allow" };
      if (!verdict.ok) {
        trace("production-denied", { abs: raw, missing: verdict.missing });
        return {
          kind: "deny",
          reason: [
            '⛔ 项目级 R2：src/ 下的写入被拦（项目链未到 P4 或缺开发版 AGENTS）。',
            '- 缺项：' + verdict.missing.join('；'),
            '- 依据：技术方案与开发版 AGENTS 是写生产代码的前置。先走完 P4 / K4，或在 decisions.md 里**显式 skip** 并写理由。',
          ].join('\n'),
        };
      }
      return { kind: "allow" };
    } catch (e) {
      trace("production-gate-error", { message: String((e && e.message) || e) });
      return { kind: "allow" };
    }
  };
}
