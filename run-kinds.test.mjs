// 测试：run 的种类（lib/run-kinds.js）与 --kind 解析。
//
// 钉住三条纪律：① 阶段名沿用既有 PHASES，不加新词；② 认不出的 kind 返回 null（由建 run 处拒绝）；
// ③ prototype/plan 不得写生产代码（plan 连 implement 都不跑），K4 只约束 code。
// 运行：node run-kinds.test.mjs

import {
  RUN_KINDS, DEFAULT_RUN_KIND, KIND_LABELS_ZH, KIND_SPEC, normalizeKind, kindRoles, kindPhases,
  allowsProductionCode, forbidsSrc, validateKindSpecs,
} from "./lib/run-kinds.js";
import { PHASES, DEFAULT_ROLES, KNOWN_ROLES } from "./lib/vocab.js";
import { parseTeamCommand } from "./lib/command-parse.js";

let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};

console.log("# run 种类（code / prototype / plan）\n");

console.log("① 词表与自检");
check(RUN_KINDS.join(",") === "code,prototype,plan", "三种 kind 且顺序固定", RUN_KINDS.join(","));
check(DEFAULT_RUN_KIND === "code", "默认 kind 是 code");
check(RUN_KINDS.every((k) => KIND_LABELS_ZH[k] && KIND_SPEC[k]), "每种 kind 都有中文标签与裁剪表");
check(validateKindSpecs().length === 0, "阶段/编制全部落在既有词表里", validateKindSpecs().join("；") || "ok");

console.log("\n② 归一化：认得出就归一，认不出返回 null");
check(normalizeKind("plan") === "plan" && normalizeKind("PLAN") === "plan", "英文 id 大小写不敏感");
check(normalizeKind("原型型（低保真 + 走查）") === "prototype", "中文标签可归一");
check(normalizeKind("foo") === null && normalizeKind("") === null, "认不出的值返回 null（不静默退回默认）");

console.log("\n③ 阶段裁剪");
const proto = kindPhases("prototype");
const plan = kindPhases("plan");
check(proto.includes("clarify") && proto.includes("deliver"), "prototype 保留 clarify 与 deliver（不裁验收面）", proto.join(">"));
check(!plan.includes("implement") && !plan.includes("test"), "plan 不跑 implement / test", plan.join(">"));
check(plan.includes("spec-review") && plan.includes("方案确认"), "plan 保留 spec-review 与方案确认");
check(kindPhases("code") === null, "code 用档位决定的阶段（不额外裁剪）");
check([...(proto || []), ...(plan || [])].every((p) => PHASES.includes(p)), "所有阶段名都在 PHASES 里");

console.log("\n④ 编制与生产代码");
check(kindRoles("code") === null, "code 用 team 基线班底", DEFAULT_ROLES.join(","));
check(kindRoles("prototype").join(",") === "pm,ui,researcher,reviewer", "prototype 编制 4 人", kindRoles("prototype").join(","));
check(kindRoles("plan").join(",") === "pm,architect,researcher,dba,sec,devops", "plan 编制 6 人", kindRoles("plan").join(","));
check([...(kindRoles("prototype") || []), ...(kindRoles("plan") || [])].every((r) => KNOWN_ROLES.has(r)), "编制里的角色都在 KNOWN_ROLES");
check(allowsProductionCode("code") === true, "code 允许写生产代码");
check(allowsProductionCode("prototype") === false && allowsProductionCode("plan") === false, "prototype / plan 不允许写生产代码");
check(forbidsSrc("prototype") === true, "prototype 的产物不得进 src/");

console.log("\n⑤ kind 参数解析");
const p1 = parseTeamCommand("--kind plan 出技术方案");
check(p1.kind === "create" && p1.kindRaw === "plan", "--kind plan 解析为 kindRaw", JSON.stringify({ k: p1.kind, raw: p1.kindRaw }));
const p2 = parseTeamCommand("--kind=prototype 做低保真");
check(p2.kindRaw === "prototype", "--kind=xxx 等号写法");
const p3 = parseTeamCommand("--kind bogus 目标");
check(p3.kindRaw === "bogus", "未知值原样透传，交给建 run 处拒绝（不在解析层猜）");

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
