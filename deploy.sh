#!/usr/bin/env bash
# Deploy the static portfolio to CT 101 (/var/www/portfolio). Linux twin of deploy.ps1.
# Usage: ./deploy.sh [--no-snapshot]
#   On CT 111 (agents-hub): runs `homelab-deploy portfolio` (git pull, snapshot CT 101, rsync, health check).
#   Elsewhere: tar over ssh to `server` (root@10.0.0.2), then `pct push` into CT 101. No build step.
set -euo pipefail
SELF=$(readlink -f "$0")
cd "$(dirname "$SELF")"

if [[ ${1:-} == -h || ${1:-} == --help ]]; then sed -n '2,5p' "$SELF"; exit 0; fi

if [[ -x /usr/local/bin/homelab-deploy ]]; then
  exec /usr/local/bin/homelab-deploy portfolio "$@"
fi

CT=101
DEST=/var/www/portfolio
HOST=${DEPLOY_HOST:-server}
TGZ=$(mktemp /tmp/portfolio-deploy.XXXXXX.tgz)
trap 'rm -f "$TGZ"' EXIT

tar -czf "$TGZ" --exclude=.git --exclude=.gitignore --exclude='deploy.*' --exclude=README.md --exclude=DESIGN.md \
  --exclude='*.test.mjs' --exclude=package.json --exclude='*/package.json' --exclude=node_modules .
scp -q "$TGZ" "$HOST:/tmp/portfolio-deploy.tgz"
ssh -n "$HOST" "pct push $CT /tmp/portfolio-deploy.tgz /tmp/portfolio-deploy.tgz && rm /tmp/portfolio-deploy.tgz && \
  pct exec $CT -- sh -c 'mkdir -p $DEST && tar -xzf /tmp/portfolio-deploy.tgz -C $DEST --no-same-owner && rm /tmp/portfolio-deploy.tgz'"

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://central-proxy.bluebuck-tailor.ts.net/portfolio/ || true)
echo "Deployed. /portfolio/ -> HTTP $code"
