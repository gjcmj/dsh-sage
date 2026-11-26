// 测试：工作流模板与预设（lib/workflow-config.js + workflow/*.yml）。
//
// 钉住：① base 合法；② 预设通过 extends 覆盖（发现路线 / 技术方案开关）；
// ③ 未知预设/阶段/路线/产物键/技能 必须报错并列合法值；④ extends 最多两级；
// ⑤ 版本随模板，供项目钉住；⑥ 已启用阶段的 skill 必须存在。
// 运行：node workflow-presets.test.mjs

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTemplate, listPresets, PHASE_IDS, KNOWN_ROUTES } from "../lib/workflow-config.js";

const here = dirname(dirname(fileURLToPath(import.meta.url)));
let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};

const BASE = [
'id: base',
'version: 1',
'name: 基础',
'artifacts:',
'  prd: docs/PRD.md',
'phases:',
'  kickoff:',
'    skill: kickoff',
'    required: true',
'  discovery:',
'    skill: discovery',
'    enabledByDefault: true',
'    routes: [internal, users]',
'  prd:',
'    skill: prd',
'    required: true',
].join("\n");

async function fixture(files) {
  const dir = await mkdtemp(join(tmpdir(), "sage-wfp-"));
  await mkdir(join(dir, "presets"), { recursive: true });
  if (!files["base.yml"]) files["base.yml"] = BASE;
  for (const [rel, c] of Object.entries(files)) {
    await writeFile(join(dir, rel), c, "utf8");
  }
  return dir;
}

console.log("# 工作流模板与预设\n");

console.log("① 真实模板");
const presets = listPresets();
check(presets.includes("software") && presets.includes("internal-platform") && presets.includes("tool"), "三个预设都在", presets.join("、"));
const base = loadTemplate("base");
check(base.problems.length === 0, "base 合法", base.problems.join("；"));
check(base.template.version === 1 && base.template.phases.prd.required === true, "base 版本与必做阶段");
const soft = loadTemplate("software");
check(soft.problems.length === 0, "software 合法", soft.problems.join("；"));
check(JSON.stringify(soft.template.phases.discovery.routes) === JSON.stringify(["internal", "users", "tech-form"]), "software 覆盖发现路线", JSON.stringify(soft.template.phases.discovery.routes));
check(soft.template.phases.kickoff.required === true, "extends 保留 base 阶段");
const ip = loadTemplate("internal-platform");
check(ip.problems.length === 0, "internal-platform 合法", ip.problems.join("；"));
check(ip.template.phases["tech-plan"].enabledByDefault === true, "internal-platform 默认开技术方案");
check(ip.template.phases.prototype === undefined || ip.template.phases.prototype.enabledByDefault !== true, "internal-platform 不默认开原型");
const tool = loadTemplate("tool");
check(tool.template.phases.discovery.enabledByDefault === false, "tool 关闭发现");

console.log("\n② 未知预设 / 阶段 / 路线 / 产物 / 技能");
const bad = await fixture({
  "presets/alpha.yml": ["id: alpha", "extends: base", "phases:", "  bogus:", "    skill: kickoff"].join("\n"),
});
const badLoad = loadTemplate("alpha", { workflowDir: bad, skillsDir: join(here, "skills") });
check(badLoad.problems.some((p) => p.includes("未知阶段：bogus") && p.includes("合法")), "未知阶段报错并列合法值", badLoad.problems.join("；"));
const routeBad = await fixture({
  "presets/alpha.yml": ["id: alpha", "extends: base", "phases:", "  discovery:", "    routes: [internal, weird]"].join("\n"),
});
const rl = loadTemplate("alpha", { workflowDir: routeBad, skillsDir: join(here, "skills") });
check(rl.problems.some((p) => p.includes("未知发现路线：weird") && p.includes("合法")), "未知路线报错", rl.problems.join("；"));
const artBad = await fixture({
  "presets/alpha.yml": ["id: alpha", "extends: base", "artifacts:", "  bogus: docs/x.md"].join("\n"),
});
const al = loadTemplate("alpha", { workflowDir: artBad, skillsDir: join(here, "skills") });
check(al.problems.some((p) => p.includes("未知产物键：bogus")), "未知产物键报错", al.problems.join("；"));
const skillBad = loadTemplate("base", { skillsDir: join(here, "no-skills") });
check(skillBad.problems.some((p) => p.includes("不存在的 skill")), "缺 skill 报错", skillBad.problems.join("；"));
const missPreset = loadTemplate("nope", { workflowDir: await fixture({}) });
check(missPreset.problems.some((p) => p.includes("预设不存在") && p.includes("可用")), "未知预设报错并列可用预设", missPreset.problems.join("；"));

console.log("\n③ extends 最多两级");
const deep = await fixture({
  "presets/a.yml": ["id: a", "extends: b"].join("\n"),
  "presets/b.yml": ["id: b", "extends: c"].join("\n"),
  "presets/c.yml": ["id: c", "extends: base"].join("\n"),
});
const dl = loadTemplate("a", { workflowDir: deep, skillsDir: join(here, "skills") });
check(dl.problems.some((p) => p.includes("最多两级")), "三级继承被拒绝", dl.problems.join("；"));

console.log("\n④ 版本与合法值常量");
check(soft.template.version === base.template.version, "预设不改写版本（项目钉住 base 版本）");
check(PHASE_IDS.includes("dev") && KNOWN_ROUTES.includes("competitors"), "阶段/路线常量可引用");
check(loadTemplate("base", { workflowDir: await fixture({ "base.yml": "id: base\nversion: 2\nphases:\n  kickoff:\n    required: true\n" }), skillsDir: join(here, "skills") }).template.version === 2, "版本随模板读取");

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
