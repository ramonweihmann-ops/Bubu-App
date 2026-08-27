#!/usr/bin/env bash
cd /workspace/bubu-app
sql() { npx wrangler d1 execute haus-quest --local --command "$1" > /dev/null 2>&1; }
sql "delete from couples where id in (select couple_id from members where user_id in ('u-d','u-e','u-f'))"
sql "delete from members where user_id in ('u-d','u-e','u-f')"
sql "update users set bild = null, name_gesetzt = 0 where id in ('u-d','u-e','u-f')"
sql "delete from ereignisse"
echo "zurückgesetzt"
