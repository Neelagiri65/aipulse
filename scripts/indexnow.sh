#!/usr/bin/env bash
# Ping IndexNow (Bing, Yandex, Seznam, Naver, et al.) for gawk.dev after a
# production deploy. IndexNow verifies ownership by fetching the key file from
# the PROD host, so only run this once the key .txt is live at
# https://<host>/<key>.txt (i.e. after the Vercel prod deploy). Pinging against
# a preview host will fail. Mirrors nativerse-site/scripts/indexnow.sh.
#
# URLs are pulled live from the sitemap so the list never goes stale.
set -euo pipefail

HOST="gawk.dev"
KEY="90ab194447aeec6bb84d014e342d75e1"

# 1. Confirm the key file is live on prod before submitting.
code=$(curl -sS -o /dev/null -w "%{http_code}" "https://$HOST/$KEY.txt" || echo "000")
if [ "$code" != "200" ]; then
  echo "Key file not reachable at https://$HOST/$KEY.txt (HTTP $code)."
  echo "Deploy to production first, then re-run this script."
  exit 1
fi

# 2. Pull the current URL set from the sitemap (bash 3.2 friendly: no mapfile).
urls=$(curl -sS "https://$HOST/sitemap.xml" | grep -oE '<loc>[^<]+</loc>' | sed -E 's#</?loc>##g')
if [ -z "$urls" ]; then
  echo "No <loc> URLs found in https://$HOST/sitemap.xml"
  exit 1
fi
list=$(printf '%s\n' "$urls" | sed 's/.*/"&"/' | paste -sd, -)
list="[$list]"

# 3. Submit.
curl -sS -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "{\"host\":\"$HOST\",\"key\":\"$KEY\",\"keyLocation\":\"https://$HOST/$KEY.txt\",\"urlList\":$list}" \
  -w "\nIndexNow submit -> HTTP %{http_code}\n"
