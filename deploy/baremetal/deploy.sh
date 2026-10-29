#!/usr/bin/env bash
# Run on the app host as the ownlevel user. Usage: ./deploy.sh <git-ref>
set -euo pipefail
REF=${1:-main}
REL=/opt/ownlevel/releases/$(date +%Y%m%d%H%M%S)
git clone --depth 1 --branch "$REF" "$(git -C /opt/ownlevel/repo remote get-url origin)" "$REL"
cd "$REL"
pnpm install --frozen-lockfile
pnpm turbo run build --filter=@ownlevel/api --filter=@ownlevel/mcp-server --filter=@ownlevel/worker --filter=@ownlevel/tenancy
ln -sfn "$REL" /opt/ownlevel/current
sudo systemctl restart ownlevel-migrate.service   # fails deploy if migration fails
sudo systemctl restart ownlevel-api ownlevel-mcp
for i in $(systemctl list-units 'ownlevel-worker@*' --no-legend | awk '{print $1}'); do
  sudo systemctl restart "$i"; sleep 5   # rolling
done
curl -fsS http://127.0.0.1:4000/healthz
ls -dt /opt/ownlevel/releases/* | tail -n +6 | xargs -r rm -rf
