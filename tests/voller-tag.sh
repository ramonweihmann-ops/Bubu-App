#!/usr/bin/env bash
# Ein voller, aber realistischer Tag in einer Dreier-WG — aus Sicht von A.
# Damit lässt sich die Startseite so zeigen, wie sie im Alltag wirklich aussieht.
set -u
B=http://127.0.0.1:8792/api
CURL=(curl -s --noproxy 127.0.0.1 -m 20)
J='Content-Type: application/json'
post() { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" -H "$J" -d "$3" "$B/$2"; }
get()  { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" "$B/$2"; }
roh()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "$1" > /dev/null 2>&1; }
feld() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(eval('(' + s + ')')$1 ?? '')}catch(e){console.log('')}})"; }

roh "delete from urlaube; delete from requests; delete from claims; delete from transfers; delete from ereignisse; delete from ledger; delete from aktionen"
roh "delete from proposal_votes; delete from proposals"
roh "delete from rewards where event_id is not null; delete from quests where event_id is not null; delete from events"
roh "update quests set wiederkehrend = 0, faellig_am = null, zugewiesen = null, dran = null, vergabe_runde = null, mahnung_runde = null, strafe_runde = null"
roh "update couples set strafe_an = 1"

# Kontostände mit Geschichte: ein paar bestätigte Quests der letzten Tage.
PAAR=$(cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "select couple_id from members where user_id='u-a'" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].results[0].couple_id))')
for i in 1 2 3 4 5 6 7 8; do
  wer=$([ $((i % 3)) -eq 0 ] && echo u-c || ([ $((i % 2)) -eq 0 ] && echo u-b || echo u-a))
  roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type, created_at) values ('voll-$i', '$PAAR', '$wer', $((3 + i)), 'Quest: Küche aufräumen', 'claim', datetime('now', '-$((i * 3)) hours'))"
done
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type, created_at) values ('voll-start-a', '$PAAR', 'u-a', 60, 'Startguthaben', 'start', datetime('now','-9 days'))"
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type, created_at) values ('voll-start-b', '$PAAR', 'u-b', 45, 'Startguthaben', 'start', datetime('now','-9 days'))"
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type, created_at) values ('voll-start-c', '$PAAR', 'u-c', 30, 'Startguthaben', 'start', datetime('now','-9 days'))"

Q=$(get tok-a state | feld ".quests.filter(q=>!q.event_id).map(q=>q.id).join(' ')")
set -- $Q
Q1=$1; Q2=$2; Q3=$3; Q4=$4; Q5=$5; Q6=$6

# Zwei Aufgaben im Plan: eine seit drei Tagen überfällig, eine gehört heute A.
roh "update quests set wiederkehrend = 1, rhythmus = '1× pro Woche', tage = 7, faellig_am = date('now','-3 days'), mahnung_runde = date('now','-3 days') where id = '$Q5'"
roh "update quests set wiederkehrend = 1, rhythmus = '2× pro Woche', tage = 3, faellig_am = date('now'), zugewiesen = 'u-a', vergabe_runde = date('now') where id = '$Q6'"

# Drei Meldungen der anderen warten auf A.
post tok-b claims "{\"questId\":\"$Q1\",\"notiz\":\"Auch die Fensterbänke\"}" > /dev/null
post tok-c claims "{\"questId\":\"$Q2\"}" > /dev/null
post tok-b claims "{\"questId\":\"$Q3\",\"anzahl\":2}" > /dev/null

# A hat zwei eigene Meldungen offen — eine davon mit Rückfrage von B.
post tok-a claims "{\"questId\":\"$Q4\"}" > /dev/null
post tok-a claims "{\"questId\":\"$Q1\"}" > /dev/null
EIGENE=$(get tok-b state | feld ".meldungen.find(m=>m.claimed_by==='u-a').id")
post tok-b "claims/$EIGENE/rueckfrage" '{"text":"Hast du auch den Herd gemacht?"}' > /dev/null

# A schuldet B eine Belohnung.
BEL=$(get tok-b state | feld ".belohnungen.find(b=>b.bestaetigen===1 && !b.event_id).id")
post tok-b requests "{\"rewardId\":\"$BEL\",\"termin\":\"Samstag\"}" > /dev/null
ANTRAG=$(get tok-a state | feld ".antraege[0].id")
post tok-a "requests/$ANTRAG/decide" '{"status":"bestaetigt"}' > /dev/null

# Eine laufende Aktion und ein laufendes Event.
roh "insert into aktionen (id, couple_id, art, prozent, kategorie, beginn, ende, created_by) values ('voll-akt', '$PAAR', 'quest_bonus', 50, null, datetime('now','-1 hour'), datetime('now','+2 days'), 'u-b')"
post tok-b proposals '{"art":"neues_event","richtung":"ausgeben","titel":"Pizza-Abend aussuchen","cleanies":15,"proPerson":1,"zeitart":"dauer","laenge":3}' > /dev/null
V=$(get tok-b state | feld ".abstimmungen[0].id")
post tok-a "proposals/$V/vote" '{"antwort":true}' > /dev/null
post tok-c "proposals/$V/vote" '{"antwort":true}' > /dev/null

# Zwei offene Abstimmungen, bei denen A noch fehlt.
post tok-b proposals '{"art":"new_quest","wert":6,"name":"Altglas wegbringen","kategorie":"Küche","grund":"Stapelt sich"}' > /dev/null
post tok-c proposals "{\"art\":\"quest_points\",\"zielId\":\"$Q2\",\"wert\":9,\"grund\":\"Dauert länger als gedacht\"}" > /dev/null

echo "Voller Tag steht."
