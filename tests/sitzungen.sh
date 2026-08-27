#!/usr/bin/env bash
cd /workspace/bubu-app
node -e '
const c=require("crypto");
for (const t of ["tok-ramon","tok-crusty","tok-a","tok-b","tok-c","tok-d","tok-e","tok-f"])
  console.log(t.slice(4)+" "+c.createHash("sha256").update(t).digest("hex"));
' | while read n h; do
  npx wrangler d1 execute haus-quest --local --command \
    "insert into users (id,email,name) values ('u-$n','$n@test','Konto $n') on conflict(id) do nothing" > /dev/null 2>&1
  npx wrangler d1 execute haus-quest --local --command \
    "insert into sessions (token_hash,user_id,expires_at) values ('$h','u-$n',datetime('now','+1 day')) on conflict(token_hash) do update set user_id='u-$n', expires_at=datetime('now','+1 day')" > /dev/null 2>&1
done
echo "Sitzungen frisch"
