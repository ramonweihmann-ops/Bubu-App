#!/usr/bin/env bash
# Cleanies einer Belohnung dem Empfänger gutschreiben.
set -u
B=http://127.0.0.1:8792/api
CURL=(curl -s --noproxy 127.0.0.1 -m 20)
fehler=0
J='Content-Type: application/json'

post() { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" -H "$J" -d "$3" "$B/$2"; }
get()  { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" "$B/$2"; }
sql()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "$1" 2>/dev/null \
         | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s)[0].results)))'; }
roh()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "$1" > /dev/null 2>&1; }
feld() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(eval('(' + s + ')')$1 ?? '')}catch(e){console.log('FEHLER '+e.message)}})"; }
pruefe() { if [ "$2" = "$3" ]; then echo "  ok   $1: $2"; else echo "  FEHL $1: ist=$2 soll=$3"; fehler=$((fehler+1)); fi; }
punkte() { sql "select coalesce(sum(delta),0) as n from ledger where member_id='$1'" | feld "[0].n"; }

echo "== Aufräumen und Guthaben geben"
roh "delete from urlaube; delete from requests; delete from claims; delete from transfers; delete from ereignisse; delete from ledger"
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 100, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')"
BEL=$(get tok-a state | feld ".belohnungen.find(b=>b.bestaetigen===1).id")
KOSTEN=$(get tok-a state | feld ".belohnungen.find(b=>b.bestaetigen===1).cost")

echo "== Ohne Haken bleibt alles wie vorher"
post tok-a requests "{\"rewardId\":\"$BEL\"}" > /dev/null
A1=$(get tok-b state | feld ".antraege[0].id")
pruefe "Keine Gutschrift vermerkt" "$(get tok-b state | feld ".antraege[0].gutschrift_an")" ""
VOR_A=$(punkte u-a); VOR_B=$(punkte u-b)
post tok-b "requests/$A1/decide" '{"status":"bestaetigt"}' > /dev/null
pruefe "A hat bezahlt" "$(punkte u-a)" "$((VOR_A - KOSTEN))"
pruefe "B bekommt nichts" "$(punkte u-b)" "$VOR_B"
pruefe "Genau eine Buchung" "$(sql "select count(*) as n from ledger where source_id like '$A1%'" | feld "[0].n")" "1"

echo "== Mit Haken landen sie beim Empfänger"
post tok-a requests "{\"rewardId\":\"$BEL\",\"gutschriftAn\":\"u-b\"}" > /dev/null
A2=$(get tok-b state | feld ".antraege[0].id")
pruefe "Gutschrift steht im Antrag" "$(get tok-b state | feld ".antraege[0].gutschrift_an")" "u-b"
VOR_A=$(punkte u-a); VOR_B=$(punkte u-b); VOR_C=$(punkte u-c)
post tok-b "requests/$A2/decide" '{"status":"bestaetigt"}' > /dev/null
pruefe "A hat bezahlt" "$(punkte u-a)" "$((VOR_A - KOSTEN))"
pruefe "B hat bekommen" "$(punkte u-b)" "$((VOR_B + KOSTEN))"
pruefe "C bleibt unberührt" "$(punkte u-c)" "$VOR_C"
pruefe "Zwei Buchungen" "$(sql "select count(*) as n from ledger where source_id like '$A2%'" | feld "[0].n")" "2"
pruefe "Gutschrift nennt den Absender" "$(sql "select reason from ledger where source_id='$A2:gut'" | feld "[0].reason.includes('(von ')")" "true"

echo "== Wer genehmigt, muss nicht der Empfänger sein"
post tok-a requests "{\"rewardId\":\"$BEL\",\"gutschriftAn\":\"u-c\"}" > /dev/null
A3=$(get tok-b state | feld ".antraege[0].id")
VOR_B=$(punkte u-b); VOR_C=$(punkte u-c)
post tok-b "requests/$A3/decide" '{"status":"bestaetigt"}' > /dev/null
pruefe "C bekommt die Cleanies" "$(punkte u-c)" "$((VOR_C + KOSTEN))"
pruefe "B bekommt nichts" "$(punkte u-b)" "$VOR_B"

echo "== Abgelehnt bucht gar nichts"
post tok-a requests "{\"rewardId\":\"$BEL\",\"gutschriftAn\":\"u-b\"}" > /dev/null
A4=$(get tok-b state | feld ".antraege[0].id")
VOR_A=$(punkte u-a); VOR_B=$(punkte u-b)
post tok-b "requests/$A4/decide" '{"status":"abgelehnt"}' > /dev/null
pruefe "A behält alles" "$(punkte u-a)" "$VOR_A"
pruefe "B bekommt nichts" "$(punkte u-b)" "$VOR_B"

echo "== Unsinn wird abgewiesen"
pruefe "Sich selbst geht nicht" "$(post tok-a requests "{\"rewardId\":\"$BEL\",\"gutschriftAn\":\"u-a\"}" | feld ".fehler")" "Dir selbst kannst du die Cleanies nicht gutschreiben"
pruefe "Fremde gehen nicht" "$(post tok-a requests "{\"rewardId\":\"$BEL\",\"gutschriftAn\":\"u-ramon\"}" | feld ".fehler")" "Diese Person gehört nicht zum Haushalt"

echo "== Nichts wird gemerkt: der nächste Antrag ist wieder ohne"
post tok-a requests "{\"rewardId\":\"$BEL\"}" > /dev/null
pruefe "Wieder leer" "$(get tok-b state | feld ".antraege[0].gutschrift_an")" ""

echo "== Bleibt einmalig, auch wenn zweimal entschieden wird"
A5=$(get tok-b state | feld ".antraege[0].id")
post tok-a requests "{\"rewardId\":\"$BEL\",\"gutschriftAn\":\"u-b\"}" > /dev/null
A6=$(get tok-b state | feld ".antraege.find(a=>a.id!=='$A5').id")
post tok-b "requests/$A6/decide" '{"status":"bestaetigt"}' > /dev/null
VOR_B=$(punkte u-b)
pruefe "Zweite Entscheidung abgewiesen" "$(post tok-c "requests/$A6/decide" '{"status":"bestaetigt"}' | feld ".fehler")" "Dieser Antrag ist bereits entschieden"
pruefe "B hat nicht doppelt bekommen" "$(punkte u-b)" "$VOR_B"

echo "== Kam nicht: die Gutschrift wird wieder abgezogen"
post tok-a requests "{\"rewardId\":\"$BEL\",\"gutschriftAn\":\"u-b\"}" > /dev/null
A7=$(get tok-b state | feld ".antraege[0].id")
post tok-b "requests/$A7/decide" '{"status":"bestaetigt"}' > /dev/null
NACH_ZUSAGE=$(punkte u-b)
post tok-a "requests/$A7/empfang" '{"erhalten":false}' > /dev/null
pruefe "B steht wieder wie vorher" "$(punkte u-b)" "$((NACH_ZUSAGE - KOSTEN))"

echo "== Aufräumen"
roh "delete from requests; delete from ereignisse"

echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler FEHLER"
exit "$fehler"
