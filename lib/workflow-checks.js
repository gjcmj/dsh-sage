// 工作流覆盖检查（纯函数）：只回答「维度有没有写、结构齐不齐」，**不判质量**。
//
// 与旧 project-gates 的区别：不再写死某个项目的章节数/竞品数/等保；
// 维度由 PRD 规格（docs/sage/prd-dimensions.md）声明，按「草案/定稿/按类型」三档判定。

/** PRD 维度定义（与 docs/sage/prd-dimensions.md 同源）。 */
export const PRD_DIMENSIONS = Object.freeze([
  { id: "background", name: "背景与问题", draft: true, final: true, re: /背景|为什么现在|问题陈述/ },
  { id: "goals", name: "目标与非目标", draft: true, final: true, re: /目标|非目标|不做什么/ },
  { id: "users", name: "用户与角色", draft: true, final: true, re: /用户|角色|非用户/ },
  { id: "scenarios", name: "场景与任务", draft: true, final: true, re: /场景|任务矩阵/ },
  { id: "pain", name: "痛点与证据", draft: true, final: true, re: /痛点|现状|证据/ },
  { id: "value", name: "价值与收益", draft: true, final: true, re: /价值|收益|好处/ },
  { id: "highlights", name: "亮点与差异化", draft: true, final: true, re: /亮点|差异化/ },
  { id: "scope", name: "功能范围", draft: true, final: true, re: /功能范围|MVP|范围/ },
  { id: "form", name: "形态与交互", draft: true, final: true, re: /形态|交互|信息架构/ },
  { id: "data", name: "数据与权限", draft: true, final: true, re: /数据|权限|审计/ },
  { id: "metrics", name: "指标与验收", draft: true, final: true, re: /指标|验收/ },
  { id: "milestones", name: "里程碑与依赖", draft: true, final: true, re: /里程碑|计划|依赖/ },
  { id: "risks", name: "风险与假设", draft: true, final: true, re: /风险|假设/ },
  { id: "opens", name: "开放问题与决策", draft: true, final: true, re: /开放问题|待确认|决策/ },
  { id: "evidence", name: "证据与参考", draft: true, final: true, re: /证据|参考|来源/ },
  { id: "failure", name: "失败定义", draft: false, final: true, re: /失败定义|怎样算失败|算输/ },
  { id: "compliance", name: "合规与等保", draft: false, final: false, conditional: true, re: /合规|等保|密评|数据出境/ },
  { id: "competitors", name: "竞品与市场", draft: false, final: false, conditional: true, re: /竞品|对标|市场/ },
]);

const PLACEHOLDER = /（\s*待填\s*）|TBD|TODO|待补|（\s*）$/;
const MIN_BODY = 20;

/** 按标题切段（含子标题正文）。 */
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

/** 找第一个标题命中正则的段（包含子标题正文）。 */
export function sectionOf(text, re) {
  const secs = sectionsOf(text);
  for (let i = 0; i < secs.length; i++) {
    if (!re.test(secs[i].title)) continue;
    const level = secs[i].level;
    const body = [];
    for (let j = i + 1; j < secs.length && secs[j].level > level; j++) {
      body.push("#".repeat(secs[j].level) + " " + secs[j].title + "\n" + secs[j].body);
    }
    return { ...secs[i], body: body.length ? body.join("\n") : secs[i].body };
  }
  return null;
}

/** 列表项条数（占位行不算）。 */
export function listItems(body) {
  return String(body || "").split("\n").filter((l) => /^\s*(?:[-*]|\d+[.、])\s+\S/.test(l) && !PLACEHOLDER.test(l)).length;
}

/** 正文是否「真的写了」。 */
export function filled(body) {
  const s = String(body || "").replace(/<!--[\s\S]*?-->/g, "").trim();
  if (s.length < MIN_BODY) return false;
  if (/^（?\s*(待填|TBD|TODO|待补)\s*）?$/im.test(s)) return false;
  return !PLACEHOLDER.test(s);
}

/** PRD 头部状态：草案 / 定稿（含版本）。 */
export function parsePrdStatus(text) {
  const m = /状态[：:]\s*(草案|定稿)(?:\s*v?(\d+(?:\.\d+)*))?/.exec(String(text || ""));
  return { status: m ? (m[1] === "定稿" ? "final" : "draft") : "unknown", version: m && m[2] ? m[2] : null };
}

/** 维度覆盖：返回 { missingDraft, missingFinal, conditionalPresent }。 */
export function checkDimensions(text, { forFinal = false } = {}) {
  const missingDraft = [];
  const missingFinal = [];
  const conditionalPresent = [];
  for (const d of PRD_DIMENSIONS) {
    const sec = sectionOf(text, d.re);
    const present = sec && (filled(sec.body) || (/不适用/.test(sec.body) && d.conditional));
    if (d.draft && !present) missingDraft.push(d.id);
    if (d.final && !present) missingFinal.push(d.id);
    if (d.conditional && present) conditionalPresent.push(d.id);
  }
  return { missingDraft, missingFinal, conditionalPresent, forFinal };
}

/** 亮点：每个亮点必须回答四问（谁关心/痛点/怎么做/怎么证明）。 */
export function checkHighlights(text) {
  const sec = sectionOf(text, /亮点|差异化/);
  if (!sec) return { count: 0, complete: 0 };
  const items = String(sec.body || "").split("\n").filter((l) => /^\s*(?:[-*]|\d+[.、])\s+\S/.test(l));
  let complete = 0;
  for (const item of items) {
    const hasWho = /谁关心|决策人|书记|领导|用户/.test(item);
    const hasPain = /痛点|问题|现状/.test(item);
    const hasHow = /怎么做|做法|机制|方案/.test(item);
    const hasProof = /怎么证明|证明|指标|演示|案例/.test(item);
    if (hasWho && hasPain && hasHow && hasProof) complete += 1;
  }
  return { count: items.length, complete };
}

/** MVP 必做条数 / 非目标条数（在「功能范围」段内）。 */
export function checkScope(text) {
  const sec = sectionOf(text, /功能范围|MVP|范围/);
  if (!sec) return { must: 0, nonGoals: 0 };
  const mustSec = sectionOf(sec.body, /必做|Must|要做/);
  const nonSec = sectionOf(sec.body, /非目标|暂不做|不做/);
  return { must: mustSec ? listItems(mustSec.body) : 0, nonGoals: nonSec ? listItems(nonSec.body) : 0 };
}

/** 指标口径与反 game。 */
export function checkMetrics(text) {
  const sec = sectionOf(text, /指标|验收/);
  if (!sec) return { has: false, hasCaliber: false, hasAntiGame: false };
  return {
    has: filled(sec.body),
    hasCaliber: /口径|怎么量|达标|≥|>=/.test(sec.body),
    hasAntiGame: /反\s*game|抽检|审计日志|0 事件|N\/A/.test(sec.body),
  };
}

/** 开放问题条数。 */
export function countOpenQuestions(text) {
  const sec = sectionOf(text, /开放问题|待确认/);
  if (!sec) return 0;
  // 「已清零 / 无未决」是结论，不是一条待办。
  if (/已清零|无未决|没有未决|无开放问题|没有开放问题/.test(sec.body)) return 0;
  return listItems(sec.body);
}

/** 冲突：明确写了「冲突」且未被解决（出现「冲突」且没有「已解决/采用」）。 */
export function hasUnresolvedConflict(text) {
  const s = String(text || "");
  if (!/冲突/.test(s)) return false;
  return !/已解决|采用[：:]|冲突已清零/.test(s);
}

/** 章程检查（通用，不写死 9 节）：确认日期/方式、拍板人、非目标、依据。 */
export function checkKickoff(text) {
  const t = String(text || "");
  const missing = [];
  if (!/确认日期[：:]\s*\d{4}-\d{2}-\d{2}/.test(t)) missing.push("确认日期");
  if (!/确认方式[：:]/.test(t)) missing.push("确认方式");
  if (!/拍板人[：:]\s*\S/.test(t)) missing.push("拍板人");
  const non = sectionOf(t, /非目标|明确不做|不做什么/);
  if (!non || listItems(non.body) < 3) missing.push("非目标（≥3 条）");
  return { ok: missing.length === 0, missing };
}

/** AGENTS 检查（七块为通用骨架；开发版标记决定阶段）。 */
export function checkAgents(text) {
  const t = String(text || "");
  const need = [/项目定位|定位/, /边界/, /当前阶段|阶段/, /硬约束|约束/, /证据/, /门禁|流程/, /冲突优先级|优先级/];
  const missing = need.filter((re) => !sectionOf(t, re)).map(String);
  return { ok: missing.length === 0, missing, devMode: /开发期/.test(t), version: (/v(\d+(?:\.\d+)*)/.exec(t) || [])[1] || null };
}

/** 回指率：派生文档里「回指 PRD 条目」的行占比（无回指 = 新需求）。 */
export function traceRate(text) {
  const lines = String(text || "").split("\n").filter((l) => l.trim().length > 0);
  if (!lines.length) return 0;
  const traced = lines.filter((l) => /回指|PRD\s*#|PRD\s*§|来源：PRD/.test(l)).length;
  return Math.round((traced / lines.length) * 100);
}

/** PRD 草案检查：维度覆盖 + 亮点 + 开放问题清单。 */
export function checkPrdDraft(text) {
  const dims = checkDimensions(text, { forFinal: false });
  const hl = checkHighlights(text);
  const scope = checkScope(text);
  const status = parsePrdStatus(text);
  const missing = [];
  if (status.status === "unknown") missing.push("头部状态（草案/定稿）");
  if (dims.missingDraft.length) missing.push("维度：" + dims.missingDraft.join("、"));
  if (hl.count === 0) missing.push("亮点（至少 1 条草稿）");
  if (scope.must === 0) missing.push("必做清单");
  return { ok: missing.length === 0, missing, dims, highlights: hl, scope, status };
}

/** PRD 定稿检查：状态=定稿、维度齐、开放问题清零、亮点四问齐、指标口径、失败定义、决策记录。 */
export function checkPrdFinal(text, decisionsText) {
  const dims = checkDimensions(text, { forFinal: true });
  const hl = checkHighlights(text);
  const scope = checkScope(text);
  const metrics = checkMetrics(text);
  const status = parsePrdStatus(text);
  const opens = countOpenQuestions(text);
  const decisions = String(decisionsText || "");
  const missing = [];
  if (status.status !== "final") missing.push("状态未改为定稿");
  if (dims.missingFinal.length) missing.push("维度：" + dims.missingFinal.join("、"));
  if (opens > 0) missing.push("开放问题未清零（" + opens + "）");
  if (hl.complete < 3) missing.push("亮点四问齐的不足 3 个（当前 " + hl.complete + "）");
  if (scope.must < 1 || scope.must > 7) missing.push("必做需 1–7 项（当前 " + scope.must + "）");
  if (scope.nonGoals < 1) missing.push("非目标 ≥1");
  if (!metrics.hasCaliber) missing.push("指标缺口径");
  if (!metrics.hasAntiGame) missing.push("指标缺反 game/抽检");
  if (hasUnresolvedConflict(text)) missing.push("存在未解决的冲突");
  if (!/PRD[^\n]*(定稿|确认)|定稿[^\n]*PRD/.test(decisions)) missing.push("decisions 缺「PRD 定稿」记录");
  return { ok: missing.length === 0, missing, dims, highlights: hl, scope, metrics, status, opens };
}
