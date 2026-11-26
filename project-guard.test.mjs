// 测试：项目级 R1（建 run 需 PRD 定稿）与 R2（写 src 需 PRD 定稿 + 开发版 AGENTS）。
//
// 钉住：① legacy 放行；② 未定稿 ⇒ R1 拒绝 / R2 deny；③ 门禁异常 ⇒ 放行 + 留痕；
// ④ 下游已 deny 不插嘴；⑤ --standalone 豁免。
// 运行：node project-guard.test.mjs

import { isUnderSrc, runCreationVerdict, productionVerdict, createProductionGuard } from "./lib/project-guard.js";
import { parseTeamCommand } from "./lib/command-parse.js";

let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};

const DRAFT = { isProject: true, prd: { finalOk: false, status: "draft", missingFinal: ["状态未改为定稿", "开放问题未清零"] }, agents: { devMode: false }, next: { id: "prd", label: "PRD", missing: ["状态未改为定稿"] } };
const FINAL_SOLUTION = { isProject: true, prd: { finalOk: true, status: "final", missingFinal: [] }, agents: { devMode: false }, next: { id: "dev", label: "开发（team）", missing: [] } };
const FINAL_DEV = { isProject: true, prd: { finalOk: true, status: "final", missingFinal: [] }, agents: { devMode: true }, next: null };
const LEGACY = { isProject: false };

console.log("# 项目级 R1 / R2\n");

console.log("① src 路径判定");
check(isUnderSrc("/p", "/p/src/a.js") === true, "src/a.js 在生产目录内");
check(isUnderSrc("/p", "/p/src2/a.js") === false, "src2/a.js 不在（前缀不能误判）");
check(isUnderSrc("/p", "/p/docs/src.md") === false, "docs/src.md 不在");
check(isUnderSrc("/p", "/p/src") === true, "src 目录自身算在内");

console.log("\n② R1：建 run");
check(runCreationVerdict(LEGACY).ok === true, "legacy 放行");
check(runCreationVerdict(DRAFT).ok === false, "PRD 草案 ⇒ 拒绝建 run");
check(runCreationVerdict(DRAFT).missing[0].includes("PRD 未定稿"), "拒绝理由说明 PRD 未定稿", runCreationVerdict(DRAFT).missing[0]);
check(runCreationVerdict(FINAL_SOLUTION).ok === true, "PRD 定稿后允许建 run");
check(runCreationVerdict(DRAFT, { standalone: true }).waived === true, "--standalone 显式豁免");

console.log("\n③ R2：src 写入");
check(productionVerdict(LEGACY).ok === true, "legacy 放行");
check(productionVerdict(FINAL_SOLUTION).ok === false, "定稿但方案版 AGENTS ⇒ 拒绝");
check(productionVerdict(FINAL_SOLUTION).missing.some((m) => m.includes("开发版 AGENTS")), "缺开发版 AGENTS 被列出");
check(productionVerdict(FINAL_DEV).ok === true, "定稿 + 开发版 ⇒ 放行");

function makeGuard(state, opts = {}) {
  const events = [];
  const guard = createProductionGuard({ cwdFor: () => "/proj", stateFor: async () => state, onEvent: (t) => events.push(t), ...opts });
  return { guard, events };
}
const execSrc = { name: "write", arguments: { file_path: "src/app.js" } };
const nextAllow = async () => ({ kind: "allow" });

console.log("\n④ 守卫");
const g1 = makeGuard(DRAFT);
const d1 = await g1.guard(execSrc, nextAllow);
check(d1.kind === "deny", "未定稿 ⇒ deny", d1.kind);
check(String(d1.reason).includes("缺项"), "理由带缺项", String(d1.reason).slice(0, 50));
check(g1.events.includes("production-denied"), "拒绝被留痕");
const g2 = makeGuard(FINAL_DEV);
check((await g2.guard(execSrc, nextAllow)).kind === "allow", "定稿+开发版 ⇒ 放行");
check((await makeGuard(DRAFT).guard({ name: "write", arguments: { file_path: "docs/readme.md" } }, nextAllow)).kind === "allow", "非 src 不拦");
check((await makeGuard(LEGACY).guard(execSrc, nextAllow)).kind === "allow", "legacy 不拦");

console.log("\n⑤ 降级与不插嘴");
const g4 = makeGuard(DRAFT, { stateFor: async () => { throw new Error("boom"); } });
check((await g4.guard(execSrc, nextAllow)).kind === "allow" && g4.events.includes("production-gate-error"), "状态异常 ⇒ 放行 + 留痕");
const d5 = await makeGuard(DRAFT).guard(execSrc, async () => ({ kind: "deny", reason: "下游更严" }));
check(d5.kind === "deny" && d5.reason === "下游更严", "下游 deny ⇒ 原样返回");

console.log("\n⑥ --standalone 解析");
check(parseTeamCommand("--standalone 做个脚本").standalone === true, "--standalone 可解析");
check(parseTeamCommand("普通任务").standalone === false, "默认 false");

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
