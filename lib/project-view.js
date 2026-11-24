// 项目链的只读视图载荷（驾驶舱 / dock 共用）：把 deriveProjectState 的产物压成稳定字段。
//
// 为什么单独一层：客户端不该懂 gate 内部结构；字段名改一次要能只改这里，客户端不跟着抖。
// 纯函数：状态进、视图出；不读文件、不发请求。

import { dockLine, STEP_LABELS_ZH } from "./project-state.js";

/** 下一步的一句话（人话，不是 id）。 */
export function nextText(state) {
  if (!state || !state.next) return "";
  const label = state.next.label || STEP_LABELS_ZH[state.next.id] || state.next.id;
  const missing = (state.next.missing || []).slice(0, 2).join("；");
  return missing ? label + "（缺：" + missing + "）" : label;
}

/** 项目链视图载荷（客户端只认这些字段）。 */
export function projectPayload(state) {
  if (!state) return { ok: false, isProject: false };
  return {
    ok: true,
    isProject: state.isProject === true,
    stage: state.stage,
    stageLabel: state.stage === "P5" ? "实施（N 个 run）" : (STEP_LABELS_ZH[state.stage] || state.stage),
    dock: dockLine(state),
    next: nextText(state),
    gates: state.gates || {},
    steps: Object.entries(state.steps || {}).map(([id, s]) => ({
      id,
      label: STEP_LABELS_ZH[id] || id,
      ok: s.ok === true,
      skipped: s.skipped === true,
      reason: s.skipped ? String(s.reason || "") : "",
      missing: (s.missing || []).slice(0, 4),
    })),
    agents: state.agents || {},
    skips: state.skips || [],
    counts: state.counts || {},
  };
}
