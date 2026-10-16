#!/usr/bin/env bash
# Der Familienmodus: Kinder ohne Google-Konto, wer was bestätigen darf, der
# Code fürs eigene Gerät, Taschengeld, Für wen, Eltern-PIN und Abstimmungen
# nur unter Erwachsenen und Jugendlichen. Eine eigene Familie, eigene Konten.
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

echo "== Frische Familie: Mama, Papa, Jule (jugendlich) und Sina (allein)"
roh "delete from couples where id in (select couple_id from members where user_id in ('u-fm','u-fp','u-fj','u-fs'))"
roh "delete from users where id like 'kind-%' and id not in (select user_id from members)"
for n in fm fp fj fs; do
  roh "insert into users (id, email, name) values ('u-$n', '$n@test', 'Konto $n') on conflict(id) do update set name_gesetzt = 0"
done
node -e '
const c=require("crypto");
for (const t of ["tok-fm","tok-fp","tok-fj","tok-fs"]) console.log(t.slice(4)+" "+c.createHash("sha256").update(t).digest("hex"));
' | while read n h; do
  roh "insert into sessions (token_hash, user_id, expires_at) values ('$h', 'u-$n', datetime('now','+1 day')) on conflict(token_hash) do update set expires_at = datetime('now','+1 day')"
done

CODE=$(post tok-fm haushalt/einrichten '{"name":"Mama","art":"familie","erwachsene":2,"kinder":1,"raeume":["Küche","Bad"]}' | feld ".code")
post tok-fp pair/join "{\"code\":\"$CODE\",\"name\":\"Papa\"}" > /dev/null
post tok-fp profil '{"name":"Papa"}' > /dev/null
post tok-fj pair/join "{\"code\":\"$CODE\"}" > /dev/null
post tok-fj profil '{"name":"Jule"}' > /dev/null
pruefe "Drei mit Google" "$(get tok-fm state | feld ".mitglieder.length")" "3"
pruefe "Die Familie" "$(get tok-fm state | feld ".haushalt.art")" "familie"

echo "== Ein Kind anlegen: nur mit Einwilligung, nur von Erwachsenen"
pruefe "Ohne Einwilligung" "$(post tok-fm kinder '{"name":"Lena","tier":"🦊"}' | feld ".fehler")" "Ohne Einwilligung der Eltern geht es nicht"
pruefe "Zu kurzer Name" "$(post tok-fm kinder '{"name":"L","einwilligung":true}' | feld ".fehler")" "Der Vorname braucht mindestens zwei Zeichen"
pruefe "Jugendliche nicht so" "$(post tok-fm kinder '{"name":"Max","stufe":"gross","einwilligung":true}' | feld ".fehler")" "Jugendliche kommen mit eigenem Google-Konto über den Einladungscode"
pruefe "Kein Tier" "$(post tok-fm kinder '{"name":"Lena","tier":"<b>","einwilligung":true}' | feld ".fehler")" "Das ist kein Tier"
LENA=$(post tok-fm kinder '{"name":"Lena","tier":"🦊","stufe":"ohne","taschengeld":true,"einwilligung":true}' | feld ".id")
TOM=$(post tok-fm kinder '{"name":"Tom","tier":"🐼","stufe":"geraet","einwilligung":true}' | feld ".id")
pruefe "Lena ist da" "${LENA:0:5}" "kind-"
pruefe "Ohne E-Mail" "$(sql "select email from users where id = '$LENA'" | feld "[0].email")" ""
pruefe "Einwilligung vermerkt" "$(sql "select einwilligung_von as v from members where user_id = '$LENA'" | feld "[0].v")" "u-fm"
pruefe "Fünf im Haushalt" "$(get tok-fm state | feld ".mitglieder.length")" "5"
pruefe "Plätze wachsen mit" "$(get tok-fm state | feld ".haushalt.groesse")" "5"
pruefe "Lena: Kind ohne Handy" "$(get tok-fm state | feld ".mitglieder.find(m => m.id === '$LENA').stufe")" "ohne"
pruefe "Wünsche für Kinder angelegt" "$(get tok-fm state | feld ".belohnungen.filter(b => b.fuer === 'kinder').length")" "5"
pruefe "Nur einmal" "$(sql "select count(*) as n from rewards r join members m on m.couple_id = r.couple_id where m.user_id = 'u-fm' and r.fuer = 'kinder'" | feld "[0].n")" "5"
pruefe "Fünf Aufgaben für Kinder" "$(get tok-fm state | feld ".quests.filter(q => q.fuer === 'kinder').length")" "5"
pruefe "Die alten Quests bei den Großen" "$(get tok-fm state | feld ".quests.filter(q => q.fuer === 'alle').length")" "0"

echo "== Jule ist jugendlich"
pruefe "Sich selbst nicht" "$(post tok-fm mitglieder/u-fm/jugendlich '{"ja":true}' | feld ".fehler")" "Dich selbst stufst du nicht ein"
pruefe "Mama führt Jule als jugendlich" "$(post tok-fm mitglieder/u-fj/jugendlich '{"ja":true}' | feld ".jugendlich")" "true"
pruefe "Jule legt keine Kinder an" "$(post tok-fj kinder '{"name":"Mia","einwilligung":true}' | feld ".fehler")" "Das machen die Erwachsenen"

echo "== Für wen eine Quest gilt — sofort, nur Erwachsene"
Q=$(get tok-fm state | feld ".quests.find(q => q.name.startsWith('Spülmaschine')).id")
E=$(get tok-fm state | feld ".quests.find(q => q.name === 'Bad reinigen').id")
W=$(get tok-fm state | feld ".belohnungen.find(b => b.name === '30 Minuten Tablet').id")
G=$(get tok-fm state | feld ".belohnungen.find(b => b.fuer === 'erwachsene').id")
pruefe "Spülmaschine für Kinder" "$(post tok-fm "quests/$Q/fuer" '{"fuer":"kinder"}' | feld ".fuer")" "kinder"
pruefe "Bad für Erwachsene" "$(post tok-fp "quests/$E/fuer" '{"fuer":"erwachsene"}' | feld ".fuer")" "erwachsene"
pruefe "Jule darf das nicht" "$(post tok-fj "quests/$E/fuer" '{"fuer":"alle"}' | feld ".fehler")" "Das machen die Erwachsenen"
pruefe "Unbekannt" "$(post tok-fm "quests/$E/fuer" '{"fuer":"hunde"}' | feld ".fehler")" "Das gibt es nicht"

echo "== Die Kinderansicht auf Mamas Handy spricht für Lena"
pruefe "Lena meldet" "$(post tok-fm claims "{\"questId\":\"$Q\",\"alsKind\":\"$LENA\"}" | feld ".ok")" "true"
M1=$(get tok-fm state | feld ".meldungen.find(m => m.claimed_by === '$LENA').id")
pruefe "Die Meldung gehört Lena" "${M1:+da}" "da"
pruefe "Nicht für die Großen" "$(post tok-fm claims "{\"questId\":\"$E\",\"alsKind\":\"$LENA\"}" | feld ".fehler")" "Diese Quest ist für die Großen"
pruefe "Kein Abstimmen als Kind" "$(post tok-fm proposals "{\"art\":\"quest_points\",\"zielId\":\"$Q\",\"wert\":9,\"alsKind\":\"$LENA\"}" | feld ".fehler")" "Das geht in der Kinderansicht nicht"
pruefe "Nicht für Jule" "$(post tok-fm claims "{\"questId\":\"$Q\",\"alsKind\":\"u-fj\"}" | feld ".fehler")" "Jugendliche nutzen ihr eigenes Konto"
pruefe "Papa spricht auch für Lena" "$(post tok-fp kind/ansicht "{\"ansicht\":\"weg\",\"alsKind\":\"$LENA\"}" | feld ".ansicht")" "weg"
pruefe "Jule nicht" "$(post tok-fj kind/ansicht "{\"ansicht\":\"glas\",\"alsKind\":\"$LENA\"}" | feld ".fehler")" "Das machen die Erwachsenen"

echo "== Kinder bestätigen nie Kinder"
pruefe "Jule bestätigt Lena nicht" "$(post tok-fj "claims/$M1/decide" '{"status":"bestaetigt"}' | feld ".fehler")" "Bei Kindern bestätigt immer ein Erwachsener"
PUNKTE=$(get tok-fm state | feld ".quests.find(q => q.id === '$Q').points")
pruefe "Papa bestätigt" "$(post tok-fp "claims/$M1/decide" '{"status":"bestaetigt"}' | feld ".punkte")" "$PUNKTE"
pruefe "Lena hat die Cleanies" "$(get tok-fm state | feld ".mitglieder.find(m => m.id === '$LENA').punkte")" "$PUNKTE"
pruefe "Heute geschafft" "$(get tok-fm state | feld ".heute.find(h => h.wer === '$LENA' && h.quest === '$Q').n")" "1"
pruefe "Lena hat keine Nachrichten" "$(sql "select count(*) as n from ereignisse where user_id = '$LENA'" | feld "[0].n")" "0"

echo "== Für ein Kind eintragen zählt sofort"
pruefe "Jule darf nicht" "$(post tok-fj claims "{\"questId\":\"$Q\",\"fuer\":\"$LENA\"}" | feld ".fehler")" "Das machen die Erwachsenen"
pruefe "Mama trägt für Lena ein" "$(post tok-fm claims "{\"questId\":\"$Q\",\"fuer\":\"$LENA\",\"anzahl\":2}" | feld ".punkte")" "$((PUNKTE * 2))"
pruefe "Bestätigt von Mama" "$(sql "select decided_by as d from claims where claimed_by = '$LENA' order by created_at desc limit 1" | feld "[0].d")" "u-fm"
pruefe "Lena: dreimal" "$(get tok-fm state | feld ".mitglieder.find(m => m.id === '$LENA').punkte")" "$((PUNKTE * 3))"
pruefe "Nicht für Erwachsene eintragen" "$(post tok-fm claims "{\"questId\":\"$Q\",\"fuer\":\"u-fp\"}" | feld ".fehler")" "Dieses Kind gibt es nicht"

echo "== Toms eigenes Gerät: ein Code statt Google"
pruefe "Lena hat kein Gerät" "$(post tok-fm "kinder/$LENA/code" '{}' | feld ".fehler")" "Stell Lena erst auf „Eigenes Gerät“"
KC=$(post tok-fm "kinder/$TOM/code" '{}' | feld ".code")
pruefe "Acht Zeichen mit Strich" "${#KC}" "9"
pruefe "Falsches Format" "$("${CURL[@]}" -H "$J" -d '{"code":"123"}' "$B/kind/anmelden" | feld ".fehler")" "Der Code hat acht Zeichen"
KEKS=$("${CURL[@]}" -D - -o /dev/null -H "$J" -d "{\"code\":\"$KC\"}" "$B/kind/anmelden" | grep -i '^set-cookie' | sed -E 's/.*hq_sitzung=([^;]*).*/\1/' | tr -d '\r')
pruefe "Eine Sitzung" "${KEKS:+da}" "da"
pruefe "Nur einmal" "$("${CURL[@]}" -H "$J" -d "{\"code\":\"$KC\"}" "$B/kind/anmelden" | feld ".fehler")" "Dieser Code ist unbekannt oder abgelaufen"
pruefe "Tom ist angemeldet" "$(get "$KEKS" state | feld ".ich.name")" "Tom"
pruefe "Als Kind mit Gerät" "$(get "$KEKS" state | feld ".ich.stufe")" "geraet"

echo "== Was Tom darf und was nicht"
pruefe "Keine Abstimmung" "$(post "$KEKS" proposals "{\"art\":\"quest_points\",\"zielId\":\"$Q\",\"wert\":9}" | feld ".fehler")" "Das machen die Erwachsenen"
pruefe "Kein Name ändern" "$(post "$KEKS" profil '{"name":"Tommy"}' | feld ".fehler")" "Das machen die Erwachsenen"
pruefe "Kein Übertragen" "$(post "$KEKS" transfers '{"betrag":1,"an":"u-fm"}' | feld ".fehler")" "Das machen die Erwachsenen"
pruefe "Tom meldet" "$(post "$KEKS" claims "{\"questId\":\"$Q\"}" | feld ".ok")" "true"
M2=$(get tok-fm state | feld ".meldungen.find(m => m.claimed_by === '$TOM').id")
post tok-fm claims "{\"questId\":\"$Q\",\"alsKind\":\"$LENA\"}" > /dev/null
M3=$(get tok-fm state | feld ".meldungen.find(m => m.claimed_by === '$LENA').id")
pruefe "Tom bestätigt seine Schwester nicht" "$(post "$KEKS" "claims/$M3/decide" '{"status":"bestaetigt"}' | feld ".fehler")" "Bei Kindern bestätigt immer ein Erwachsener"
post tok-fp claims "{\"questId\":\"$E\"}" > /dev/null
M4=$(get tok-fm state | feld ".meldungen.find(m => m.claimed_by === 'u-fp').id")
pruefe "Nein sagt Tom nicht" "$(post "$KEKS" "claims/$M4/decide" '{"status":"abgelehnt"}' | feld ".fehler")" "Ablehnen machen die Großen"
pruefe "Aber Papa bestätigt er" "$(post "$KEKS" "claims/$M4/decide" '{"status":"bestaetigt"}' | feld ".ok")" "true"
pruefe "Tom wählt den Weg" "$(post "$KEKS" kind/ansicht '{"ansicht":"weg"}' | feld ".ansicht")" "weg"
pruefe "Unbekannte Ansicht" "$(post "$KEKS" kind/ansicht '{"ansicht":"karte"}' | feld ".fehler")" "Diese Ansicht gibt es nicht"
pruefe "Tom wünscht sich das Tablet" "$(post "$KEKS" kind/wunsch "{\"rewardId\":\"$W\"}" | feld ".name")" "30 Minuten Tablet"
pruefe "Kein Wunsch der Großen" "$(post "$KEKS" kind/wunsch "{\"rewardId\":\"$G\"}" | feld ".fehler")" "Diesen Wunsch gibt es nicht"
pruefe "Steht im Zustand" "$(get tok-fm state | feld ".mitglieder.find(m => m.id === '$TOM').wunsch")" "$W"
pruefe "Keine Belohnung der Großen" "$(post "$KEKS" requests "{\"rewardId\":\"$G\"}" | feld ".fehler")" "Diese Belohnung ist für die Großen"
pruefe "Wünsche nur für Kinder" "$(post tok-fp requests "{\"rewardId\":\"$W\"}" | feld ".fehler")" "Das ist ein Wunsch für die Kinder"

echo "== Tom löst ein, die Großen entscheiden"
post tok-fm "claims/$M2/decide" '{"status":"bestaetigt"}' > /dev/null
post tok-fm claims "{\"questId\":\"$Q\",\"fuer\":\"$TOM\",\"anzahl\":10}" > /dev/null
pruefe "Tom wünscht" "$(post "$KEKS" requests "{\"rewardId\":\"$W\"}" | feld ".ok")" "true"
A1=$(get tok-fm state | feld ".antraege.find(a => a.requested_by === '$TOM').id")
pruefe "Jule entscheidet nicht" "$(post tok-fj "requests/$A1/decide" '{"status":"bestaetigt"}' | feld ".fehler")" "Bei Kindern bestätigt immer ein Erwachsener"
VORHER=$(get tok-fm state | feld ".mitglieder.find(m => m.id === '$TOM').punkte")
pruefe "Papa sagt Ja" "$(post tok-fp "requests/$A1/decide" '{"status":"bestaetigt"}' | feld ".kosten")" "8"
pruefe "Abgebucht" "$(get tok-fm state | feld ".mitglieder.find(m => m.id === '$TOM').punkte")" "$((VORHER - 8))"
pruefe "Nichts zu quittieren" "$(sql "select erfuellt from requests where id = '$A1'" | feld "[0].erfuellt")" "erhalten"

echo "== Ein Geschenk an ein Kind ohne Konto ist gleich da"
pruefe "Papa schenkt Lena 2" "$(post tok-fp transfers "{\"betrag\":2,\"an\":\"$LENA\"}" | feld ".sofort")" "true"
pruefe "Lena hat mehr" "$(get tok-fm state | feld ".mitglieder.find(m => m.id === '$LENA').punkte")" "$((PUNKTE * 3 + 2))"

echo "== Taschengeld"
pruefe "Für Tom ist es aus" "$(post tok-fm "kinder/$TOM/auszahlen" '{"cleanies":1}' | feld ".fehler")" "Für Tom ist Taschengeld aus"
pruefe "Nicht mehr als da ist" "$(post tok-fm "kinder/$LENA/auszahlen" '{"cleanies":9999}' | feld ".fehler")" "Lena hat nur $((PUNKTE * 3 + 2)) Cleanies"
pruefe "Jule zahlt nicht aus" "$(post tok-fj "kinder/$LENA/auszahlen" '{"cleanies":1}' | feld ".fehler")" "Das machen die Erwachsenen"
pruefe "Zwei Cleanies sind 20 Cent" "$(post tok-fm "kinder/$LENA/auszahlen" '{"cleanies":2}' | feld ".euro")" "0,20"
pruefe "Gebucht" "$(sql "select reason from ledger where member_id = '$LENA' and source_type = 'taschengeld'" | feld "[0].reason")" "Taschengeld ausgezahlt (0,20 €)"

echo "== Der Kurs: gemeinsam, aber nur unter den Großen"
pruefe "Jule schlägt keinen Kurs vor" "$(post tok-fj proposals '{"art":"kurs","wert":20}' | feld ".fehler")" "Das machen die Erwachsenen"
pruefe "Zu hoch" "$(post tok-fm proposals '{"art":"kurs","wert":500}' | feld ".fehler")" "Der Kurs liegt zwischen 1 und 100 Cent"
post tok-fm proposals '{"art":"kurs","wert":20,"grund":"Inflation"}' > /dev/null
K=$(get tok-fm state | feld ".abstimmungen.find(a => a.art === 'kurs').id")
pruefe "Drei stimmen ab, nicht fünf" "$(get tok-fm state | feld ".abstimmungen.find(a => a.id === '$K').koepfe")" "3"
pruefe "Kinder stehen nicht auf der Karte" "$(get tok-fm state | feld ".abstimmungen.find(a => a.id === '$K').stimmen.length")" "3"
post tok-fp "proposals/$K/vote" '{"antwort":true}' > /dev/null
pruefe "Noch offen ohne Jule" "$(get tok-fm state | feld ".haushalt.kurs")" "10"
pruefe "Jule stimmt zu" "$(post tok-fj "proposals/$K/vote" '{"antwort":true}' | feld ".status")" "bestaetigt"
pruefe "Neuer Kurs" "$(get tok-fm state | feld ".haushalt.kurs")" "20"

echo "== Eltern-PIN"
pruefe "Noch keine" "$(get tok-fm state | feld ".haushalt.pin")" "false"
pruefe "Vier Ziffern" "$(post tok-fm eltern-pin '{"pin":"12"}' | feld ".fehler")" "Die PIN hat vier Ziffern"
pruefe "Mama legt fest" "$(post tok-fm eltern-pin '{"pin":"1234"}' | feld ".ok")" "true"
pruefe "Jetzt da" "$(get tok-fm state | feld ".haushalt.pin")" "true"
pruefe "Falsch" "$(post tok-fp eltern-pin/pruefen '{"pin":"1111"}' | feld ".fehler")" "Die PIN stimmt nicht"
pruefe "Richtig — auch für Papa" "$(post tok-fp eltern-pin/pruefen '{"pin":"1234"}' | feld ".ok")" "true"
pruefe "Ändern nur mit der alten" "$(post tok-fp eltern-pin '{"pin":"5678"}' | feld ".fehler")" "Die alte PIN stimmt nicht"
pruefe "Mit der alten" "$(post tok-fp eltern-pin '{"pin":"5678","alt":"1234"}' | feld ".ok")" "true"
pruefe "Nur gehasht" "$(sql "select eltern_pin as p from couples c join members m on m.couple_id = c.id where m.user_id = 'u-fm'" | feld "[0].p.length")" "64"

echo "== Ändern, abmelden, löschen"
pruefe "Lena heißt jetzt Leni" "$(post tok-fm "kinder/$LENA" '{"name":"Leni","tier":"🦄"}' | feld ".ok")" "true"
pruefe "Name" "$(get tok-fm state | feld ".mitglieder.find(m => m.id === '$LENA').name")" "Leni"
pruefe "Tier" "$(get tok-fm state | feld ".mitglieder.find(m => m.id === '$LENA').tier")" "🦄"
pruefe "Toms Gerät abmelden" "$(post tok-fm "kinder/$TOM/abmelden" '{}' | feld ".geraete")" "1"
pruefe "Toms Sitzung ist weg" "$(get "$KEKS" state | feld ".fehler")" "Nicht angemeldet"
pruefe "Tom löschen" "$(post tok-fm "kinder/$TOM/loeschen" '{}' | feld ".ok")" "true"
pruefe "Tom ist weg" "$(get tok-fm state | feld ".mitglieder.length")" "4"
pruefe "Sein Platz auch" "$(get tok-fm state | feld ".haushalt.groesse")" "4"
pruefe "Seine Buchungen auch" "$(sql "select count(*) as n from ledger where member_id = '$TOM'" | feld "[0].n")" "0"
pruefe "Papas Meldung bleibt bestätigt" "$(sql "select status from claims where id = '$M4'" | feld "[0].status")" "bestaetigt"

echo "== Allein mit kleinen Kindern zählt es sofort"
post tok-fs haushalt/einrichten '{"name":"Sina","art":"familie","erwachsene":1,"kinder":1}' > /dev/null
QS=$(get tok-fs state | feld ".quests.find(q => q.name.startsWith('Spülmaschine')).id")
pruefe "Ganz allein wartet es" "$(post tok-fs claims "{\"questId\":\"$QS\"}" | feld ".sofort")" ""
roh "delete from claims where claimed_by = 'u-fs'"
post tok-fs kinder '{"name":"Ben","einwilligung":true}' > /dev/null
pruefe "Mit Ben zählt es sofort" "$(post tok-fs claims "{\"questId\":\"$QS\"}" | feld ".sofort")" "true"
pruefe "Sina hat die Cleanies" "$(get tok-fs state | feld ".ich.punkte > 0")" "true"
pruefe "Nichts wartet" "$(get tok-fs state | feld ".meldungen.length")" "0"
GS=$(get tok-fs state | feld ".belohnungen.filter(b => b.fuer === 'erwachsene').sort((a, b) => b.cost - a.cost)[0].id")
pruefe "Zu teuer bleibt zu teuer" "$(post tok-fs requests "{\"rewardId\":\"$GS\"}" | feld ".fehler.startsWith('Zu wenig Cleanies')")" "true"
pruefe "Kein hängender Antrag" "$(get tok-fs state | feld ".antraege.length")" "0"
roh "delete from couples where id in (select couple_id from members where user_id = 'u-fs')"
roh "delete from users where id like 'kind-%' and id not in (select user_id from members)"

echo
[ $fehler -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler FEHLER"
exit $fehler
