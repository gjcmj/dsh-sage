// 测试：工作流 skill（kickoff / discovery / prd / prototype / tech-plan）的结构与单一真源。
//
// 钉住：① frontmatter 合法（name 与目录一致、description/whenToUse 在）；
// ② 不复制模板正文（出现占位符即红）；③ 不依赖插件路由/内部模块（可独立使用）；
// ④ 引用的模板真实存在；⑤ 通用性：不写死「四路」「竞品 ≥N」「等保必做」；
// ⑥ prototype / tech-plan 必须以 PRD 定稿为前置。
// 运行：node workflow-skills.test.mjs

import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(dirname(fileURLToPath(import.meta.url)));
let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};

function frontmatter(src) {
  const m = /^\uFEFF?---\n([\s\S]*?)\n---\n/.exec(src);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([a-zA-Z]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: src.slice(m[0].length) };
}

const SKILLS = {
  kickoff: { templates: ["KICKOFF-DRAFT.md", "KICKOFF.md", "AGENTS-SOLUTION.md"], sections: ["## 步骤", "## 交付与自检"], markers: ["【待确认】", "【推断】", "【材料事实】", "【冲突】"] },
  discovery: { templates: [], sections: ["## 步骤", "## 交付与自检"], markers: ["按项目裁剪", "证据", "不固定四路"] },
  prd: { templates: ["PRD.md"], sections: ["## 一个文件、两种状态", "## 交付与自检"], markers: ["亮点", "失败定义", "定稿必须人签"] },
  prototype: { templates: ["PROTOTYPE.md"], sections: ["## 步骤", "## 边界"], markers: ["定稿", "回指"] },
  "tech-plan": { templates: ["TECH-PLAN.md"], sections: ["## 六块", "## 纪律"], markers: ["降级方案", "回指 PRD", "定稿"] },
};

console.log("# 工作流 skill 结构与单一真源\n");

for (const [name, spec] of Object.entries(SKILLS)) {
  console.log("\n" + name);
  const src = await readFile(join(here, "skills", name, "SKILL.md"), "utf8");
  const fm = frontmatter(src);
  check(!!fm, "frontmatter 可解析");
  if (!fm) continue;
  check(fm.meta.name === name, "name 与目录一致", fm.meta.name);
  check((fm.meta.description || "").length >= 40, "description 写明用途", String((fm.meta.description || "").length));
  check((fm.meta.whenToUse || "").length >= 20, "whenToUse 写明何时用", String((fm.meta.whenToUse || "").length));
  for (const s of spec.sections) check(fm.body.includes(s), "有章节：" + s);
  for (const mk of spec.markers) check(fm.body.includes(mk), "定义了：" + mk);
  check(!fm.body.includes("（待填）"), "不复制模板正文（无占位符）");
  check(!fm.body.includes("/plugins/dsh-expert-team"), "不依赖插件路由");
  check(!fm.body.includes("workflow-checks.js") && !fm.body.includes("workflow-state.js"), "不依赖插件内部模块");
  for (const t of spec.templates) {
    let exists = true;
    try { await stat(join(here, "assets", "project", t)); } catch { exists = false; }
    check(exists, "引用的模板存在：" + t);
    check(fm.body.includes(t), "正文点名引用：" + t);
  }
}

console.log("\n跨 skill");
const all = await Promise.all(Object.keys(SKILLS).map((n) => readFile(join(here, "skills", n, "SKILL.md"), "utf8")));
check(!all.some((s) => s.includes("（待填）")), "五份 skill 都没有复制模板正文");
check(!all.some((s) => s.includes("竞品 ≥8") || s.includes("竞品≥8")), "不写死竞品数量");
check(!all.some((s) => /等保.*必做|必须做等保/.test(s)), "不把等保写成所有项目必做");
const kickoffBody = (frontmatter(await readFile(join(here, "skills", "kickoff", "SKILL.md"), "utf8")) || {}).body || "";
check(kickoffBody.includes("脱离插件") || kickoffBody.includes("独立"), "kickoff 明说可脱离插件独立使用");

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
