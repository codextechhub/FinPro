#!/usr/bin/env bash
#
# Cut a version of this package and move both applications onto it.
#
#   ./release.sh v0.2.0 "bank reconciliation screen"
#
# Four steps, and step 4 is the one that costs twenty minutes when forgotten:
# installing into console-fe REPLACES the npm link with the git copy, so your
# local edits stop appearing and nothing tells you why.

set -euo pipefail

VERSION="${1:-}"
MESSAGE="${2:-}"
REPO="git+https://github.com/codextechhub/FinPro.git"
APPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONSOLE="$APPS_DIR/console-fe"
SCHOOL="$APPS_DIR/school-fe"

if [[ -z "$VERSION" || -z "$MESSAGE" ]]; then
  echo "usage: ./release.sh <version> <message>" >&2
  echo "   eg: ./release.sh v0.2.0 \"bank reconciliation screen\"" >&2
  exit 64
fi
[[ "$VERSION" == v* ]] || { echo "version should start with v, eg v0.2.0" >&2; exit 64; }

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

echo "==> tagging $VERSION"
git tag -a "$VERSION" -m "$MESSAGE"
git push -q origin "$VERSION"

for app in "$SCHOOL" "$CONSOLE"; do
  [[ -d "$app" ]] || { echo "skipping $(basename "$app"): not found"; continue; }
  echo "==> $(basename "$app"): installing $VERSION"
  ( cd "$app" && npm install --prefer-online "$REPO#$VERSION" )
done

# Step 4. The install above just overwrote the console's symlink.
if [[ -d "$CONSOLE" ]]; then
  echo "==> console-fe: restoring the npm link"
  ( cd "$CONSOLE" && npm link @xvs/finance >/dev/null )
  echo "    node_modules/@xvs/finance -> $(readlink "$CONSOLE/node_modules/@xvs/finance" || echo '?')"
fi

cat <<NOTE

Done. $VERSION is tagged and both applications point at it.

Still yours to do:
  - commit package.json and package-lock.json in BOTH apps. The lockfile
    records the resolved commit, so a deploy without it ships the old one.
  - run the suites. This script moves versions; it does not verify them.
NOTE
