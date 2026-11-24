// 测试：项目级状态推导（lib/project-state.js）。
//
// 钉住的重点：① 状态从工件推导，不靠状态文件记账；② 状态文件只存「人的决定」（跳过 / standalone）；
// ③ 跳过必须显式写理由，且显示成 skip 而不是 ✓；④ 当前阶段永远是可解释的「第一个未过步骤」。
// 运行：node project-state.test.mjs

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveProjectState, dockLine } from "./lib/project-state.js";

let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};
const body = () => "（说明）" + "本段是真实内容而非占位。".repeat(3) + "。";

async function makeProject(files) {
  const root = await mkdtemp(join(tmpdir(), "sage-proj-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    await mkdir(join(p, ".."), { recursive: true });
    await writeFile(p, content, "utf8");
  }
  return root;
}

const KICKOFF = [
  "# 项目章程（定稿）",
  "> 确认日期：2026-11-19",
  "> 确认方式：项目负责人逐条回答",
  "## 1. 基本信息", body(),
  "## 2. 监督对象与边界", "### 明确不做（首期）",
  "- 不做定位", "- 不做轨迹", "- 不做全量审批", "- 不做证照实物", "- 不做独立 APP",
  "## 3. 现状", body(), "## 4. 数据与合规", body(), "## 5. 用户与场景", body(),
  "## 6. 成功标准", body(), "## 7. 决策与评审", "拍板人：书记",
  "## 8. 待确认项", "1. 密级", "## 9. 关联文件", "- decisions.md",
].join("\n");

const AGENTS_SOLUTION = [
  "# 项目规则（AGENTS.md v0.3）",
  "> 生效日期：2026-11-19",
  "> 依据：tasks/00-kickoff.md + decisions.md。",
  "## 项目定位", body(), "## 已确认边界", body(), "## 当前阶段", body(),
  "## 硬约束", "3. 不外发：内部资料不得发送到外部模型或外部网站。",
  "## 证据标准", body(), "## 门禁", body(), "## 冲突优先级", body(),
].join("\n");

const AGENTS_DEV = AGENTS_SOLUTION.replace("v0.3", "v1.0").replace("## 当前阶段", "> 开发期：是\n## 当前阶段");

const PRD = [
  "# PRD",
  "## 目标用户", "- 主用户：专办员。", "- 非目标用户：因私人员。", body(),
  "## 痛点与现状证据", "- 痛点一，带来源。", body(),
  "## 竞品结论", "- 竞品 A/B/C。", body(),
  "## 形态", "- 候选 A", "- 候选 B", "- 选择 A", body(),
  "## MVP", "### 必做（≤7 项）", "- 行前教育", "- 考核", "- 证照台账",
  "### 非目标 / 暂不做", "- 不做大屏",
  "## 成功指标", "- 完成率 ≥95%（口径：周统计，达标线 95%）。", body(),
].join("\n");

const ROUTES = {
  "research/10-industry-policy.md": body(),
  "research/20-competitors.md": "## 3. 产品/案例卡片（15 个）\n### 卡片一\n- 外事\n### 卡片二\n- 海外安全\n### 卡片三\n- 培训\n### 卡片四\n- 纪检\n（其余卡片略；未核实处标注待核实，证据按 A/B 记录。）",
  "research/30-users-requirements.md": body(),
  "research/40-form-interaction.md": body(),
  "research/99-synthesis.md": "## 结论\n" + body() + "\n## 形态\n- 候选 A\n- 候选 B",
};

const PROTOTYPE = [
  "# 原型",
  "## 信息架构", "- 员工端 Tab：行程 / 学习 / 助手 / 我的。", body(),
  "## 黄金路径", "- 路径 1", "- 路径 2", "- 路径 3",
  "## 低保真", "- 屏 1", "- 屏 2", "- 屏 3", "- 屏 4", "- 屏 5", "- 屏 6", "- 屏 7", "- 屏 8", "- 屏 9", "- 屏 10",
  "## 走查", "- 参与用户：3 名真实用户。", "- P0 清零。",
].join("\n");

const TECH = [
  "# 技术方案",
  "## 架构", body(), "## 集成", body(), "## 部署", body(), "## AI", body(), "## 安全", body(), "## 成本", body(),
  "## 降级方案", "- 无大模型时走规则 + 人工。",
  "## 评审记录", "- 结论：通过。",
].join("\n");

const DECISIONS = [
  "# 关键决策记录",
  "| 编号 | 日期 | 决策 | 依据 | 状态 |",
  "|---|---|---|---|---|",
  "| D-001 | 2026-11-19 | MVP 与明确不做已定 | 负责人 | 已确认 |",
  "| D-002 | 2026-11-19 | 原型评审通过 | 走查 | 已确认 |",
  "| D-003 | 2026-11-19 | 技术方案与立项通过 | 评审 | 已确认 |",
].join("\n");

const FULL = {
  "inputs/制度.md": "内部资料，只读。",
  "research/sources/制度-全文.md": "抽取文本。",
  "research/00-资料理解与基线.md": "不外发。" + body() + "覆盖制度.md",
  "tasks/00-kickoff-draft.md": "【待确认】密级。",
  "tasks/00-kickoff.md": KICKOFF,
  "AGENTS.md": AGENTS_SOLUTION,
  "decisions.md": DECISIONS,
  "docs/PRD.md": PRD,
  "docs/tech-plan/TECH-PLAN.md": TECH,
  "docs/prototype/PROTOTYPE.md": PROTOTYPE,
  ...ROUTES,
};

console.log("# 项目级状态推导\n");

console.log("① 空目录 ⇒ 停在 K1，并说明缺什么");
const empty = await makeProject({});
const s0 = await deriveProjectState(empty);
check(s0.stage === "K1", "stage == K1", s0.stage);
check(s0.next && s0.next.missing.length > 0, "下一步缺项非空", (s0.next && s0.next.missing.join("；")) || "");

console.log("\n② 走完 P0–P4（方案版 AGENTS）⇒ 停在 K4");
const full = await makeProject(FULL);
const s1 = await deriveProjectState(full);
check(s1.stage === "K4", "stage == K4（等开发版 AGENTS）", s1.stage);
check(s1.gates.G2 === true && s1.gates.G4 === true, "G2 / G4 通过");
check(s1.agents.devMode === false, "生效的是方案版 AGENTS");

console.log("\n③ 显式 skip P3/P4 ⇒ 视为通过，但标记 skipped 且带理由");
await mkdir(join(full, ".sage"), { recursive: true });
await writeFile(join(full, ".sage/state.json"), JSON.stringify({ skips: { G3: { reason: "小项目，不做原型" }, G4: { reason: "复用现有架构" } } }), "utf8");
const s2 = await deriveProjectState(full);
check(s2.stage === "K4", "skip 后仍到 K4", s2.stage);
check(s2.steps.G3.ok === true && s2.steps.G3.skipped === true, "G3 标记 skipped");
check(s2.steps.G3.reason.includes("小项目"), "理由保留在状态里", s2.steps.G3.reason);

console.log("\n④ 开发版 AGENTS + 归档 + 决策 ⇒ 到 P5");
await writeFile(join(full, "AGENTS.md"), AGENTS_DEV, "utf8");
await mkdir(join(full, "docs/agents"), { recursive: true });
await writeFile(join(full, "docs/agents/AGENTS-solution-v0.3.md"), AGENTS_SOLUTION, "utf8");
await writeFile(join(full, "decisions.md"), DECISIONS + "\n| D-004 | 2026-11-20 | 切换开发版 AGENTS | 归档完成 | 已确认 |", "utf8");
const s3 = await deriveProjectState(full);
check(s3.stage === "P5", "stage == P5", s3.stage);
check(s3.agents.devMode === true && s3.agents.version === "1.0", "生效的是开发版 AGENTS v1.0");

console.log("\n⑤ dock 一行");
check(dockLine(s3).includes("资料") && dockLine(s3).includes("开发版 AGENTS"), "包含项目链步骤名");
check(!dockLine(s2).includes("原型评审✓"), "skip 项不显示成 ✓", dockLine(s2));

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
