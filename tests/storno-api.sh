#!/usr/bin/env bash
# Nachbessern und Zurückziehen einer noch offenen Anfrage.
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
ereignisse() { sql "select count(*) as n from ereignisse where quelle_id='$1'" | feld "[0].n"; }

echo "== Aufräumen und Guthaben geben"
roh "delete from urlaube; delete from requests; delete from claims; delete from transfers; delete from ereignisse; delete from ledger"
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 60, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')"

echo "== Eine Quest melden"
QUEST=$(get tok-a state | feld ".quests.find(q=>!q.wiederkehrend).id")
post tok-a claims "{\"questId\":\"$QUEST\",\"anzahl\":1,\"notiz\":\"kurz durchgewischt\"}" > /dev/null
MELD=$(get tok-b state | feld ".meldungen[0].id")
pruefe "B sieht sie im Stapel" "$(get tok-b state | feld ".meldungen.length")" "1"
pruefe "Zwei bekamen Bescheid" "$(ereignisse "$MELD")" "2"

echo "== Nur der Absender darf ran"
pruefe "B darf nicht ändern" "$(post tok-b "claims/$MELD/aendern" '{"nachricht":"hm"}' | feld ".fehler")" "Das kann nur, wer die Meldung abgeschickt hat"
pruefe "B darf nicht zurückziehen" "$(post tok-b "claims/$MELD/storno" '{}' | feld ".fehler")" "Das kann nur, wer die Meldung abgeschickt hat"
pruefe "Leere Ergänzung bringt nichts" "$(post tok-a "claims/$MELD/aendern" '{}' | feld ".fehler")" "Schreib etwas dazu, sonst ändert sich nichts"

echo "== A bessert nach"
pruefe "A ergänzt" "$(post tok-a "claims/$MELD/aendern" '{"nachricht":"Fenster waren auch dran"}' | feld ".ok")" "true"
pruefe "Notiz steht in der Meldung" "$(sql "select note from claims where id='$MELD'" | feld "[0].note")" "Fenster waren auch dran"
pruefe "B sieht den Hinweis" "$(get tok-b state | feld ".meldungen[0].note")" "Fenster waren auch dran"
pruefe "Meldung bleibt offen" "$(sql "select status from claims where id='$MELD'" | feld "[0].status")" "offen"
pruefe "Alte Nachricht ersetzt, nicht gestapelt" "$(ereignisse "$MELD")" "2"
pruefe "Absender bekommt keine Nachricht" "$(sql "select count(*) as n from ereignisse where quelle_id='$MELD' and user_id='u-a'" | feld "[0].n")" "0"

echo "== A zieht zurück"
pruefe "A zieht zurück" "$(post tok-a "claims/$MELD/storno" '{}' | feld ".zurueckgezogen")" "Die Meldung"
pruefe "Weg aus der Datenbank" "$(sql "select count(*) as n from claims where id='$MELD'" | feld "[0].n")" "0"
pruefe "Benachrichtigung mit weg" "$(ereignisse "$MELD")" "0"
pruefe "B sieht nichts mehr" "$(get tok-b state | feld ".meldungen.length")" "0"
pruefe "Auch kein Rückzugs-Hinweis" "$(sql "select count(*) as n from ereignisse" | feld "[0].n")" "0"
pruefe "Zweimal geht nicht" "$(post tok-a "claims/$MELD/storno" '{}' | feld ".fehler")" "Die Meldung nicht gefunden"

echo "== Dasselbe bei einer Belohnung"
BEL=$(get tok-a state | feld ".belohnungen[0].id")
post tok-a requests "{\"rewardId\":\"$BEL\",\"termin\":\"Freitag\",\"nachricht\":\"bitte\"}" > /dev/null
ANT=$(get tok-b state | feld ".antraege[0].id")
pruefe "A ändert Termin und Text" "$(post tok-a "requests/$ANT/aendern" '{"nachricht":"lieber später","termin":"Sonntag"}' | feld ".ok")" "true"
pruefe "Neuer Termin steht" "$(get tok-b state | feld ".antraege[0].wish_date")" "Sonntag"
pruefe "Neuer Text steht" "$(get tok-b state | feld ".antraege[0].message")" "lieber später"
pruefe "Kosten unverändert" "$(sql "select cost from requests where id='$ANT'" | feld "[0].cost")" "$(get tok-a state | feld ".belohnungen[0].cost")"
pruefe "A zieht zurück" "$(post tok-a "requests/$ANT/storno" '{}' | feld ".ok")" "true"
pruefe "B sieht nichts mehr" "$(get tok-b state | feld ".antraege.length")" "0"
pruefe "Keine Buchung entstanden" "$(sql "select count(*) as n from ledger where source_id='$ANT'" | feld "[0].n")" "0"

echo "== Und bei einer Übertragung"
post tok-a transfers '{"betrag":4,"an":"u-c","nachricht":"für dich"}' > /dev/null
UEB=$(get tok-c state | feld ".uebertragungen[0].id")
pruefe "C sieht sie" "$(get tok-c state | feld ".uebertragungen.length")" "1"
pruefe "A ergänzt" "$(post tok-a "transfers/$UEB/aendern" '{"nachricht":"war doch nicht so gemeint"}' | feld ".ok")" "true"
pruefe "C sieht die Ergänzung" "$(get tok-c state | feld ".uebertragungen[0].message")" "war doch nicht so gemeint"
pruefe "A zieht zurück" "$(post tok-a "transfers/$UEB/storno" '{}' | feld ".ok")" "true"
pruefe "C sieht nichts mehr" "$(get tok-c state | feld ".uebertragungen.length")" "0"
pruefe "Keine Nachricht übrig" "$(ereignisse "$UEB")" "0"

echo "== Was entschieden ist, bleibt entschieden"
post tok-a claims "{\"questId\":\"$QUEST\",\"anzahl\":1}" > /dev/null
M2=$(get tok-b state | feld ".meldungen[0].id")
post tok-b "claims/$M2/decide" '{"status":"bestaetigt"}' > /dev/null
pruefe "Kein Zurückziehen mehr" "$(post tok-a "claims/$M2/storno" '{}' | feld ".fehler")" "Die Meldung ist bereits entschieden — daran lässt sich nichts mehr ändern"
pruefe "Kein Nachbessern mehr" "$(post tok-a "claims/$M2/aendern" '{"nachricht":"doch nicht"}' | feld ".fehler")" "Die Meldung ist bereits entschieden — daran lässt sich nichts mehr ändern"
pruefe "Buchung steht" "$(sql "select count(*) as n from ledger where source_id='$M2'" | feld "[0].n")" "1"

echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler FEHLER"
exit "$fehler"
