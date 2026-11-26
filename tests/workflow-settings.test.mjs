// 测试：工作流设置（lib/settings.js 的 workflow 组 + lib/workflow-config.js 的合并优先级）。
//
// 钉住：① 设置项只在 spec 一处（默认值 / 可空 / 中文标签）；② 非法值整体拒绝并如实报错；
// ③ 优先级：默认 < 全局设置 < 项目 .sage/state.json；④ 未设置的阶段开关 = 按模板预设；
// ⑤ 未知路线报错并列出合法值；⑥ 设置真的驱动状态推导（关发现 ⇒ skip）。
// 运行：node workflow-settings.test.mjs

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SETTINGS_SPEC, SETTINGS_GROUPS, defaultSettings, normalizeSettings, settingsSchema } from "../lib/settings.js";
import { workflowConfigFromSettings, resolveWorkflowConfig, KNOWN_ROUTES } from "../lib/workflow-config.js";
import { deriveWorkflowState } from "../lib/workflow-state.js";

let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};

console.log("# 工作流设置\n");

console.log("① spec 单源");
check(SETTINGS_GROUPS.includes("workflow"), "workflow 组存在");
const items = Object.keys(SETTINGS_SPEC.workflow.items);
check(items.length === 9, "9 个设置项", items.join("、"));
check(items.every((k) => SETTINGS_SPEC.workflow.items[k].label && SETTINGS_SPEC.workflow.items[k].hint), "每项都有中文标签与说明");
const d = defaultSettings().workflow;
check(d.template === "base" && d.preset === "base", "默认模板/预设");
check(d.discovery === null && d.prototype === null && d.techPlan === null, "阶段开关默认 null（= 按预设）", JSON.stringify(d));
check(d.strict === false && d.runKindPrototype === false && d.runKindPlan === false, "严格模式与 run 种类默认关");
const schema = settingsSchema().find((g) => g.group === "workflow");
check(schema && schema.items.length === 9, "schema 透出 9 项");
check(schema.items.find((i) => i.key === "discovery").nullable === true, "可空开关在 schema 里标明");

console.log("\n② 校验：非法值整体拒绝并说明");
const bad = normalizeSettings({ workflow: { preset: "nope", prototype: "yes" } });
check(bad.repaired.length === 2, "两项都被拒绝", JSON.stringify(bad.repaired));
check(bad.settings.workflow.preset === "base" && bad.settings.workflow.prototype === null, "坏值回落默认（不半套生效）");
const good = normalizeSettings({ workflow: { preset: "internal-platform", discovery: false, techPlan: true, runKindPlan: true } });
check(good.repaired.length === 0 && good.settings.workflow.preset === "internal-platform", "合法值被接受");
check(good.settings.workflow.discovery === false && good.settings.workflow.techPlan === true, "布尔开关生效");

console.log("\n③ 设置 → 决定的映射");
const mapped = workflowConfigFromSettings(defaultSettings().workflow);
check(mapped.preset === "base" && mapped.template === "base", "模板/预设映射");
check(!("phases" in mapped), "null 开关不写进决定（留给模板默认）", JSON.stringify(mapped.phases));
const mapped2 = workflowConfigFromSettings({ discovery: false, prototype: true, routes: ["internal"], strict: true, runKindPlan: true });
check(mapped2.phases.discovery === false && mapped2.phases.prototype === true, "布尔开关映射");
check(mapped2.strict === true && mapped2.runKinds.plan === true, "严格模式 / run 种类映射");

console.log("\n④ 优先级：默认 < 全局 < 项目");
const both = resolveWorkflowConfig({ preset: "base", phases: { prototype: false } }, { global: { workflow: { preset: "software", prototype: true, discovery: false } } });
check(both.preset === "base", "项目预设覆盖全局");
check(both.phases.prototype === false, "项目开关覆盖全局");
check(both.phases.discovery === false, "全局开关保留（项目未写）");

console.log("\n⑤ 未知路线");
const badRoute = resolveWorkflowConfig({}, { global: { workflow: { routes: ["internal", "weird"] } } });
check(badRoute.problems.some((p) => p.includes("weird") && p.includes("合法")), "未知路线报错并列出合法值", badRoute.problems.join("；"));
check(!badRoute.routes.includes("weird"), "非法路线被剔除");
check(KNOWN_ROUTES.includes("competitors"), "合法路线常量可引用");

const body = () => "（说明）" + "这是一段真实内容而不是占位符。".repeat(3) + "。";
const KICK = ["# 章程", "> 确认日期：2026-11-26", "> 确认方式：负责人确认", "拍板人：负责人", "## 非目标", "- 不做 A", "- 不做 B", "- 不做 C"].join("\n");
const AG = ["# AGENTS", "## 项目定位", body(), "## 边界", body(), "## 当前阶段", body(), "## 硬约束", body(), "## 证据", body(), "## 门禁", body(), "## 冲突优先级", body()].join("\n");
async function project(files) {
  const root = await mkdtemp(join(tmpdir(), "sage-wfs-"));
  for (const [rel, c] of Object.entries(files)) {
    const p = join(root, rel);
    await mkdir(join(p, ".."), { recursive: true });
    await writeFile(p, c, "utf8");
  }
  return root;
}

console.log("\n⑥ 设置驱动状态：关发现 ⇒ skip");
const root = await project({ "tasks/00-kickoff.md": KICK, "AGENTS.md": AG, "research/00.md": "资料" });
const s1 = deriveWorkflowState(root, { settings: { workflow: { discovery: false } } });
check(s1.phases.find((p) => p.id === "discovery").skipped === true, "发现阶段 skip");
check(s1.config.routes.length > 0, "路线回落到模板默认", JSON.stringify(s1.config.routes));

console.log("\n⑦ 预设默认：internal-platform 开技术方案（未设置时）");
const s2 = deriveWorkflowState(root, { settings: { workflow: { preset: "internal-platform" } } });
const tp = s2.phases.find((p) => p.id === "tech-plan");
check(tp.skipped === false, "技术方案阶段出现（模板 enabledByDefault=true）", JSON.stringify({ skipped: tp.skipped, missing: tp.missing }));
check(s2.config.routes.includes("policy"), "发现路线来自预设（含 policy）", JSON.stringify(s2.config.routes));

console.log("\n⑧ 显式关闭优先于预设");
const s3 = deriveWorkflowState(root, { settings: { workflow: { preset: "internal-platform", techPlan: false } } });
check(s3.phases.find((p) => p.id === "tech-plan").skipped === true, "显式 false 覆盖预设默认");

console.log("\n⑨ 软前置接线（源码级）");
const src = await (await import("node:fs/promises")).readFile(join(import.meta.dirname || ".", "..", "lib", "command.js"), "utf8");
check(src.includes("wcfg.strict === true"), "R1 建 run 读严格模式开关");
check(src.includes("mode.r1Warn"), "严格模式关时只提示（r1Warn）");
check(src.includes("runKinds") && src.includes("run 种类「"), "run 种类未启用 ⇒ 拒绝并指向设置");
check(src.includes("strict: ((currentSettings() || {}).workflow || {}).strict === true"), "R2 守卫读严格模式开关");

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
