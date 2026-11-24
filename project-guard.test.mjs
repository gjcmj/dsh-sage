// 测试：项目级 R1（建 run ≥P2）与 R2（src/ 写入 ≥P4+K4）。
//
// 钉住：① legacy 工作区放行（不误伤只想跑小任务的人）；② 不是项目 ⇒ 放行；
// ③ 缺 G4/K4 时 src/ 写入被 deny 且理由带缺项；④ 门禁异常 ⇒ 放行 + 留痕（绝不做故障源）；
// ⑤ 下游已 deny 时不插嘴。
// 运行：node project-guard.test.mjs

import { isUnderSrc, runCreationVerdict, productionVerdict, createProductionGuard } from "./lib/project-guard.js";
import { parseTeamCommand } from "./lib/command-parse.js";

let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};

const STATE_PROJECT = { isProject: true, gates: { G2: false, G4: false }, steps: { K4: { ok: false } }, next: { id: "G2", label: "产品定义", missing: ["PRD 不存在"] } };
const STATE_P2 = { isProject: true, gates: { G2: true, G4: false }, steps: { K4: { ok: false } } };
const STATE_OK = { isProject: true, gates: { G2: true, G4: true }, steps: { K4: { ok: true } } };
const LEGACY = { isProject: false, gates: {}, steps: {} };

console.log("# 项目级 R1 / R2\n");

console.log("① src 路径判定");
check(isUnderSrc("/p", "/p/src/a.js") === true, "src/a.js 在生产目录内");
check(isUnderSrc("/p", "/p/src2/a.js") === false, "src2/a.js 不在（前缀不能误判）");
check(isUnderSrc("/p", "/p/docs/src.md") === false, "docs/src.md 不在");
check(isUnderSrc("/p", "/p/src") === true, "src 目录自身算在内");

console.log("\n② R1：建 run");
check(runCreationVerdict(LEGACY).ok === true, "legacy 工作区（无项目工件）放行", "legacy");
check(runCreationVerdict(STATE_PROJECT).ok === false, "项目链未到 P2 ⇒ 拒绝");
check(runCreationVerdict(STATE_PROJECT).missing[0].includes("下一步"), "拒绝理由指出下一步", runCreationVerdict(STATE_PROJECT).missing[0]);
check(runCreationVerdict(STATE_P2).ok === true, "到 P2 后允许建 run");
check(runCreationVerdict(STATE_PROJECT, { standalone: true }).waived === true, "--standalone 显式豁免");

console.log("\n③ R2：src 写入");
check(productionVerdict(LEGACY).ok === true, "legacy 放行");
check(productionVerdict(STATE_P2).ok === false, "只有 G2、缺 G4/K4 ⇒ 拒绝");
check(productionVerdict(STATE_P2).missing.length === 2, "两项缺项都列出", productionVerdict(STATE_P2).missing.join("；"));
check(productionVerdict(STATE_OK).ok === true, "G4 + K4 都过 ⇒ 放行");

function makeGuard(state, opts = {}) {
  const events = [];
  const guard = createProductionGuard({
    cwdFor: () => "/proj",
    stateFor: async () => state,
    onEvent: (type) => events.push(type),
    ...opts,
  });
  return { guard, events };
}
const execSrc = { name: "write", arguments: { file_path: "src/app.js" } };
const nextAllow = async () => ({ kind: "allow" });

console.log("\n④ 守卫：pre-execute 判定");
const g1 = makeGuard(STATE_P2);
const d1 = await g1.guard(execSrc, nextAllow);
check(d1.kind === "deny", "缺 G4/K4 时 src 写入被 deny", d1.kind);
check(String(d1.reason).includes("缺项"), "理由里带缺项", String(d1.reason).slice(0, 60));
check(g1.events.includes("production-denied"), "拒绝被留痕");

const g2 = makeGuard(STATE_OK);
check((await g2.guard(execSrc, nextAllow)).kind === "allow", "G4+K4 都过 ⇒ 放行");

const g3 = makeGuard(STATE_P2);
check((await g3.guard({ name: "write", arguments: { file_path: "docs/readme.md" } }, nextAllow)).kind === "allow", "非 src 路径不拦");

check((await makeGuard(LEGACY).guard(execSrc, nextAllow)).kind === "allow", "legacy 工作区不拦");

console.log("\n⑤ 降级与不插嘴");
const g4 = makeGuard(STATE_P2, { stateFor: async () => { throw new Error("boom"); } });
const d4 = await g4.guard(execSrc, nextAllow);
check(d4.kind === "allow" && g4.events.includes("production-gate-error"), "状态推导异常 ⇒ 放行 + 留痕（不做故障源）", JSON.stringify(g4.events));

const g5 = makeGuard(STATE_P2);
const d5 = await g5.guard(execSrc, async () => ({ kind: "deny", reason: "下游更严" }));
check(d5.kind === "deny" && d5.reason === "下游更严", "下游已 deny ⇒ 原样返回（最严格优先）");

console.log("\n⑥ --standalone 解析");
check(parseTeamCommand("--standalone 做个脚本").standalone === true, "--standalone 可解析");
check(parseTeamCommand("普通任务").standalone === false, "默认 false");

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
