// 测试：run 产物归档（lib/run-archive.js）。
//
// 钉住：① 只复制声明过的文件；② 缺件进 manifest 的 missing；③ 同一 run 重复归档不改写；
// ④ 未完成的 run 不归档；⑤ code run 不归档（没有项目级归档目录）。
// 运行：node run-archive.test.mjs

import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveRun, archiveTargets, reconcileArchives, ARCHIVE_MANIFEST } from "../lib/run-archive.js";

let fail = 0;
const check = (ok, name, detail) => {
  if (!ok) fail += 1;
  console.log("  " + (ok ? "✓" : "✗") + " " + name + (detail ? " — " + detail : ""));
};

async function seedRun(cwd, runId, state, files) {
  const dir = join(cwd, "team", runId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "STATE.json"), JSON.stringify({ runId, ...state }, null, 2), "utf8");
  for (const [name, body] of Object.entries(files)) await writeFile(join(dir, name), body, "utf8");
  return dir;
}

console.log("# run 产物归档\n");

console.log("① 映射是纯函数");
const t = archiveTargets("prototype");
check(t.length === 5 && t[1].to.endsWith("docs/prototype/PROTOTYPE.md"), "prototype 映射到 docs/prototype", t.map((x) => x.to).join(","));
check(archiveTargets("plan").some((x) => x.to.endsWith("docs/tech-plan/TECH-PLAN.md")), "plan 映射含 TECH-PLAN.md");
check(archiveTargets("code").length === 0, "code 没有归档目录");
check(archiveTargets("bogus").length === 0, "认不出的 kind 不归档（不猜）");

const cwd = await mkdtemp(join(tmpdir(), "sage-archive-"));
const write = (p, text) => writeFile(p, text, "utf8");
const runDir = await seedRun(cwd, "run-1", { kind: "prototype", status: "complete", phase: "deliver" }, {
  "PROTOTYPE.md": "# 原型\n", "UI.md": "# UI\n", "REVIEW.md": "# 评审\n", "TEST.md": "# 测试\n", "SUMMARY.md": "# 总结（不可上生产）\n",
});

console.log("\n② 完成的 prototype run 被归档");
const r1 = await reconcileArchives(cwd, { now: "2026-11-24T10:00:00.000Z", write });
check(r1.length === 1 && r1[0].runId === "run-1", "扫到并归档 run-1", JSON.stringify(r1.map((x) => x.runId)));
const manifest = JSON.parse(await readFile(join(cwd, "docs/prototype", ARCHIVE_MANIFEST), "utf8"));
check(manifest.runId === "run-1" && manifest.kind === "prototype", "manifest 记住 runId 与 kind");
check(manifest.missing.length === 0, "文件齐 ⇒ missing 为空");
check((await readdir(join(cwd, "docs/prototype"))).includes("PROTOTYPE.md"), "PROTOTYPE.md 已复制到项目级路径");

console.log("\n③ 幂等：再跑一次不重写");
const before = manifest.archivedAt;
const r2 = await reconcileArchives(cwd, { now: "2026-11-24T11:00:00.000Z", write });
check(r2.length === 0, "第二次没有任何新归档");
const manifest2 = JSON.parse(await readFile(join(cwd, "docs/prototype", ARCHIVE_MANIFEST), "utf8"));
check(manifest2.archivedAt === before, "归档时间戳未被改写（真的幂等）");

console.log("\n④ 未完成的 run 不归档");
const runDir2 = await seedRun(cwd, "run-2", { kind: "prototype", status: "running", phase: "implement" }, { "PROTOTYPE.md": "# 未完成\n" });
const a2 = await archiveRun({ cwd, runDir: runDir2, write, state: { runId: "run-2", kind: "prototype", status: "running" } });
check(a2.skipped === true && a2.archived.length === 0, "running 状态跳过");

console.log("\n⑤ 缺件如实记录");
const runDir3 = await seedRun(cwd, "run-3", { kind: "plan", status: "complete", phase: "deliver" }, { "PLAN.md": "# 计划\n", "REVIEW-SPEC.md": "# 评审\n", "SUMMARY.md": "# 总结\n" });
const a3 = await archiveRun({ cwd, runDir: runDir3, write, state: { runId: "run-3", kind: "plan", status: "complete" }, now: "2026-11-24T12:00:00.000Z" });
check(a3.missing.includes("TECH-PLAN.md"), "缺 TECH-PLAN.md 进 missing", a3.missing.join(","));
check(a3.archived.some((p) => p.endsWith("PLAN.md")), "已有的 PLAN.md 仍被归档");
const m3 = JSON.parse(await readFile(join(cwd, "docs/tech-plan", ARCHIVE_MANIFEST), "utf8"));
check(m3.previousRunId === undefined, "首次归档没有 previousRunId");

console.log("\n⑥ code run 不归档");
const runDir4 = await seedRun(cwd, "run-4", { kind: "code", status: "complete", phase: "deliver" }, { "SUMMARY.md": "# 代码交付\n" });
const a4 = await archiveRun({ cwd, runDir: runDir4, write, state: { runId: "run-4", kind: "code", status: "complete" } });
check(a4.skipped === true && a4.archived.length === 0, "code kind 跳过归档");

if (fail) { console.error("\n✗ 失败 " + fail + " 项"); process.exit(1); }
console.log("\n✓ 全部通过");
