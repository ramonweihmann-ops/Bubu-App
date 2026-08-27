#!/usr/bin/env bash
# Alle sieben Arten von Vorschlägen durchspielen: Vorschlag von Ramon,
# Zustimmung von Crusty -> muss "bestaetigt" sein UND übernommen worden sein.
set -u
B=http://127.0.0.1:8792/api
R='Cookie: hq_sitzung=tok-ramon'
C='Cookie: hq_sitzung=tok-crusty'
CURL=(curl -s --noproxy 127.0.0.1)
fehler=0

post() { "${CURL[@]}" -H "$1" -H 'Content-Type: application/json' -d "$3" "$B/$2"; }
get()  { "${CURL[@]}" -H "$1" "$B/$2"; }
sql()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "$1" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(JSON.stringify(j[0].results));})'; }

pruefe() { # name  ist  soll
  if [ "$2" = "$3" ]; then echo "  ok   $1: $2"; else echo "  FEHL $1: ist=$2 soll=$3"; fehler=$((fehler+1)); fi
}

offenId() { get "$R" state | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const v=(j.abstimmungen||[]).find(x=>x.status==="offen"||!x.status);console.log(v?v.id:"")})'; }

runde() { # beschriftung  json
  echo "== $1"
  local antwort id status
  antwort=$(post "$R" proposals "$2")
  echo "$antwort" | grep -q '"ok":true' || { echo "  FEHL Vorschlag abgelehnt: $antwort"; fehler=$((fehler+1)); return; }
  id=$(offenId)
  [ -n "$id" ] || { echo "  FEHL kein offener Vorschlag"; fehler=$((fehler+1)); return; }
  antwort=$(post "$C" "proposals/$id/vote" '{"antwort":true}')
  echo "     Antwort an den Empfänger: $antwort"
  status=$(sql "select status from proposals where id='$id'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].status))')
  pruefe "Status" "$status" "bestaetigt"
}

runde "Punktwert einer Quest (10 -> 12)" '{"art":"quest_points","zielId":"q-1","wert":12}'
pruefe "Punkte q-1" "$(sql "select points from quests where id='q-1'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].points))')" "12"

runde "Kosten einer Belohnung (50 -> 40)" '{"art":"reward_cost","zielId":"b-1","wert":40}'
pruefe "Kosten b-1" "$(sql "select cost from rewards where id='b-1'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].cost))')" "40"

runde "Neue Quest" '{"art":"new_quest","name":"Fenster putzen","kategorie":"Bad","wert":8}'
pruefe "Quest angelegt" "$(sql "select count(*) as n from quests where name='Fenster putzen' and points=8 and active=1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].n))')" "1"

runde "Neue Belohnung" '{"art":"new_reward","name":"Frühstück ans Bett","wert":25}'
pruefe "Belohnung angelegt" "$(sql "select count(*) as n from rewards where name='Frühstück ans Bett' and cost=25 and active=1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].n))')" "1"

runde "Quest löschen" '{"art":"delete_quest","zielId":"q-2"}'
pruefe "q-2 inaktiv" "$(sql "select active from quests where id='q-2'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].active))')" "0"

runde "Belohnung löschen" '{"art":"delete_reward","zielId":"b-2"}'
pruefe "b-2 inaktiv" "$(sql "select active from rewards where id='b-2'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].active))')" "0"

runde "Aktion: doppelte Punkte auf Bad, eine Woche" '{"art":"neue_aktion","aktionsart":"quest_bonus","prozent":100,"kategorie":"Bad","dauer":"woche"}'
pruefe "Aktion angelegt" "$(sql "select count(*) as n from aktionen where art='quest_bonus' and prozent=100 and kategorie='Bad'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].n))')" "1"

echo "== Ein Nein lässt alles beim Alten"
post "$R" proposals '{"art":"quest_points","zielId":"q-1","wert":99}' > /dev/null
NEIN=$(offenId)
post "$C" "proposals/$NEIN/vote" '{"antwort":false}' > /dev/null
pruefe "Status" "$(sql "select status from proposals where id='$NEIN'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].status))')" "abgelehnt"
pruefe "Punkte q-1 unverändert" "$(sql "select points from quests where id='q-1'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].points))')" "12"

echo "== Hängengebliebene Abstimmung heilt beim nächsten Laden"
sql "insert into proposals (id, couple_id, kind, target_id, old_value, new_value, name, created_by, status) values ('p-haenger','paar-1','quest_points','q-1',12,15,'Badezimmer putzen','u-ramon','offen')" > /dev/null
sql "insert into proposal_votes (proposal_id, member_id, answer) values ('p-haenger','u-ramon',1)" > /dev/null
sql "insert into proposal_votes (proposal_id, member_id, answer) values ('p-haenger','u-crusty',1)" > /dev/null
get "$R" state > /dev/null
pruefe "Status" "$(sql "select status from proposals where id='p-haenger'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].status))')" "bestaetigt"
pruefe "Punkte q-1 nachgezogen" "$(sql "select points from quests where id='q-1'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].points))')" "15"

echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler FEHLER"
exit "$fehler"
