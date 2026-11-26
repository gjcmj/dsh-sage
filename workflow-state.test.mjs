// 测试：工作流状态推导（lib/workflow-state.js）。
//
// 钉住：① 产物推导（不记账）；② PRD 草案 ≠ 定稿；③ 可选阶段默认不出现；启用但缺产物 ⇒ 缺项；
// ④ 开发段以「是否存在 team run」为完成标志；⑤ 模板/预设问题如实上报。
// 运行：node workflow-state.test.mjs

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveWorkflowState, dockLine } from "./lib/workflow-state.js";

let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};
const body = () => "（说明）" + "这是一段真实内容而不是占位符。".repeat(3) + "。";

const KICKOFF = ["# 章程", "> 确认日期：2026-11-26", "> 确认方式：负责人逐条回答", "拍板人：书记", "## 非目标", "- 不做定位", "- 不做大屏", "- 不做实物证照"].join("\n");
const AGENTS = ["# AGENTS", "## 项目定位", body(), "## 边界", body(), "## 当前阶段", body(), "## 硬约束", body(), "## 证据", body(), "## 门禁", body(), "## 冲突优先级", body()].join("\n");

const PRD_DRAFT = ["# PRD", "> 状态：草案 ｜ 版本 v0.1",
"## 背景与问题", body(), "## 目标与非目标", "- 目标", "- 非目标", body(), "## 用户与角色", "- 用户", body(),
"## 场景与任务", "- 场景", body(), "## 痛点与证据", "- 痛点（来源）", body(), "## 价值与收益", body(),
"## 亮点与差异化", "- 亮点一：谁关心=书记；痛点=重复考核；怎么做=变化包；怎么证明=时长下降", "- 亮点二：谁关心=管理员；痛点=台账靠人盯；怎么做=到期提醒；怎么证明=触达率", "- 亮点三：谁关心=领导；痛点=看不见全局；怎么做=一屏三问；怎么证明=周活",
"## 功能范围", "本段说明范围取舍的原则与边界，保证不是只有列表。", "### 必做（≤7）", "- 教育", "### 非目标 / 暂不做", "- 不做定位",
"## 形态与交互", body(), "## 数据与权限", body(), "## 指标与验收", "指标必须带口径与反 game，下面两行是示例。", "- 完成率 ≥95%（口径：周）", "反 game：10% 抽检",
"## 里程碑与依赖", body(), "## 风险与假设", body(), "## 开放问题与决策", "本段列出所有未决问题与已拍板决策，逐条给出责任人。", "- 待确认：密级",
"## 证据与参考", body()].join("\n");

const PRD_FINAL = PRD_DRAFT
  .replace("状态：草案", "状态：定稿 v1.0")
  .replace("- 待确认：密级", "- 无：已清零")
  .replace("## 证据与参考", "## 失败定义\n本段明写怎样算失败，避免验收退化成演示。\n- 预警无人处置 ⇒ 失败\n## 证据与参考");

const DECISIONS = "| D-001 | 2026-11-26 | PRD v1.0 定稿 | 负责人确认 | 已确认 |";

async function project(files) {
  const root = await mkdtemp(join(tmpdir(), "sage-wf-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    await mkdir(join(p, ".."), { recursive: true });
    await writeFile(p, content, "utf8");
  }
  return root;
}

console.log("# 工作流状态推导\n");

console.log("① 空目录：停在 kickoff，发现阶段也缺产物");
const empty = await project({});
const s0 = deriveWorkflowState(empty);
check(s0.isProject === false, "空目录 isProject=false");
check(s0.next && s0.next.id === "kickoff", "next=kickoff", JSON.stringify(s0.next));
check(s0.phases.find((p) => p.id === "discovery").done === false, "发现缺产物");
check(s0.phases.find((p) => p.id === "prototype").skipped === true, "原型默认 skip");
check(s0.problems.filter((p) => p.includes("skill")).length === 0, "默认模板无 skill 缺失问题", s0.problems.join("；") || "ok");

console.log("\n② 章程 + AGENTS + 调研 ⇒ 到 PRD 草案");
const base = {
  "tasks/00-kickoff.md": KICKOFF, "AGENTS.md": AGENTS, "research/00-baseline.md": "调研产物",
};
const root = await project(base);
const s1 = deriveWorkflowState(root);
check(s1.phases.find((p) => p.id === "kickoff").done === true, "kickoff 完成");
check(s1.phases.find((p) => p.id === "discovery").done === true, "discovery 完成");
check(s1.next.id === "prd", "next=prd", JSON.stringify(s1.next));

console.log("\n③ 草案 ≠ 定稿");
await mkdir(join(root, "docs"), { recursive: true });
await writeFile(join(root, "docs/PRD.md"), PRD_DRAFT, "utf8");
const s2 = deriveWorkflowState(root);
check(s2.prd.status === "draft" && s2.prd.finalOk === false, "PRD 草案：finalOk=false");
check(s2.next.id === "prd", "仍停在 prd（要定稿）", JSON.stringify(s2.next));
check(dockLine(s2).includes("PRD进行中"), "dock 显示 PRD 进行中", dockLine(s2));

console.log("\n④ 定稿 + 决策 ⇒ 交接开发");
await writeFile(join(root, "docs/PRD.md"), PRD_FINAL, "utf8");
await writeFile(join(root, "decisions.md"), DECISIONS, "utf8");
const s3 = deriveWorkflowState(root);
check(s3.prd.finalOk === true && s3.prd.status === "final", "PRD 定稿通过");
check(s3.next.id === "dev", "next=dev（等启动 run）", JSON.stringify(s3.next));
check(s3.agents.devMode === false, "仍是方案版 AGENTS（开发前要切换）");

console.log("\n⑤ 有 team run ⇒ 开发段完成");
await mkdir(join(root, "team/run-1"), { recursive: true });
await writeFile(join(root, "team/run-1/STATE.json"), "{}", "utf8");
const s4 = deriveWorkflowState(root);
check(s4.phases.find((p) => p.id === "dev").done === true, "dev 完成（有 run）");
check(s4.next === null, "没有下一步（全绿）");

console.log("\n⑥ 设置：关闭发现 / 启用原型");
await mkdir(join(root, ".sage"), { recursive: true });
await writeFile(join(root, ".sage/state.json"), JSON.stringify({ workflow: { phases: { discovery: false, prototype: true }, preset: "base" } }), "utf8");
// 用一个空的 skills 目录，模拟「启用了某可选阶段、但对应 skill 没装」。
const s5 = deriveWorkflowState(join(root), { skillsDir: join(root, "no-skills") });
check(s5.phases.find((p) => p.id === "discovery").skipped === true, "关闭发现 ⇒ skip");
check(s5.phases.find((p) => p.id === "prototype").skipped === false, "启用原型 ⇒ 出现在阶段里");
check(s5.phases.find((p) => p.id === "prototype").done === false, "原型无产物 ⇒ 未完成");
check(s5.problems.some((p) => p.includes("prototype")), "启用但缺 skill ⇒ 如实上报", s5.problems.join("；"));

console.log("\n⑦ 未知预设 ⇒ 报错不静默");
const s6 = deriveWorkflowState(root, { workflowDir: join(root, "nope") });
check(s6.problems.some((p) => p.includes("base.yml")), "缺 base.yml 上报", s6.problems.join("；"));

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
