// 测试：项目级门禁（lib/project-gates.js）与模板契约。
//
// 钉住的纪律：判据只认工件里已有的字段；判不出 ⇒ 报缺项；绝不把「模板里有这句话」当成通过。
// 运行：node project-gates.test.mjs

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  gateK1, gateK2, gateK3, gateK4, gateG1, gateG2, gateG3, gateG4,
  parseKickoff, parseAgents, parsePrd, parseTechPlan, parsePrototype, parseDecisions,
  listItems, checkTemplateContract, REQUIRED_TEMPLATE_HEADINGS,
} from "./lib/project-gates.js";

const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};
const body = (n) => "（说明）" + "本段是真实内容而非占位。".repeat(Math.max(1, n) + 2) + "。";

const KICKOFF = [
  "# 项目章程（定稿）",
  "> 确认日期：2026-11-19",
  "> 确认方式：项目负责人对 7 条 P0 逐条回答",
  "## 1. 基本信息",
  "建设主体：某公司。",
  "## 2. 监督对象与边界",
  "### 明确不做（首期）",
  "- 不做人员定位",
  "- 不做轨迹分析",
  "- 不做全量外事审批",
  "- 不做证照实物管理",
  "- 不做独立 APP",
  "## 3. 现状",
  "现状说明。",
  "## 4. 数据与合规",
  "数据说明。",
  "## 5. 用户与场景",
  "用户说明。",
  "## 6. 成功标准",
  "指标说明。",
  "## 7. 决策与评审",
  "拍板人：书记",
  "## 8. 待确认项",
  "1. 密级。",
  "## 9. 关联文件",
  "- decisions.md",
].join("\n");

const AGENTS = [
  "# 项目规则（AGENTS.md v0.3）",
  "> 生效日期：2026-11-19",
  "> 依据：tasks/00-kickoff.md + decisions.md。",
  "## 项目定位", body(1),
  "## 已确认边界", body(1),
  "## 当前阶段", body(1),
  "## 硬约束", "3. 不外发：内部资料不得发送到外部模型或外部网站。",
  "## 证据标准", body(1),
  "## 门禁", body(1),
  "## 冲突优先级", body(1),
].join("\n");

const PRD = [
  "# PRD",
  "## 目标用户", "- 主用户：外事专办员。", "- 非目标用户：因私出国人员。", body(1),
  "## 痛点与现状证据", "- 痛点一，来源见调研。", body(1),
  "## 竞品结论", "- 竞品 A/B/C 的结论。", body(1),
  "## 形态", "- 候选 A：企微小程序。", "- 候选 B：独立 APP。", "- 选择 A。", body(1),
  "## MVP",
  "### 必做（≤7 项）", "- 行前教育", "- 考核", "- 证照台账",
  "### 非目标 / 暂不做", "- 不做大屏炫技",
  "## 成功指标", "- 完成率 ≥95%（口径：周统计，达标线 95%）。", body(1),
].join("\n");

const TECH = [
  "# 技术方案",
  "## 架构", body(1),
  "## 集成", body(1),
  "## 部署", body(1),
  "## AI", body(1),
  "## 安全", body(1),
  "## 成本", body(1),
  "## 降级方案", "- 无大模型时用规则与人工审核。",
  "## 评审记录", "- 评审人：书记。", "- 结论：通过。",
].join("\n");

const PROTO = [
  "# 原型",
  "## 信息架构", "- 员工端 Tab：行程 / 学习 / 助手 / 我的。", body(1),
  "## 黄金路径",
  "- 路径 1：入口 → 填报 → 提交",
  "- 路径 2：入口 → 学习 → 考核",
  "- 路径 3：管理端 → 预警 → 处置",
  "## 低保真",
  "- 屏 1", "- 屏 2", "- 屏 3", "- 屏 4", "- 屏 5",
  "- 屏 6", "- 屏 7", "- 屏 8", "- 屏 9", "- 屏 10",
  "## 走查", "- 参与用户：3 名真实用户。", "- 卡点清单：无 P0。", "- P0 清零。",
].join("\n");

const DECISIONS = [
  "# 关键决策记录",
  "| 编号 | 日期 | 决策 | 依据 | 状态 |",
  "|---|---|---|---|---|",
  "| D-001 | 2026-11-19 | MVP 与明确不做已定 | 负责人确认 | 已确认 |",
  "| D-002 | 2026-11-19 | 原型评审通过 | 走查记录 | 已确认 |",
  "| D-003 | 2026-11-19 | 技术方案与立项通过 | 评审记录 | 已确认 |",
  "| D-004 | 2026-11-19 | 切换开发版 AGENTS | 归档完成 | 已确认 |",
].join("\n");

const COMPETITORS = [
  "# 竞品调研",
  "## 3. 产品/案例卡片（15 个）",
  "### 2.1 卡片一",
  "- 外事类：A 产品。",
  "### 2.2 卡片二",
  "- 海外安全类：B 产品。",
  "### 2.3 卡片三",
  "- 培训类：C 产品。",
  "### 2.4 卡片四",
  "- 纪检类：D 产品。",
  "（其余卡片略，证据等级按 A/B 记录，未核实处标注待核实。）",
].join("\n");

console.log("# 项目级门禁：K1–K4 / G1–G4\n");

console.log("① 模板契约（模板是判据字段的来源）");
const templates = {};
for (const name of Object.keys(REQUIRED_TEMPLATE_HEADINGS)) {
  try { templates[name] = await readFile(join(here, "assets/project", name), "utf8"); } catch { templates[name] = ""; }
}
const missing = checkTemplateContract(templates);
check(missing.length === 0, "六份模板覆盖全部必备标题", missing.join("；") || "ok");

console.log("\n② K1 资料基线");
check(gateK1({ inputNames: ["制度.docx", "沟通.md"], baselineText: "不外发。" + "基线内容足够长。".repeat(20) + "覆盖制度.docx 与 沟通.md", sourceNames: ["制度-全文.md"] }).ok, "资料齐 + 有覆盖 + 有只读声明 ⇒ 通过");
check(gateK1({ inputNames: [], baselineText: "" }).missing.length >= 2, "无资料、无基线 ⇒ 报缺项");

console.log("\n③ K2 章程定稿");
check(gateK2({ kickoffText: KICKOFF, draftText: "", decisionsText: DECISIONS }).ok, "日期 / 9 节 / 不做 5 条 / 拍板人齐 ⇒ 通过");
check(gateK2({ kickoffText: KICKOFF.replace("拍板人：书记", ""), draftText: "", decisionsText: DECISIONS }).ok === false, "缺拍板人 ⇒ 拒绝");

console.log("\n④ K3 方案版 AGENTS");
check(gateK3({ agentsText: AGENTS, kickoffText: KICKOFF }).ok, "七块齐 + 指向 kickoff + 不外发 ⇒ 通过");
check(gateK3({ agentsText: AGENTS.replace("## 冲突优先级", "## 其他"), kickoffText: KICKOFF }).missing.some((m) => m.includes("必备章节")), "缺冲突优先级 ⇒ 报必备章节");

console.log("\n⑤ K4 开发版切换");
const DEV_AGENTS = AGENTS.replace("v0.3", "v1.0").replace("## 当前阶段", "> 开发期：是\n## 当前阶段");
check(gateK4({ agentsText: DEV_AGENTS, decisionsText: DECISIONS, archiveNames: ["AGENTS-solution-v0.3.md"] }).ok, "版本 + 开发期 + 归档 + 决策 ⇒ 通过");
check(gateK4({ agentsText: DEV_AGENTS, decisionsText: DECISIONS, archiveNames: [] }).ok === false, "无归档 ⇒ 拒绝");

console.log("\n⑥ G1 发现");
const routes = { policy: body(2), competitors: COMPETITORS, users: body(2), form: body(2) };
const synthesis = "## 结论\n" + body(2) + "\n## 形态\n- 候选 A\n- 候选 B";
check(gateG1({ routes, competitorText: COMPETITORS, synthesisText: synthesis }).ok, "四路 + 15 卡片 + 4 类 + 综合 + 形态候选 ⇒ 通过");
check(gateG1({ routes: { ...routes, users: "" }, competitorText: COMPETITORS, synthesisText: synthesis }).ok === false, "缺用户调研 ⇒ 拒绝");

console.log("\n⑦ G2 / G3 / G4");
check(gateG2({ prdText: PRD, decisionsText: DECISIONS }).ok, "PRD 六节 + MVP≤7 + 非目标 + 指标口径 ⇒ 通过");
check(gateG2({ prdText: PRD.replace("### 非目标 / 暂不做", "### 其他"), decisionsText: DECISIONS }).missing.some((m) => m.includes("非目标")), "缺非目标 ⇒ 拒绝");
check(gateG3({ prototypeText: PROTO, decisionsText: DECISIONS }).ok, "信息架构 + 3 路径 + 10 屏 + 3 用户 + P0 清零 ⇒ 通过");
check(gateG3({ prototypeText: PROTO.replace("- 路径 3：管理端 → 预警 → 处置", ""), decisionsText: DECISIONS }).missing.some((m) => m.includes("黄金路径")), "少一条黄金路径 ⇒ 拒绝");
check(gateG4({ techPlanText: TECH, decisionsText: DECISIONS }).ok, "六块 + 降级 + 评审记录 ⇒ 通过");
check(gateG4({ techPlanText: TECH.replace("## 降级方案", "## 其他"), decisionsText: DECISIONS }).missing.some((m) => m.includes("降级")), "缺降级方案 ⇒ 拒绝");

console.log("\n⑧ 真实写法兼容（CDI 的两处）");
const BOLD_NOTDO = KICKOFF.replace("### 明确不做（首期）", "**明确不做（首期）**");
check(gateK2({ kickoffText: BOLD_NOTDO, draftText: "", decisionsText: DECISIONS }).ok, "粗体小标题「明确不做」也能读出 5 条");
const TABLE_FORM = "## 结论\n" + body(2) + "\n| G1-1 | 移动端形态 | M1 小程序 / M2 小程序+H5 / M3 H5 为主 | M3 |";
check(gateG1({ routes, competitorText: COMPETITORS, synthesisText: TABLE_FORM }).ok, "表格里的 M1/M2/M3 记为 3 个形态候选");

console.log("\n⑨ 占位符不算数");
check(listItems("- （待填）\n- （待填）") === 0, "「（待填）」列表项不计入条数");
check(parseDecisions(DECISIONS).filter((r) => /已确认/.test(r.status)).length === 4, "决策表解析出 4 条已确认");

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
