// 测试：项目链视图载荷（lib/project-view.js）。
//
// 钉住：① 客户端只认稳定字段；② skip 仍标记为 skipped（不伪装成 ✓）；③ 下一步是「人话 + 缺项」，
// 不是裸 id；④ 没有项目工件 ⇒ isProject=false（dock 不渲染）。
// 运行：node project-view.test.mjs

import { projectPayload, nextText } from "./lib/project-view.js";

let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};

const STATE = {
  isProject: true,
  stage: "G2",
  gates: { G0: true, G1: true, G2: false, G3: false, G4: false },
  next: { id: "G2", label: "产品定义", missing: ["PRD 不存在（docs/PRD.md）", "MVP「必做」为空"] },
  agents: { version: "0.3", devMode: false, effective: "2026-11-19" },
  skips: [{ id: "G3", reason: "小项目" }],
  counts: { inputs: 5, sources: 1, decisions: 15, prototypes: 0 },
  steps: {
    K1: { ok: true, skipped: false, missing: [] },
    K2: { ok: true, skipped: false, missing: [] },
    K3: { ok: true, skipped: false, missing: [] },
    G1: { ok: true, skipped: false, missing: [] },
    G2: { ok: false, skipped: false, missing: ["PRD 不存在（docs/PRD.md）"] },
    G3: { ok: true, skipped: true, reason: "小项目", missing: [] },
  },
};

console.log("# 项目链视图载荷\n");

const p = projectPayload(STATE);
check(p.ok === true && p.isProject === true, "项目载荷可用");
check(p.stage === "G2" && p.stageLabel === "产品定义", "阶段与中文标签", p.stageLabel);
check(p.gates.G1 === true && p.gates.G2 === false, "门禁原样透出");
check(p.steps.length === 6, "步骤数一致", String(p.steps.length));
check(p.steps[5].skipped === true && p.steps[5].reason === "小项目", "skip 保留理由，不当成 ✓");
check(p.dock.includes("章程定稿✓") && p.dock.includes("原型评审(skip)"), "dock 行含完成与 skip", p.dock);
check(p.next.includes("产品定义") && p.next.includes("缺："), "下一步是人话 + 缺项", p.next);
check(p.agents.devMode === false, "AGENTS 版本透出");

console.log("\n② 空/非项目");
const empty = projectPayload(null);
check(empty.ok === false && empty.isProject === false, "null ⇒ 不可用");
const legacy = projectPayload({ isProject: false, stage: "K1", steps: {}, gates: {} });
check(legacy.isProject === false && legacy.stage === "K1", "legacy 有阶段但 isProject=false（dock 不渲染）");

console.log("\n③ nextText");
check(nextText({ next: null }) === "", "没有下一步 ⇒ 空串");
check(nextText({ next: { id: "G4", label: "立项", missing: [] } }) === "立项", "无缺项只给标签");

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
