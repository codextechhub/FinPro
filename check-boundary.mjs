// Guards the package boundary. Run before any release or repo split.
//
// Three failure modes bit this extraction repeatedly, each producing a
// misleading signal:
//   1. a relative import escaping the package (one unresolved module produced
//      86 bogus "implicitly any" errors elsewhere);
//   2. a test file orphaned from the subject it tests, which nothing reports;
//   3. a test file the runner never discovers, which reads as a smaller
//      passing suite.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "src");
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk(ROOT).filter((f) => /\.tsx?$/.test(f));
const problems = [];

for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/from "(\.\.?\/[^"]+)"/g)) {
    const base = resolve(dirname(f), m[1].split("?")[0]);
    const hit = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]
      .some((c) => existsSync(c) && statSync(c).isFile());
    if (!hit) problems.push(`escapes the package: ${f} -> ${m[1]}`);
  }
}
for (const t of files.filter((f) => /\.test\.tsx?$/.test(f))) {
  const subject = t.replace(/\.test\.tsx?$/, "");
  if (![".ts", ".tsx"].some((e) => existsSync(subject + e))) {
    problems.push(`test has no subject beside it: ${t}`);
  }
}
if (problems.length) {
  console.error(`Boundary check failed (${problems.length}):`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`Boundary check passed: ${files.length} files, no escapes, no orphaned tests.`);
