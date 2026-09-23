#!/usr/bin/env bash
set -euo pipefail

project=$(cd "$(dirname "$0")/.." && pwd -P)
root=${1:-/home/eugene/www}
port=${2:-8080}
[[ $port =~ ^[0-9]+$ ]] && ((port >= 1 && port <= 65535)) || { echo 'Invalid port' >&2; exit 2; }
mkdir -p "$root"
root=$(cd "$root" && pwd -P)
# Deployment replaces this directory; never allow the checkout or its parents.
[[ $root != / ]] || { echo "Cannot use / as the build directory." >&2; exit 2; }
case "$project/" in "$root/"*) echo "Build directory must be outside the checkout and its parents." >&2; exit 2;; esac
exec 8>"$root/.build.lock"
flock 8
cd "$project"
stage=$(mktemp -d "$project/.deploy-XXXXXXXX")
trap 'rm -rf "$stage"' EXIT

# Use the same production environment precedence as the deployed Bun process.
NODE_ENV=production bun scripts/check-database-path.ts "$root"
WIKI_BUILD_OUT="$stage/adapter" bun run build
mkdir "$stage/output"
# Bundle runtime dependencies too, so development installs and edits cannot
# change the running server. Bun remains the only runtime dependency.
# The server graph also emits editor CSS. --outfile gives both outputs the same
# name in Bun; --outdir keeps index.js and index.css separate.
bun build "$stage/adapter/index.js" --target=bun --outdir="$stage/output"
bun build scripts/accounts.ts --target=bun --outfile="$stage/output/accounts.js"
bun build scripts/check-database-path.ts --target=bun --outfile="$stage/output/check-database-path.js"
cp "$stage/adapter/scan-docs.js" "$stage/output/scan-docs.js"
cp -a "$stage/adapter/client" "$stage/output/"
if [[ -d $stage/adapter/prerendered ]]; then
  cp -a "$stage/adapter/prerendered" "$stage/output/"
fi
for file in .env .env.local .env.production; do
  if [[ -f $project/$file ]]; then
    install -m 600 "$project/$file" "$stage/output/$file"
  fi
done

# Validate the exact copied configuration before stopping or replacing anything.
(cd "$stage/output" && NODE_ENV=production bun check-database-path.js "$root")

# Keep the existing instance serving until compilation and bundling succeed.
bash "$project/scripts/instance.sh" stop "$root" "$port" 8>&-
# Preserve only process coordination and the append-only runtime log. This also
# removes the old releases/current layout when upgrading an existing deployment.
find "$root" -mindepth 1 -maxdepth 1 \
  ! -name .build.lock ! -name .instance.lock ! -name instance.log ! -name navigation.yaml \
  -exec rm -rf -- {} +
cp -a "$stage/output/." "$root/"
bash "$project/scripts/instance.sh" start "$root" "$port" 8>&-
echo "Deployed $root"
