// 项目级链的判据（K1–K4 / G1–G4）：**只判结构，不判质量**。
//
// 来源：docs/sage/spec.md §1.2 与 §3。四条纪律：
//   ① 判据只认工件里**已经存在**的字段（标题、表格、四种标记、头部日期），不新造格式；
//   ② 判不出 ⇒ 报缺项（missing），**绝不静默通过**（团队吃过 E 类假绿的亏）；
//   ③ 「文件里有这句话」≠「评审通过」：G3/G4 的评审结论只校验**记录存在**，不校验质量；
//   ④ 纯函数：文本进、结果出；IO 全部留给 project-state.js。

const NEED = (n) => n;
const MIN_BODY = 30;

/** 去掉空白与模板占位，判断一段正文是否「真的写了」。 */
function filled(text) {
  const s = String(text || "").replace(/<!--[\s\S]*?-->/g, "").trim();
  if (s.length < MIN_BODY) return false;
  if (/^（?\s*(待填|TBD|TODO|待补)\s*）?$/im.test(s)) return false;
  const placeholders = (s.match(/（\s*）|\bTBD\b|待填|TODO/g) || []).length;
  return placeholders === 0;
}

/** 按标题切段：返回 [{level,title,body}]。 */
export function sectionsOf(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let cur = null;
  for (const line of lines) {
    const m = /^(#{1,4})\s+(.+)$/.exec(line);
    if (m) {
      if (cur) out.push(cur);
      cur = { level: m[1].length, title: m[2].trim(), body: [] };
    } else if (cur) cur.body.push(line);
  }
  if (cur) out.push(cur);
  return out.map((s) => ({ level: s.level, title: s.title, body: s.body.join("\n").trim() }));
}

/** 识别一行是不是标题：Markdown 标题，或独立成行的粗体小标题（**明确不做（首期）**）。 */
function headingAt(line) {
  const h = /^(#{1,4})\s+(.+)$/.exec(line);
  if (h) return { level: h[1].length, title: h[2].trim() };
  const b = /^\s*\*\*(.+?)\*\*\s*$/.exec(line);
  if (b) return { level: 5, title: b[1].trim() };
  return null;
}

/** 找第一个标题命中正则的段（**包含子标题正文**；粗体小标题也算，CDI 的「明确不做」就是这种写法）。 */
export function sectionOf(text, re) {
  const lines = String(text || "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = headingAt(lines[i]);
    if (!m || !re.test(m.title)) continue;
    const level = m.level;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const h = headingAt(lines[j]);
      if (h && h.level <= level) break;
      body.push(lines[j]);
    }
    return { level, title: m.title, body: body.join("\n").trim() };
  }
  return null;
}

/** 列表项条数（- * 1. 两类）。 */
export function listItems(body) {
  return String(body || "").split("\n").filter((l) => {
    if (!/^\s*(?:[-*]|\d+[.、])\s+\S/.test(l)) return false;
    // 占位行不算数：模板里的「- （待填）」不能让门禁假绿。
    return !/（\s*待填\s*）|TBD|TODO|待补/.test(l);
  }).length;
}

/** 表格数据行数（排除表头与分隔行）。 */
export function tableRows(body) {
  const rows = String(body || "").split("\n").filter((l) => l.trim().startsWith("|"));
  const data = rows.filter((l) => !/^\s*\|[-\s|:]+\|?\s*$/.test(l));
  return Math.max(0, data.length - 1);
}

export function countMarker(text, marker) {
  return (String(text || "").match(new RegExp(marker, "g")) || []).length;
}

/** 章节 1..9 是否齐（按「1.」这类编号标题判定）。 */
function numberedSections(text, count = 9) {
  const titles = sectionsOf(text).map((s) => s.title);
  const missing = [];
  for (let i = 1; i <= count; i++) {
    if (!titles.some((t) => new RegExp("^" + i + "[.、]").test(t))) missing.push(i);
  }
  return missing;
}

// ── 工件解析 ────────────────────────────────────────────────────────────────

export function parseKickoff(text) {
  const t = String(text || "");
  const date = /确认日期[：:]\s*(\d{4}-\d{2}-\d{2})/.exec(t);
  const way = /确认方式[：:]\s*(.+)/.exec(t);
  const decider = /拍板人[：:]\s*(.+)/.exec(t);
  const notDo = sectionOf(t, /明确不做|不做（首期）/);
  return {
    exists: t.trim().length > 0,
    confirmDate: date ? date[1] : null,
    confirmWay: way ? way[1].trim() : null,
    decider: decider ? decider[1].trim() : null,
    missingSections: numberedSections(t, 9),
    notDoCount: notDo ? listItems(notDo.body) : 0,
    hasAssumptions: !!sectionOf(t, /假设/),
    openMarkers: countMarker(t, "【待确认】") + countMarker(t, "【冲突】"),
  };
}

export function parseDraft(text) {
  const t = String(text || "");
  return {
    exists: t.trim().length > 0,
    open: countMarker(t, "【待确认】"),
    conflict: countMarker(t, "【冲突】"),
  };
}

export function parseAgents(text) {
  const t = String(text || "");
  const version = /(?:AGENTS\.md\s*v?|版本[：:]\s*v?)(\d+(?:\.\d+)*)/.exec(t);
  const effective = /生效日期[：:]\s*(\d{4}-\d{2}-\d{2})/.exec(t) || /(\d{4}-\d{2}-\d{2})\s*生效/.exec(t);
  const basis = /依据[：:]\s*(.+)/.exec(t);
  const hard = sectionOf(t, /硬约束/);
  const required = [/项目定位|定位/, /边界/, /当前阶段/, /硬约束/, /证据标准/, /门禁/, /冲突优先级/];
  const missing = required.filter((re) => !sectionOf(t, re)).map(String);
  return {
    exists: t.trim().length > 0,
    version: version ? version[1] : null,
    effective: effective ? effective[1] : null,
    basis: basis ? basis[1].trim() : null,
    devMode: /开发期/.test(t),
    missingSections: missing.length,
    noExternal: !!(hard && /不外发|不得发送到外部|不得外发/.test(hard.body)),
  };
}

export function parsePrd(text) {
  const t = String(text || "");
  const six = [/目标用户|用户与场景/, /痛点|现状|证据/, /竞品/, /形态/, /MVP|范围/, /成功指标|指标/];
  const missing = six.filter((re) => {
    const s = sectionOf(t, re);
    return !(s && filled(s.body));
  }).map(String);
  const mvp = sectionOf(t, /MVP|范围/);
  const mustSection = mvp ? sectionOf(mvp.body, /必做|Must|要做/) : null;
  const nonGoalSection = mvp ? sectionOf(mvp.body, /非目标|暂不做|Won/) : sectionOf(t, /非目标|暂不做|明确不做/);
  const metric = sectionOf(t, /成功指标|指标/);
  return {
    exists: t.trim().length > 0,
    missingSections: missing.length,
    mustCount: mustSection ? listItems(mustSection.body) : 0,
    nonGoalCount: nonGoalSection ? listItems(nonGoalSection.body) : 0,
    hasMetric: !!(metric && /口径|怎么量|达标|≥|>=/.test(metric.body)),
  };
}

export function parseTechPlan(text) {
  const t = String(text || "");
  const blocks = [/架构/, /集成/, /部署/, /AI|人工智能/, /安全/, /成本/];
  const missing = blocks.filter((re) => {
    const s = sectionOf(t, re);
    return !(s && filled(s.body));
  }).map(String);
  const degrade = sectionOf(t, /降级/);
  const review = sectionOf(t, /评审/);
  return {
    exists: t.trim().length > 0,
    missingBlocks: missing.length,
    hasDegradation: !!(degrade && listItems(degrade.body) >= 1),
    hasReviewRecord: !!(review && /结论|通过|批准/.test(review.body)),
  };
}

export function parsePrototype(text) {
  const t = String(text || "");
  const ia = sectionOf(t, /信息架构/);
  const golden = sectionOf(t, /黄金路径/);
  const screens = sectionOf(t, /低保真|页面清单|屏/);
  const walk = sectionOf(t, /走查/);
  const users = walk ? /(\d+)\s*(?:名|位|个)\s*(?:真实)?\s*用户/.exec(walk.body) : null;
  return {
    exists: t.trim().length > 0,
    hasArchitecture: !!(ia && filled(ia.body)),
    goldenCount: golden ? listItems(golden.body) : 0,
    screenCount: screens ? listItems(screens.body) : 0,
    walkUsers: users ? Number(users[1]) : 0,
    p0Clear: !!(walk && /P0/.test(walk.body) && /清零|0 个|零/.test(walk.body)),
  };
}

/** 决策表解析：返回数据行对象（含状态列）。 */
export function parseDecisions(text) {
  const rows = [];
  for (const line of String(text || "").split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    if (/^[-\s:]+$/.test(cells.join(""))) continue;
    if (/^(编号|ID)$/.test(cells[0])) continue;
    rows.push({ id: cells[0], date: cells[1], decision: cells[2], basis: cells[3], status: cells[cells.length - 1] });
  }
  return rows;
}

function confirmedMatching(rows, re) {
  return rows.some((r) => /已确认|已定/.test(r.status) && re.test(r.decision + " " + r.basis));
}

// ── 门禁 ────────────────────────────────────────────────────────────────────

const result = (id, missing, evidence = {}) => ({ id, ok: missing.length === 0, missing, evidence });

export function gateK1({ inputNames = [], baselineText = "", sourceNames = [] } = {}) {
  const missing = [];
  if (inputNames.length === 0) missing.push("inputs/ 下没有资料");
  if (!filled(baselineText)) missing.push("基线报告缺失或为空（research/00-资料理解与基线.md）");
  const uncovered = inputNames.filter((n) => !String(baselineText).includes(n));
  if (uncovered.length) missing.push("基线报告未覆盖资料：" + uncovered.join("、"));
  if (!/不外发|只读|不得外发/.test(String(baselineText))) missing.push("基线报告缺少「不外发 / 只读」声明");
  if (sourceNames.length === 0 && !/抽取|结构化/.test(String(baselineText))) missing.push("缺少抽取后的文本（research/sources/）");
  return result("K1", missing, { inputs: inputNames.length, sources: sourceNames.length });
}

export function gateK2({ kickoffText = "", draftText = "", decisionsText = "" } = {}) {
  const k = parseKickoff(kickoffText);
  const d = parseDraft(draftText);
  const rows = parseDecisions(decisionsText);
  const missing = [];
  if (!k.exists) missing.push("章程文件不存在（tasks/00-kickoff.md）");
  if (!k.confirmDate) missing.push("章程头部缺「确认日期」");
  if (!k.confirmWay) missing.push("章程头部缺「确认方式」");
  if (k.missingSections.length) missing.push("章程缺编号章节：" + k.missingSections.join("、"));
  if (k.notDoCount < 5) missing.push("「明确不做」不足 5 条（当前 " + k.notDoCount + "）");
  if (!k.decider) missing.push("缺拍板人");
  if (k.openMarkers > 0) missing.push("章程里仍有 【待确认】/【冲突】 " + k.openMarkers + " 处");
  if (d.open + d.conflict > 0 && !rows.some((r) => /已确认|已定/.test(r.status))) missing.push("草案有未决项，但 decisions.md 没有已确认记录");
  return result("K2", missing, { draftOpen: d.open + d.conflict, notDo: k.notDoCount });
}

export function gateK3({ agentsText = "", kickoffText = "", archiveNames = [] } = {}) {
  const a = parseAgents(agentsText);
  const missing = [];
  if (!a.exists) missing.push("AGENTS.md 不存在");
  if (a.missingSections) missing.push("AGENTS.md 缺 " + a.missingSections + " 个必备章节（定位 / 边界 / 当前阶段 / 硬约束 / 证据标准 / 门禁 / 冲突优先级）");
  if (!a.basis || !/00-kickoff|kickoff/i.test(a.basis)) missing.push("AGENTS.md 的「依据」未指向 kickoff");
  if (!a.noExternal) missing.push("硬约束缺「内部资料不外发」");
  // 已切开发版时，方案版必须可追溯（归档）；没有归档就不算「方案版做过」。
  if (a.devMode && archiveNames.length === 0) missing.push("已切开发版，但方案版未归档（docs/agents/AGENTS-solution-vX.md）");
  return result("K3", missing, { version: a.version, effective: a.effective, devMode: a.devMode });
}

export function gateK4({ agentsText = "", decisionsText = "", archiveNames = [] } = {}) {
  const a = parseAgents(agentsText);
  const rows = parseDecisions(decisionsText);
  const missing = [];
  const v = a.version ? Number.parseFloat(a.version) : null;
  if (!a.exists) missing.push("AGENTS.md 不存在");
  if (v === null || v < 1.0) missing.push("开发版 AGENTS 版本号需 ≥1.0");
  if (!a.effective) missing.push("开发版 AGENTS 缺生效日期");
  if (!a.devMode) missing.push("AGENTS.md 没有「开发期」标记");
  if (archiveNames.length === 0) missing.push("方案版未归档（docs/agents/AGENTS-solution-vX.md）");
  if (!confirmedMatching(rows, /切换开发版|开发版 AGENTS/)) missing.push("decisions.md 缺「切换开发版 AGENTS」已确认记录");
  return result("K4", missing, { version: a.version });
}

/** 形态候选条数：列表项，或表格/正文里的 M1/M2/M3、候选 A/B、方案 A/B。 */
export function countFormCandidates(text) {
  const t = String(text || "");
  const sec = sectionOf(t, /形态/);
  const fromList = sec ? listItems(sec.body) : 0;
  const tokens = new Set((t.match(/(?:M|候选|方案)\s?[1-3A-C]/g) || []).map((s) => s.replace(/\s/g, "").toUpperCase()));
  return Math.max(fromList, tokens.size);
}

export function gateG1({ routes = {}, competitorText = "", synthesisText = "" } = {}) {
  const missing = [];
  for (const key of ["policy", "competitors", "users", "form"]) {
    if (!filled(routes[key])) missing.push("缺失或为空：" + key + " 路线报告");
  }
  const cards = (() => {
    const n = /卡片（?(\d+)|（(\d+) 个）/ .exec(competitorText);
    if (n) return Number(n[1] || n[2]);
    return (competitorText.match(/^###\s+/gm) || []).length;
  })();
  if (cards < 8) missing.push("竞品卡片不足 8 个（当前 " + cards + "）");
  const cats = ["外事", "海外安全", "培训", "纪检"].filter((k) => competitorText.includes(k)).length;
  if (cats < 4) missing.push("竞品覆盖类别不足 4 类");
  if (!/待核实|A 级|B 级|证据/.test(competitorText)) missing.push("竞品报告缺证据分级或「待核实」标注");
  if (!filled(synthesisText)) missing.push("缺调研综合（99-synthesis）");
  const candidates = countFormCandidates(synthesisText);
  if (candidates < 2) missing.push("综合报告里形态候选不足 2 个（当前 " + candidates + "）");
  return result("G1", missing, { cards, cats });
}

export function gateG2({ prdText = "", decisionsText = "" } = {}) {
  const p = parsePrd(prdText);
  const rows = parseDecisions(decisionsText);
  const missing = [];
  if (!p.exists) missing.push("PRD 不存在（docs/PRD.md）");
  if (p.missingSections) missing.push("PRD 有 " + p.missingSections + " 个必备节为空");
  if (p.mustCount < 1) missing.push("MVP「必做」为空");
  if (p.mustCount > 7) missing.push("MVP 必做超过 7 项（当前 " + p.mustCount + "）");
  if (p.nonGoalCount < 1) missing.push("缺「非目标 / 暂不做」清单");
  if (!p.hasMetric) missing.push("成功指标缺口径（怎么量 / 达标线）");
  if (!confirmedMatching(rows, /MVP|PRD/)) missing.push("decisions.md 缺 MVP/PRD 已确认记录");
  return result("G2", missing, { must: p.mustCount, nonGoals: p.nonGoalCount });
}

export function gateG3({ prototypeText = "", decisionsText = "" } = {}) {
  const p = parsePrototype(prototypeText);
  const rows = parseDecisions(decisionsText);
  const missing = [];
  if (!p.exists) missing.push("原型文档不存在（docs/prototype/PROTOTYPE.md）");
  if (!p.hasArchitecture) missing.push("缺信息架构");
  if (p.goldenCount < 3) missing.push("黄金路径不足 3 条（当前 " + p.goldenCount + "）");
  if (p.screenCount < 10) missing.push("低保真屏不足 10 屏（当前 " + p.screenCount + "）");
  if (p.walkUsers < 3) missing.push("走查用户不足 3 名（当前 " + p.walkUsers + "）");
  if (!p.p0Clear) missing.push("走查缺 P0 清零结论");
  if (!confirmedMatching(rows, /原型|G3/)) missing.push("decisions.md 缺原型评审已确认记录");
  return result("G3", missing, { paths: p.goldenCount, screens: p.screenCount, users: p.walkUsers });
}

export function gateG4({ techPlanText = "", decisionsText = "" } = {}) {
  const t = parseTechPlan(techPlanText);
  const rows = parseDecisions(decisionsText);
  const missing = [];
  if (!t.exists) missing.push("技术方案不存在（docs/tech-plan/TECH-PLAN.md）");
  if (t.missingBlocks) missing.push("技术方案有 " + t.missingBlocks + " 块为空（架构 / 集成 / 部署 / AI / 安全 / 成本）");
  if (!t.hasDegradation) missing.push("缺降级方案（无大模型 / 无接口时怎么跑）");
  if (!t.hasReviewRecord) missing.push("缺评审记录（谁 / 何时 / 结论）");
  if (!confirmedMatching(rows, /技术方案|立项|G4/)) missing.push("decisions.md 缺立项（G4）已确认记录");
  return result("G4", missing, {});
}

// ── 模板契约：模板里必须出现判据会读的标题 ─────────────────────────────────
export const REQUIRED_TEMPLATE_HEADINGS = Object.freeze({
  "KICKOFF-DRAFT.md": ["基本信息", "监督对象", "现状", "数据与合规", "用户与场景", "成功标准", "决策与评审", "待确认"],
  "KICKOFF.md": ["基本信息", "监督对象与边界", "现状", "数据与合规", "用户与场景", "成功标准", "决策与评审", "待确认项", "关联文件", "明确不做"],
  "AGENTS-SOLUTION.md": ["项目定位", "已确认边界", "当前阶段", "硬约束", "证据标准", "门禁", "冲突优先级"],
  "PRD.md": ["目标用户", "痛点", "竞品", "形态", "MVP", "成功指标", "非目标"],
  "TECH-PLAN.md": ["架构", "集成", "部署", "AI", "安全", "成本", "降级方案", "评审记录"],
  "PROTOTYPE.md": ["信息架构", "黄金路径", "低保真", "走查"],
});

/** 契约检查：每个模板必须覆盖它对应的必备标题（缺一即红）。 */
export function checkTemplateContract(templates) {
  const missing = [];
  for (const [file, headings] of Object.entries(REQUIRED_TEMPLATE_HEADINGS)) {
    const text = templates[file];
    if (typeof text !== "string" || text.trim() === "") {
      missing.push(file + "（模板缺失）");
      continue;
    }
    for (const h of headings) {
      if (!text.includes(h)) missing.push(file + " 缺标题：" + h);
    }
  }
  return missing;
}
