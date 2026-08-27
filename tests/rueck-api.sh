#!/usr/bin/env bash
# Rückfragen, Empfangsbestätigung, Strafe und Nachholung — zu dritt.
set -u
B=http://127.0.0.1:8792/api
CURL=(curl -s --noproxy 127.0.0.1 -m 20)
fehler=0
J='Content-Type: application/json'

post() { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" -H "$J" -d "$3" "$B/$2"; }
get()  { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" "$B/$2"; }
sql()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "$1" 2>/dev/null \
         | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s)[0].results)))'; }
feld() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(eval('(' + s + ')')$1 ?? '')}catch(e){console.log('FEHLER '+e.message)}})"; }
pruefe() { if [ "$2" = "$3" ]; then echo "  ok   $1: $2"; else echo "  FEHL $1: ist=$2 soll=$3"; fehler=$((fehler+1)); fi; }
punkte() { sql "select coalesce(sum(delta),0) as n from ledger where member_id='$1'" | feld "[0].n"; }

echo "== Aufräumen und Punkte geben"
sql "delete from requests; delete from claims; delete from ereignisse; delete from ledger" > /dev/null
sql "insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 50, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')" > /dev/null
BEL=$(get tok-a state | feld ".belohnungen.find(b=>b.bestaetigen===1).id")
BELNAME=$(get tok-a state | feld ".belohnungen.find(b=>b.bestaetigen===1).name")
VETO=$(get tok-a state | feld ".belohnungen.find(b=>b.bestaetigen===0) ? 'da' : 'fehlt'")
pruefe "Vetoantrag braucht keine Bestätigung" "$VETO" "da"

echo "== Rückfrage statt Ja oder Nein"
post tok-a requests "{\"rewardId\":\"$BEL\",\"termin\":\"Freitag\",\"nachricht\":\"bitte\"}" > /dev/null
ANT=$(get tok-b state | feld ".antraege[0].id")
pruefe "Eigene Rückfrage abgewiesen" "$(post tok-a "requests/$ANT/rueckfrage" '{"text":"passt das?"}' | feld ".fehler")" "Zu deinem eigenen Antrag kannst du nichts nachfragen"
pruefe "B fragt nach" "$(post tok-b "requests/$ANT/rueckfrage" '{"text":"Freitag schaffe ich nicht","termin":"Samstag"}' | feld ".ok")" "true"
pruefe "Antrag bleibt offen" "$(sql "select status from requests where id='$ANT'" | feld "[0].status")" "offen"
pruefe "A sieht die Rückfrage" "$(get tok-a state | feld ".antraege[0].rueckfrage")" "Freitag schaffe ich nicht"
pruefe "Vorschlag mitgeschickt" "$(get tok-a state | feld ".antraege[0].vorschlag_datum")" "Samstag"
pruefe "B darf nicht antworten" "$(post tok-b "requests/$ANT/antwort" '{"termin":"Sonntag"}' | feld ".fehler")" "Antworten kann nur, wer den Antrag gestellt hat"
pruefe "A antwortet" "$(post tok-a "requests/$ANT/antwort" '{"termin":"Samstag","nachricht":"passt"}' | feld ".ok")" "true"
pruefe "Rückfrage weg" "$(get tok-a state | feld ".antraege[0].rueckfrage")" ""
pruefe "Neuer Termin steht" "$(get tok-a state | feld ".antraege[0].wish_date")" "Samstag"

echo "== Genehmigen: Punkte weg, Empfang offen"
VOR_A=$(punkte u-a)
pruefe "B genehmigt" "$(post tok-b "requests/$ANT/decide" '{"status":"bestaetigt"}' | feld ".ok")" "true"
KOSTEN=$(sql "select cost from requests where id='$ANT'" | feld "[0].cost")
pruefe "A hat bezahlt" "$(punkte u-a)" "$((VOR_A - KOSTEN))"
pruefe "Steht auf offen" "$(get tok-a state | feld ".belohnungenOffen[0].erfuellt")" "offen"
pruefe "B ist der Schuldner" "$(get tok-a state | feld ".belohnungenOffen[0].decided_by")" "u-b"
pruefe "C kann nicht bestätigen" "$(post tok-c "requests/$ANT/empfang" '{"erhalten":true}' | feld ".fehler")" "Nur wer sie eingelöst hat, kann den Empfang bestätigen"

echo "== Kam nicht: Strafe für B"
VOR_B=$(punkte u-b)
pruefe "A meldet: kam nicht" "$(post tok-a "requests/$ANT/empfang" '{"erhalten":false}' | feld ".status")" "nicht_erhalten"
pruefe "B verliert die Punkte" "$(punkte u-b)" "$((VOR_B - KOSTEN))"
pruefe "A bekommt nichts zurück" "$(punkte u-a)" "$((VOR_A - KOSTEN))"
pruefe "Nur einmal" "$(post tok-a "requests/$ANT/empfang" '{"erhalten":false}' | feld ".fehler")" "Das steht bereits so"

echo "== Nachholen und Bestätigen"
pruefe "A darf nicht nachholen" "$(post tok-a "requests/$ANT/nachholen" '{}' | feld ".fehler")" "Das kann nur, wer die Belohnung zugesagt hat"
pruefe "B holt nach" "$(post tok-b "requests/$ANT/nachholen" '{}' | feld ".ok")" "true"
pruefe "Steht auf nachgeholt" "$(get tok-a state | feld ".belohnungenOffen[0].erfuellt")" "nachgeholt"
pruefe "B darf nicht selbst bestätigen" "$(post tok-b "requests/$ANT/nachhol-pruefen" '{"ja":true}' | feld ".fehler")" "Das bestätigt, wer die Belohnung eingelöst hat"
pruefe "A bestätigt" "$(post tok-a "requests/$ANT/nachhol-pruefen" '{"ja":true}' | feld ".status")" "erhalten"
pruefe "B hat die Punkte zurück" "$(punkte u-b)" "$VOR_B"
pruefe "Nichts mehr offen" "$(get tok-a state | feld ".belohnungenOffen.length")" "0"

echo "== Nach drei Tagen ist Schluss"
post tok-a requests "{\"rewardId\":\"$BEL\",\"termin\":\"heute\"}" > /dev/null
ANT2=$(get tok-b state | feld ".antraege[0].id")
post tok-b "requests/$ANT2/decide" '{"status":"bestaetigt"}' > /dev/null
post tok-a "requests/$ANT2/empfang" '{"erhalten":false}' > /dev/null
sql "update requests set strafe_am = datetime('now','-4 days') where id='$ANT2'" > /dev/null
pruefe "Zu spät" "$(post tok-b "requests/$ANT2/nachholen" '{}' | feld ".fehler")" "Die 3 Tage sind vorbei — das lässt sich nicht mehr zurückholen"
pruefe "Nicht mehr nachholbar" "$(get tok-a state | feld ".belohnungenOffen[0].nachholbar")" "false"

echo "== Ein Vetoantrag braucht keine Bestätigung"
VETOID=$(get tok-a state | feld ".belohnungen.find(b=>b.bestaetigen===0).id")
post tok-a requests "{\"rewardId\":\"$VETOID\"}" > /dev/null
ANT3=$(get tok-b state | feld ".antraege[0].id")
post tok-b "requests/$ANT3/decide" '{"status":"bestaetigt"}' > /dev/null
pruefe "Direkt erledigt" "$(sql "select erfuellt from requests where id='$ANT3'" | feld "[0].erfuellt")" "erhalten"
pruefe "Steht nicht im Stapel" "$(get tok-a state | feld ".belohnungenOffen.filter(r=>r.id==='$ANT3').length")" "0"

echo "== Rückfrage geht auch bei einer Quest"
QUEST=$(get tok-a state | feld ".quests[0].id")
post tok-a claims "{\"questId\":\"$QUEST\",\"anzahl\":1}" > /dev/null
MELD=$(get tok-b state | feld ".meldungen[0].id")
pruefe "B fragt nach" "$(post tok-b "claims/$MELD/rueckfrage" '{"text":"War die Dusche auch dabei?"}' | feld ".ok")" "true"
pruefe "Meldung bleibt offen" "$(sql "select status from claims where id='$MELD'" | feld "[0].status")" "offen"
pruefe "A antwortet" "$(post tok-a "claims/$MELD/antwort" '{"nachricht":"Ja, alles"}' | feld ".ok")" "true"
pruefe "Notiz übernommen" "$(sql "select note from claims where id='$MELD'" | feld "[0].note")" "Ja, alles"
pruefe "B kann jetzt bestätigen" "$(post tok-b "claims/$MELD/decide" '{"status":"bestaetigt"}' | feld ".ok")" "true"

echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler FEHLER"
exit "$fehler"
