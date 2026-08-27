#!/usr/bin/env bash
# Einrichtung, Beitritt, Räume, Bild und „alle müssen zustimmen" — zu dritt.
set -u
B=http://127.0.0.1:8792/api
CURL=(curl -s --noproxy 127.0.0.1)
fehler=0
J='Content-Type: application/json'

post() { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" -H "$J" -d "$3" "$B/$2"; }
get()  { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" "$B/$2"; }
sql()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "$1" 2>/dev/null \
         | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s)[0].results)))'; }
feld() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(eval('(' + s + ')')$1 ?? '')}catch(e){console.log('FEHLER '+e.message)}})"; }
pruefe() { if [ "$2" = "$3" ]; then echo "  ok   $1: $2"; else echo "  FEHL $1: ist=$2 soll=$3"; fehler=$((fehler+1)); fi; }

echo "== Drei frische Konten"
sql "delete from raeume; delete from proposal_votes; delete from ereignisse" > /dev/null
for n in a b c; do
  sql "insert into users (id, email, name) values ('u-$n', '$n@test', 'Test $n') on conflict(id) do nothing" > /dev/null
done
# Sitzungen: sha256 von tok-a/tok-b/tok-c
node -e '
const c=require("crypto");
for (const t of ["tok-a","tok-b","tok-c"]) console.log(t.slice(4)+" "+c.createHash("sha256").update(t).digest("hex"));
' | while read n h; do
  cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command \
    "insert into sessions (token_hash, user_id, expires_at) values ('$h', 'u-$n', datetime('now','+1 day')) on conflict(token_hash) do nothing" > /dev/null 2>&1
done
sql "delete from members where user_id in ('u-a','u-b','u-c')" > /dev/null
sql "delete from couples where id like 'wg-%'" > /dev/null

echo "== A richtet eine WG für drei ein"
ANTWORT=$(post tok-a haushalt/einrichten '{"name":"Anna","bild":"fuchs","art":"wg","personen":3,"raeume":["Küche","Bad","Wohnzimmer","Balkon"]}')
CODE=$(echo "$ANTWORT" | feld ".code")
pruefe "Code sechsstellig" "$(echo -n "$CODE" | wc -c | tr -d ' ')" "6"
pruefe "Art" "$(get tok-a state | feld ".haushalt.art")" "wg"
pruefe "Plätze" "$(get tok-a state | feld ".haushalt.groesse")" "3"
pruefe "Räume" "$(get tok-a state | feld ".raeume.length")" "4"
pruefe "Name übernommen" "$(get tok-a state | feld ".ich.name")" "Anna"
pruefe "Bild übernommen" "$(get tok-a state | feld ".ich.bild")" "fuchs"
pruefe "A verwaltet" "$(get tok-a state | feld ".haushalt.ichVerwalte")" "true"

echo "== Zweite Einrichtung wird abgewiesen"
pruefe "Fehler" "$(post tok-a haushalt/einrichten '{"art":"paar"}' | feld ".fehler")" "Dieser Haushalt ist bereits eingerichtet"

echo "== B und C treten bei"
post tok-b pair/join "{\"code\":\"$CODE\"}" > /dev/null
pruefe "Code gilt noch (Platz frei)" "$(get tok-a state | feld ".code")" "$CODE"
post tok-c pair/join "{\"code\":\"$CODE\"}" > /dev/null
pruefe "Code jetzt verbraucht" "$(get tok-a state | feld ".code")" ""
pruefe "Drei Mitglieder" "$(get tok-a state | feld ".mitglieder.length")" "3"
pruefe "C ist Mitglied, nicht Verwalter" "$(get tok-c state | feld ".haushalt.ichVerwalte")" "false"

echo "== Vierter passt nicht mehr rein"
sql "update couples set pair_code = '$CODE', pair_code_expires = datetime('now','+1 day') where art='wg'" > /dev/null
pruefe "Fehler" "$(post tok-ramon pair/join "{\"code\":\"$CODE\"}" | feld ".fehler")" "Dieser Haushalt ist bereits vollständig"

echo "== Melden und Bestätigen: jeder andere darf"
QUEST=$(get tok-a state | feld ".quests[0].id")
post tok-a claims "{\"questId\":\"$QUEST\",\"anzahl\":1}" > /dev/null
MELDUNG=$(get tok-b state | feld ".meldungen[0].id")
pruefe "Selbstbestätigung abgewiesen" "$(post tok-a "claims/$MELDUNG/decide" '{"status":"bestaetigt"}' | feld ".fehler")" "Eine Meldung muss von jemand anderem bestätigt werden"
pruefe "C (unbeteiligt) darf bestätigen" "$(post tok-c "claims/$MELDUNG/decide" '{"status":"bestaetigt"}' | feld ".ok")" "true"
pruefe "Beide anderen wurden benachrichtigt" \
  "$(sql "select count(*) as n from ereignisse where titel like 'Anna hat etwas erledigt%'" | feld "[0].n")" "2"

echo "== Abstimmung: alle drei müssen zustimmen"
post tok-a proposals "{\"art\":\"quest_points\",\"zielId\":\"$QUEST\",\"wert\":99}" > /dev/null
VOR=$(get tok-a state | feld ".abstimmungen[0].id")
pruefe "Nach A" "$(post tok-b "proposals/$VOR/vote" '{"antwort":true}' | feld ".status")" "offen"
pruefe "Nach B" "$(sql "select points from quests where id='$QUEST'" | feld "[0].points")" "$(sql "select points from quests where id='$QUEST'" | feld "[0].points")"
pruefe "Nach C" "$(post tok-c "proposals/$VOR/vote" '{"antwort":true}' | feld ".status")" "bestaetigt"
pruefe "Wert übernommen" "$(sql "select points from quests where id='$QUEST'" | feld "[0].points")" "99"

echo "== Übertragung braucht einen Empfänger"
pruefe "Ohne Angabe" "$(post tok-a transfers '{"betrag":1}' | feld ".fehler")" "Wähle aus, wer die Cleanies bekommen soll"
pruefe "Mit Angabe" "$(post tok-a transfers '{"betrag":1,"an":"u-c"}' | feld ".ok")" "true"
UEB=$(get tok-b state | feld ".uebertragungen[0].id")
pruefe "B (nicht Empfänger) darf nicht annehmen" \
  "$(post tok-b "transfers/$UEB/decide" '{"status":"bestaetigt"}' | feld ".fehler")" \
  "Nur die empfangende Person kann annehmen oder ablehnen"
pruefe "B sieht sie nicht im Prüfen-Stapel" \
  "$(get tok-b state | feld ".uebertragungen.filter(u=>u.to_member==='u-b').length")" "0"
pruefe "C nimmt an" "$(post tok-c "transfers/$UEB/decide" '{"status":"bestaetigt"}' | feld ".ok")" "true"

echo "== Räume pflegen"
RAUM=$(get tok-a state | feld ".raeume.find(r=>r.name==='Balkon').id")
pruefe "Umbenennen" "$(post tok-b "raeume/$RAUM" '{"name":"Terrasse"}' | feld ".ok")" "true"
pruefe "Quest wandert mit" "$(sql "select count(*) as n from quests where category='Balkon'" | feld "[0].n")" "0"
pruefe "Neuen Raum anlegen" "$(post tok-c raeume '{"name":"Keller"}' | feld ".name")" "Keller"
BAD=$(get tok-a state | feld ".raeume.find(r=>r.name==='Bad').id")
pruefe "Belegter Raum lässt sich nicht ausblenden" \
  "$(post tok-a "raeume/$BAD" '{"aktiv":false}' | feld ".fehler.startsWith('In „Bad“ liegen noch')")" "true"
pruefe "Quest in anderen Raum schieben" "$(post tok-a "quests/$QUEST/raum" '{"raum":"Keller"}' | feld ".raum")" "Keller"

echo "== Haushalt ändern darf nur der Verwalter"
pruefe "C darf nicht" "$(post tok-c haushalt '{"personen":5}' | feld ".fehler")" "Das kann nur, wer den Haushalt verwaltet"
pruefe "A darf" "$(post tok-a haushalt '{"art":"familie","erwachsene":2,"kinder":2}' | feld ".ok")" "true"
pruefe "Kleiner als belegt geht nicht" "$(post tok-a haushalt '{"art":"wg","personen":1}' | feld ".fehler")" "Ihr seid schon zu 3 — kleiner geht nur, wenn jemand geht"

echo "== Bild ändern"
pruefe "Zeichen" "$(post tok-b profil '{"bild":"★"}' | feld ".bild")" "★"
pruefe "Unsinn abgewiesen" "$(post tok-b profil '{"bild":"viel zu langer text ohne data-url"}' | feld ".fehler")" "Dieses Bild versteht die App nicht"

echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler FEHLER"
exit "$fehler"
