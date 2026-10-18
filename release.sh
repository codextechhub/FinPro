#!/usr/bin/env bash
#
# Cut a version of this package and move both applications onto it.
# The package version and tag name match on the commit consumers install.
# The console's local npm link is restored after the app installs.
#
#   ./release.sh v0.2.0 "bank reconciliation screen"
#
set -euo pipefail

VERSION="${1:-}"
MESSAGE="${2:-}"
REPO="git+https://github.com/codextechhub/FinPro.git"
APPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONSOLE="$APPS_DIR/console-fe"
SCHOOL="$APPS_DIR/school-fe"

# Run npm for an application under the processor its build tools were
# installed for. On Apple silicon the two apps need not agree: when one was
# installed under an Intel Node (Rosetta), an npm run by the native Node swaps
# its rollup and esbuild binaries for arm64 ones, and that app's Intel dev
# server stops starting. Which binaries are present now is the answer, so the
# install keeps them. X64_NODE names the Intel Node to use.
X64_NODE="${X64_NODE:-/usr/local/bin/node}"
app_npm() {
  local app="$1"; shift
  if [[ "$(uname -m)" == arm64 && -d "$app/node_modules/@rollup/rollup-darwin-x64" \
        && ! -d "$app/node_modules/@rollup/rollup-darwin-arm64" ]]; then
    local cli
    cli="$(dirname "$X64_NODE")/../lib/node_modules/npm/bin/npm-cli.js"
    if [[ "$(file -b "$X64_NODE" 2>/dev/null)" != *x86_64* || ! -f "$cli" ]]; then
      echo "$(basename "$app") is installed for Intel, but no Intel Node with npm is at $X64_NODE." >&2
      echo "Set X64_NODE to one, or reinstall $(basename "$app") for arm64." >&2
      return 1
    fi
    arch -x86_64 "$X64_NODE" "$cli" "$@"
  else
    npm "$@"
  fi
}

if [[ -z "$VERSION" || -z "$MESSAGE" ]]; then
  echo "usage: ./release.sh <version> <message>" >&2
  echo "   eg: ./release.sh v0.2.0 \"bank reconciliation screen\"" >&2
  exit 64
fi
[[ "$VERSION" == v* ]] || { echo "version should start with v, eg v0.2.0" >&2; exit 64; }
PACKAGE_VERSION="${VERSION#v}"
[[ "$PACKAGE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "version should be a release tag such as v0.2.0" >&2
  exit 64
}

cd "$(dirname "${BASH_SOURCE[0]}")"

# Refuse to tag a dirty or unpushed tree: the tag must name something the
# applications can actually fetch, and Render fetches from the remote.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "FinPro has uncommitted changes. Commit them first - a tag on an" >&2
  echo "unrecorded tree is a version nobody else can install." >&2
  git status --short >&2
  exit 1
fi
git fetch -q origin
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "HEAD and origin/main differ. Push first, or Render will fetch a" >&2
  echo "commit that does not exist on the remote." >&2
  exit 1
fi
if git rev-parse "$VERSION" >/dev/null 2>&1; then
  echo "$VERSION already exists. Cut a new version rather than moving it:" >&2
  echo "npm caches git dependencies by URL and may reinstall the old commit." >&2
  exit 1
fi

echo "==> checking the package boundary"
node check-boundary.mjs

# The boundary check reads the source; this one reads what a CONSUMER gets.
# v0.1.0 passed every typecheck, build and test in both applications and still
# broke the console's finance area on open, because its exports map pointed at
# files that do not exist. Nothing else in the pipeline asks that question.
echo "==> checking the public subpaths resolve"
node check-exports.mjs

echo "==> setting package version to $PACKAGE_VERSION"
npm pkg set "version=$PACKAGE_VERSION"
if ! git diff --quiet -- package.json; then
  git add package.json
  git commit -m "chore(release): $VERSION"
  git push -q origin HEAD:main
fi

echo "==> tagging $VERSION"
git tag -a "$VERSION" -m "$MESSAGE"
git push -q origin "$VERSION"

for app in "$SCHOOL" "$CONSOLE"; do
  [[ -d "$app" ]] || { echo "skipping $(basename "$app"): not found"; continue; }
  echo "==> $(basename "$app"): installing $VERSION"
  ( cd "$app" && app_npm "$app" install --prefer-online "$REPO#$VERSION" )
done

# Step 4. The install above just overwrote the console's symlink.
if [[ -d "$CONSOLE" ]]; then
  echo "==> console-fe: restoring the npm link"
  ( cd "$CONSOLE" && app_npm "$CONSOLE" link @xvs/finance >/dev/null )
  echo "    node_modules/@xvs/finance -> $(readlink "$CONSOLE/node_modules/@xvs/finance" || echo '?')"
fi

cat <<NOTE

Done. $VERSION is tagged and both applications point at it.

Still yours to do:
  - commit package.json and package-lock.json in BOTH apps. The lockfile
    records the resolved commit, so a deploy without it ships the old one.
  - run the suites. This script moves versions; it does not verify them.
NOTE
