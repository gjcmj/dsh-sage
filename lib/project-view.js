// 工作流视图载荷：把 deriveWorkflowState 压成客户端稳定字段（看板/dock 共用）。
//
// 客户端只认这些字段；改字段只改这里。`steps` 是过渡兼容字段（旧 dock/strip 用），
// K5 统一看板落地后会改成 `phases`（两者同源，避免两份数据）。

import { dockLine } from "./workflow-state.js";

/** 下一步的一句话（人话 + 前两个缺项）。 */
export function nextText(state) {
  if (!state || !state.next) return "";
  const label = state.next.label || state.next.id;
  const missing = (state.next.missing || []).slice(0, 2).join("；");
  return missing ? label + "（缺：" + missing + "）" : label;
}

/** 工作流视图载荷。 */
export function projectPayload(state) {
  if (!state) return { ok: false, isProject: false };
  const phases = state.phases || [];
  const steps = phases.map((p) => ({
    id: p.id,
    label: p.label,
    ok: p.done === true,
    skipped: p.skipped === true,
    reason: p.skipped ? String(p.reason || "") : "",
    missing: (p.missing || []).slice(0, 4),
  }));
  const prd = state.prd || {};
  return {
    ok: true,
    isProject: state.isProject === true,
    stage: state.next ? state.next.id : "dev",
    stageLabel: state.next ? state.next.label : "实施（team）",
    dock: dockLine(state),
    next: nextText(state),
    phases,
    steps,
    prd: {
      status: prd.status || "unknown",
      version: prd.version || null,
      draftOk: prd.draftOk === true,
      finalOk: prd.finalOk === true,
      openQuestions: prd.openQuestions || 0,
      dimensions: prd.dimensions || { filled: 0, total: 18, missing: [] },
      highlights: prd.highlights || { count: 0, complete: 0 },
      scope: prd.scope || { must: 0, nonGoals: 0 },
      metrics: prd.metrics || { has: false, hasCaliber: false, hasAntiGame: false },
    },
    ready: {
      prdCoverage: prd.dimensions ? prd.dimensions.filled + "/" + prd.dimensions.total : "0/18",
      openQuestions: prd.openQuestions || 0,
      highlights: prd.highlights ? prd.highlights.complete : 0,
      conflicts: 0,
      traceRate: 0,
    },
    workflow: state.template || null,
    agents: state.agents || {},
    counts: state.counts || {},
    problems: state.problems || [],
  };
}
