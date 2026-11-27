// 测试：工作流视图载荷（lib/project-view.js）。
//
// 钉住：① 客户端只认稳定字段；② skip 不伪装成 ✓；③ 下一步是「人话 + 缺项」；
// ④ 非项目 ⇒ isProject=false（dock 不渲染）；⑤ 驾驶舱顶部条真的挂上了（源码级）。
// 运行：node project-view.test.mjs

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectPayload, nextText } from "../lib/project-view.js";

const here = dirname(dirname(fileURLToPath(import.meta.url)));
let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};

const STATE = {
  isProject: true,
  next: { id: "prd", label: "PRD", missing: ["开放问题未清零（2）"] },
  phases: [
    { id: "kickoff", label: "立项（章程）", done: true, missing: [], skipped: false },
    { id: "discovery", label: "发现", done: true, missing: [], skipped: false },
    { id: "prd", label: "PRD", done: false, missing: ["开放问题未清零"], skipped: false },
    { id: "prototype", label: "原型（可选）", done: false, missing: [], skipped: true, reason: "未启用" },
    { id: "dev", label: "开发（team）", done: false, missing: ["等 PRD 定稿"], skipped: false },
  ],
  prd: { status: "draft", version: "0.1", draftOk: true, finalOk: false, openQuestions: 2, dimensions: { filled: 15, total: 18, missing: ["failure"] }, highlights: { count: 3, complete: 1 }, scope: { must: 2, nonGoals: 1 }, metrics: { has: true, hasCaliber: true, hasAntiGame: false }, conflicts: false, traceRate: 0 },
  artifacts: [ { key: "kickoff", label: "章程", path: "tasks/00-kickoff.md", exists: true }, { key: "prd", label: "PRD", path: "docs/PRD.md", exists: true }, { key: "prototype", label: "原型", path: "docs/prototype/", exists: false } ],
  agents: { devMode: false, version: "0.3", ok: true },
  template: { id: "base", version: 1, preset: "base" },
  counts: { researchFiles: 2, teamRuns: 0 },
  problems: [],
};

console.log("# 工作流视图载荷\n");

const p = projectPayload(STATE);
check(p.ok === true && p.isProject === true, "载荷可用");
check(p.stage === "prd" && p.stageLabel === "PRD", "阶段与标签", p.stageLabel);
check(p.prd.status === "draft" && p.prd.dimensions.filled === 15, "PRD 字段透出");
check(p.ready.prdCoverage === "15/18", "就绪度覆盖", p.ready.prdCoverage);
check(p.phases.length === 5, "阶段数一致", String(p.phases.length));
check(p.steps[3].skipped === true && p.steps[3].reason === "未启用", "skip 保留理由");
check(p.steps[2].ok === false, "PRD 未完成");
check(p.dock.includes("立项（章程）✓") && p.dock.includes("原型（可选）(skip)"), "dock 含完成与 skip", p.dock);
check(p.next.includes("PRD") && p.next.includes("缺："), "下一步是人话 + 缺项", p.next);
check(p.agents.devMode === false, "AGENTS 版本透出");
check(p.ready.conflicts === 0 && p.ready.traceRate === 0, "就绪度含冲突/回指", JSON.stringify(p.ready));
check(p.artifacts.length === 3 && p.artifacts[2].exists === false, "产物清单透出（缺项可渲染）", JSON.stringify(p.artifacts.map((a) => a.exists)));

console.log("\n② 空/非项目");
const empty = projectPayload(null);
check(empty.ok === false && empty.isProject === false, "null ⇒ 不可用");
const legacy = projectPayload({ isProject: false, phases: [], next: null });
check(legacy.isProject === false && legacy.stage === "dev", "legacy 不可渲染");

console.log("\n③ nextText");
check(nextText({ next: null }) === "", "没有下一步 ⇒ 空串");
check(nextText({ next: { id: "prd", label: "PRD", missing: [] } }) === "PRD", "无缺项只给标签");

console.log("\n④ 接线（源码级：驾驶舱顶部条与 dock 共用同一载荷）");
const clientSrc = await readFile(join(here, "client.js"), "utf8");
check(clientSrc.includes("h(ProjectStrip, { sessionId: sessionId })"), "并排面板与全屏画布都插入 ProjectStrip（点紧凑条就能看到完整项目链）");
check(clientSrc.includes("function selectedWorkspacePath") && clientSrc.includes("if (wsPath) key = { sid: '', cwd: wsPath }"), "项目条按输入框可见的工作区路径查询，不被滞后 sessionId 带偏");
check(clientSrc.includes("function projectKeyOf") && clientSrc.includes("projectStore.data = null") && clientSrc.includes("projectStore.key = ''"), "切键/无订阅者时清空项目数据（不会跨对话显示旧项目条）");
check(clientSrc.includes("项目状态读取中") && clientSrc.includes("data=") && clientSrc.includes("lastErr"), "面板读取中不空白，诊断信息在 title");
check(!clientSrc.includes("viewMode ? h(ProjectStrip"), "ProjectStrip 不再只在全屏画布显示");
check(clientSrc.includes("function ProjectStrip") && clientSrc.includes("exp-projstrip"), "ProjectStrip 组件与样式在场");
check(clientSrc.includes("/plugins/dsh-expert-team/project"), "dock 与 strip 共用同一条工作流路由");
check(clientSrc.includes("className: 'exp-projbar'"), "dock 一行存在");
check(clientSrc.includes("exp-pjbadge"), "项目条有 PRD 草案/定稿徽标");
check(clientSrc.includes("exp-projstrip-ready") && clientSrc.includes("ready.prdCoverage"), "就绪度行渲染（维度/开放/亮点/冲突）");
check(clientSrc.includes("exp-pjart"), "产物区渲染（缺项标拒绝色）");
check(!clientSrc.includes("settings.section', 'expert-team-workflow"), "不新增第二个设置入口");

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
