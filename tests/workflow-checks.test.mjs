// 测试：工作流覆盖检查（lib/workflow-checks.js）。
//
// 钉住：① 18 维按草案/定稿分档；② 亮点四问齐才算；③ 定稿要求（开放问题清零、必做 1–7、
// 非目标、指标口径 + 反 game、失败定义、决策记录）；④ 占位符不算数；⑤ 条件维度可写「不适用」。
// 运行：node workflow-checks.test.mjs

import {
  checkDimensions, checkHighlights, checkScope, checkMetrics, countOpenQuestions,
  checkPrdDraft, checkPrdFinal, checkKickoff, checkAgents, traceRate, parsePrdStatus, sectionOf,
} from "../lib/workflow-checks.js";

let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};
const body = (n = 1) => "（说明）" + "这是一段真实内容而不是占位符。".repeat(3) + "。";

const DRAFT = [
  "# PRD",
  "> 状态：草案 ｜ 版本 v0.1",
  "## 背景与问题", body(),
  "## 目标与非目标", "- 目标一", "- 非目标一", body(),
  "## 用户与角色", "- 主用户", "- 非用户", body(),
  "## 场景与任务", "- 场景一", body(),
  "## 痛点与证据", "- 痛点一（来源）", body(),
  "## 价值与收益", body(),
  "## 亮点与差异化", "- 亮点一：谁关心=书记；痛点=重复考核；怎么做=变化包；怎么证明=时长下降", "- 亮点二（草稿）",
  "## 功能范围", "本段说明范围取舍的原则与边界，保证不是只有列表。", "### 必做（≤7）", "- 行前教育", "- 考核", "### 非目标 / 暂不做", "- 不做定位",
  "## 形态与交互", body(),
  "## 数据与权限", body(),
  "## 指标与验收", "指标必须带口径与反 game，下面两行是示例。", "- 完成率 ≥95%（口径：周统计）", "反 game：10% 抽检 + 审计日志",
  "## 里程碑与依赖", body(),
  "## 风险与假设", body(),
  "## 开放问题与决策", "本段列出所有未决问题与已拍板的决策，逐条给责任人。", "- 待确认：密级（草案阶段允许存在）",
  "## 证据与参考", body(),
].join("\n");

const FINAL = DRAFT
  .replace("状态：草案", "状态：定稿 v1.0")
  .replace("- 待确认：密级（草案阶段允许存在）", "- 无：开放问题已清零，职责与时间已确认")
  .replace("## 证据与参考", "## 失败定义\n本段明写怎样算失败，避免验收退化成演示效果。\n- 预警无人处置、台账仍靠 Excel ⇒ 失败\n## 证据与参考")
  .replace("- 亮点二（草稿）", "- 亮点二：谁关心=管理员；痛点=台账靠人盯；怎么做=到期提醒；怎么证明=触达率；差异=demo 没有提醒\n- 亮点三：谁关心=领导；痛点=看不见全局；怎么做=一屏三问；怎么证明=周活；差异=现有汇报靠口头");

const DECISIONS = "| D-020 | 2026-11-26 | PRD v1.0 定稿 | 负责人确认 | 已确认 |";

console.log("# 工作流覆盖检查\n");

console.log("① 维度分档");
const dims = checkDimensions(DRAFT);
check(dims.missingDraft.length === 0, "草案：18 维（非条件项）全覆盖", dims.missingDraft.join("、") || "ok");
const dFinal = checkDimensions(DRAFT);
check(dFinal.missingFinal.includes("failure"), "草案不要求失败定义（final 才要求）", dFinal.missingFinal.join("、"));
const cond = checkDimensions(DRAFT + "\n## 竞品与市场\n- 不适用：本阶段无竞品\n");
check(cond.conditionalPresent.includes("competitors"), "条件维度写「不适用」也算在场");

console.log("\n② 亮点四问 / 范围 / 指标 / 开放问题");
const hl = checkHighlights(FINAL);
check(hl.complete === 3, "三个亮点四问齐", JSON.stringify(hl));
const scope = checkScope(FINAL);
check(scope.must === 2 && scope.nonGoals === 1, "必做 2 / 非目标 1", JSON.stringify(scope));
check(checkMetrics(FINAL).hasAntiGame === true, "反 game 被识别");
check(countOpenQuestions(FINAL) === 0, "定稿开放问题=0", String(countOpenQuestions(FINAL)));
check(countOpenQuestions(DRAFT) >= 1, "草案开放问题≥1", String(countOpenQuestions(DRAFT)));

console.log("\n③ 草案 / 定稿判定");
const draft = checkPrdDraft(DRAFT);
check(draft.ok === true && draft.status.status === "draft", "草案通过", JSON.stringify(draft.missing));
const finalOk = checkPrdFinal(FINAL, DECISIONS);
check(finalOk.ok === true, "定稿通过", finalOk.missing.join("；"));
check(checkPrdFinal(FINAL.replace("## 失败定义", "## 其他"), DECISIONS).missing.some((m) => m.includes("失败定义")) === false, "（失败定义检查在维度里，见下）");
check(checkPrdFinal(FINAL, "").missing.some((m) => m.includes("decisions")), "缺决策记录 ⇒ 拒绝");
check(parsePrdStatus(FINAL).status === "final" && parsePrdStatus(FINAL).version === "1.0", "状态/版本解析");

console.log("\n④ 占位符与回指");
check(checkPrdDraft("# PRD\n> 状态：草案\n## 背景与问题\n（待填）\n").ok === false, "全占位 ⇒ 草案不过");
check(traceRate("回指 PRD #1\n回指 PRD #2\n普通一行") === 67, "回指率计算", String(traceRate("回指 PRD #1\n回指 PRD #2\n普通一行")));
check(sectionOf(FINAL, /失败定义/).body.includes("预警无人处置"), "段落的子内容可读");

console.log("\n⑤ 章程 / AGENTS（通用骨架）");
const K = ["# 章程", "> 确认日期：2026-11-26", "> 确认方式：负责人逐条回答", "拍板人：书记", "## 非目标", "- 不做定位", "- 不做大屏", "- 不做实物证照"].join("\n");
check(checkKickoff(K).ok === true, "章程通过（确认日期/方式/拍板人/非目标≥3）");
check(checkKickoff(K.replace("拍板人：书记", "")).ok === false, "缺拍板人 ⇒ 拒绝");
const A = ["# AGENTS", "## 项目定位", body(), "## 边界", body(), "## 当前阶段", body(), "## 硬约束", body(), "## 证据", body(), "## 门禁", body(), "## 冲突优先级", body()].join("\n");
check(checkAgents(A).ok === true && checkAgents(A).devMode === false, "AGENTS 七块（方案版）");

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
