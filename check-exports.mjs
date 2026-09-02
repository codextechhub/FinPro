// Every subpath a consumer imports must resolve to a file that exists.
//
// This exists because it did not. v0.1.0 shipped with `"./*": "./src/*"`, so
// `@xvs/finance/host` resolved to `src/host` - no extension, no file. Both
// applications typechecked green (their alias tables answered first) and the
// console's finance area went blank the moment a real browser asked Node's
// resolver instead. A green build proved nothing about the thing that broke.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(resolve(here, "package.json"), "utf8"));

// The subpaths consumers actually import. Discovered from the applications
// rather than guessed; add to it when a new one is introduced.
const SUBPATHS = [
  ".",
  "./host",
  "./permissions",
  "./redux/tag-types",
  "./redux/features/finance/entity-slice",
  "./components/finance-ui",
  "./components/finance-ui/nav-main",
  "./components/finance-ui/sidebar-navigation",
];

const candidatesFor = (subpath) => {
  const map = pkg.exports ?? {};
  if (subpath === ".") return [map["."]].flat().filter(Boolean);
  const star = map["./*"];
  if (!star) return [];
  const rest = subpath.slice(2);
  return [star].flat().map((t) => t.replace("*", rest));
};

const problems = [];
for (const subpath of SUBPATHS) {
  const candidates = candidatesFor(subpath);
  if (!candidates.length) {
    problems.push(`${subpath} — the exports map has no pattern that covers it`);
    continue;
  }
  const hit = candidates.find((c) => {
    const p = resolve(here, c);
    return existsSync(p) && !p.endsWith("/");
  }) ?? candidates.find((c) => existsSync(resolve(here, c, "index.ts")));
  if (!hit) {
    problems.push(`${subpath} — resolves to nothing (tried ${candidates.join(", ")})`);
  }
}

if (problems.length) {
  console.error(`Export check failed (${problems.length}):`);
  for (const p of problems) console.error("  " + p);
  console.error("\nA consumer importing one of these gets a module-not-found at");
  console.error("RUNTIME, after every typecheck and build has passed.");
  process.exit(1);
}
console.log(`Export check passed: ${SUBPATHS.length} public subpaths all resolve.`);
