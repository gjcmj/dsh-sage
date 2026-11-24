// 测试：项目级 skill（kickoff / discovery / prd）的结构与单一真源。
//
// 钉住：① frontmatter 合法（name 与目录一致、description/whenToUse 都在）；
// ② 模板只被**引用**、不被复制（SKILL.md 里不许出现模板正文的占位符）；
// ③ 方法可脱离插件使用（不调用插件路由 / 插件内部模块）；
// ④ 引用的模板在 assets/project/ 真实存在（引用与文件不脱节）。
// 运行：node project-skills.test.mjs

import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};

/** 只解析本仓实际使用的 frontmatter 形态（单行标量）。 */
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
  kickoff: {
    templates: ["KICKOFF-DRAFT.md", "KICKOFF.md", "AGENTS-SOLUTION.md"],
    sections: ["## 步骤", "## 交付与自检"],
    markers: ["【待确认】", "【推断】", "【材料事实】", "【冲突】"],
  },
  discovery: {
    templates: [],
    sections: ["## 步骤", "## 交付与自检"],
    markers: ["竞品", "证据", "形态"],
  },
  prd: {
    templates: ["PRD.md"],
    sections: ["## 六节", "## 交付与自检"],
    markers: ["MVP", "成功指标", "非目标"],
  },
};

console.log("# 项目级 skill 结构与单一真源\n");

for (const [name, spec] of Object.entries(SKILLS)) {
  console.log("\n" + name);
  const src = await readFile(join(here, "skills", name, "SKILL.md"), "utf8");
  const fm = frontmatter(src);
  check(!!fm, "frontmatter 可解析");
  if (!fm) continue;
  check(fm.meta.name === name, "name 与目录一致", fm.meta.name);
  check((fm.meta.description || "").length >= 40, "description 写明用途（≥40 字）", String((fm.meta.description || "").length));
  check((fm.meta.whenToUse || "").length >= 20, "whenToUse 写明何时用", String((fm.meta.whenToUse || "").length));
  for (const s of spec.sections) check(fm.body.includes(s), "有章节：" + s);
  for (const mk of spec.markers) check(fm.body.includes(mk), "定义了：" + mk);
  // 单一真源：模板正文不许被复制进来（占位符是模板正文的指纹）。
  check(!fm.body.includes("（待填）"), "不复制模板正文（无占位符）");
  // 可脱离插件：不调用插件路由 / 不引用插件模块。
  check(!fm.body.includes("/plugins/dsh-expert-team"), "不依赖插件路由");
  check(!fm.body.includes("project-gates.js") && !fm.body.includes("project-state.js"), "不依赖插件内部模块");
  for (const t of spec.templates) {
    const p = join(here, "assets", "project", t);
    let exists = true;
    try { await stat(p); } catch { exists = false; }
    check(exists, "引用的模板存在：" + t);
    check(fm.body.includes(t), "正文点名引用：" + t);
  }
}

console.log("\n跨 skill");
const kickoffBody = (frontmatter(await readFile(join(here, "skills", "kickoff", "SKILL.md"), "utf8")) || {}).body || "";
check(kickoffBody.includes("脱离插件") || kickoffBody.includes("独立使用"), "kickoff 明说可脱离插件独立使用");
const all = await Promise.all(Object.keys(SKILLS).map((n) => readFile(join(here, "skills", n, "SKILL.md"), "utf8")));
check(!all.some((s) => s.includes("（待填）")), "三份 skill 都没有复制模板正文");

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
