#!/usr/bin/env bash
# Der Fair-Bericht: Waage, Zeiträume, Räume, was man nicht sieht, das Soll per
# Abstimmung, Kinder neben der Waage, Plus und der Test. Eigener Haushalt,
# eigene Konten: Anna und Ben, dazu Wim für die WG zu dritt.
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
# Für Ausdrücke über mehrere Felder: die Antwort heißt d.
rech() { node -e "let s='';process.stdin.on('data',x=>s+=x).on('end',()=>{try{const d=JSON.parse(s);console.log(($1) ?? '')}catch(e){console.log('FEHLER '+e.message)}})"; }
pruefe() { if [ "$2" = "$3" ]; then echo "  ok   $1: $2"; else echo "  FEHL $1: ist=$2 soll=$3"; fehler=$((fehler+1)); fi; }
fair() { get "$1" "fair?versatz=0&$2"; }

echo "== Frischer Haushalt: Anna und Ben"
roh "delete from couples where id in (select couple_id from members where user_id in ('u-wa','u-wb','u-wc','u-wx','u-wy','u-wz'))"
roh "delete from users where id like 'kind-%' and id not in (select user_id from members)"
for n in wa wb wc wx wy wz; do
  roh "insert into users (id, email, name) values ('u-$n', '$n@test', 'Konto $n') on conflict(id) do nothing"
done
node -e '
const c=require("crypto");
for (const t of ["tok-wa","tok-wb","tok-wc","tok-wx","tok-wy","tok-wz"]) console.log(t.slice(4)+" "+c.createHash("sha256").update(t).digest("hex"));
' | while read n h; do
  roh "insert into sessions (token_hash, user_id, expires_at) values ('$h', 'u-$n', datetime('now','+1 day')) on conflict(token_hash) do update set expires_at = datetime('now','+1 day')"
done
CODE=$(post tok-wa haushalt/einrichten '{"name":"Anna","art":"paar","raeume":["Küche","Bad"]}' | feld ".code")
post tok-wb pair/join "{\"code\":\"$CODE\"}" > /dev/null
post tok-wb profil '{"name":"Ben"}' > /dev/null
PAAR=$(sql "select couple_id as c from members where user_id = 'u-wa'" | feld "[0].c")
pruefe "Zu zweit" "$(get tok-wa state | feld ".mitglieder.length")" "2"
pruefe "Plus haben bis zum Launch alle" "$(get tok-wa state | feld ".haushalt.plus")" "true"

echo "== Ohne Haushalt kein Bericht"
pruefe "Wim hat noch keinen" "$(fair tok-wc "zeitraum=woche" | feld ".fehler")" "Noch kein Haushalt eingerichtet"

echo "== Heute: Anna kocht, Ben putzt das Bad, jeder bestätigt den anderen"
KUECHE=$(get tok-wa state | feld ".quests.find(q => q.name === 'Küche reinigen nach Kochen').id")
BAD=$(get tok-wa state | feld ".quests.find(q => q.name === 'Bad reinigen').id")
KP=$(get tok-wa state | feld ".quests.find(q => q.id === '$KUECHE').points")
BP=$(get tok-wa state | feld ".quests.find(q => q.id === '$BAD').points")
post tok-wa claims "{\"questId\":\"$KUECHE\",\"anzahl\":2}" > /dev/null
post tok-wb claims "{\"questId\":\"$BAD\"}" > /dev/null
MA=$(sql "select id from claims where claimed_by = 'u-wa' and status = 'offen'" | feld "[0].id")
MB=$(sql "select id from claims where claimed_by = 'u-wb' and status = 'offen'" | feld "[0].id")
post tok-wb "claims/$MA/decide" '{"status":"bestaetigt"}' > /dev/null
post tok-wa "claims/$MB/decide" '{"status":"bestaetigt"}' > /dev/null
W=$(fair tok-wa "zeitraum=woche")
pruefe "Diese Woche" "$(echo "$W" | feld ".titel")" "Diese Woche"
pruefe "Sieben Tage" "$(echo "$W" | feld ".faecher.length")" "7"
pruefe "Ich zuerst" "$(echo "$W" | rech "d.personen[0].id + ' ' + d.personen[0].ich")" "u-wa true"
pruefe "Annas Cleanies" "$(echo "$W" | feld ".waage.je['u-wa']")" "$((KP * 2))"
pruefe "Bens Cleanies" "$(echo "$W" | feld ".waage.je['u-wb']")" "$BP"
pruefe "Zusammen" "$(echo "$W" | feld ".waage.gesamt")" "$((KP * 2 + BP))"
pruefe "Heute im richtigen Fach" "$(echo "$W" | rech "d.faecher.find(f => f.von === d.heute).je['u-wa']")" "$((KP * 2))"
pruefe "Kein Tag nach heute hat etwas" "$(echo "$W" | feld ".faecher.filter(f => f.zukunft && (f.je['u-wa'] || f.je['u-wb'])).length")" "0"
pruefe "Küche bei Anna" "$(echo "$W" | feld ".raeume.find(r => r.name === 'Küche').je['u-wa']")" "$((KP * 2))"
pruefe "Bad bei Ben" "$(echo "$W" | feld ".raeume.find(r => r.name === 'Bad').je['u-wb']")" "$BP"
pruefe "Bestätigt: jeder einmal" "$(echo "$W" | rech "d.unsichtbar.bestaetigt['u-wa'] + ' ' + d.unsichtbar.bestaetigt['u-wb']")" "1 1"
pruefe "Annas häufigste Quest" "$(echo "$W" | feld ".aufgefallen['u-wa'].quest.name")" "Küche reinigen nach Kochen"
pruefe "… zweimal" "$(echo "$W" | feld ".aufgefallen['u-wa'].quest.mal")" "2"
pruefe "Annas bester Tag ist heute" "$(echo "$W" | rech "d.aufgefallen['u-wa'].tag.tag === d.heute")" "true"
pruefe "Ben sieht sich zuerst" "$(fair tok-wb "zeitraum=woche" | feld ".personen[0].id")" "u-wb"
pruefe "Fair heißt erst einmal 50 : 50" "$(echo "$W" | rech "d.soll['u-wa'] + ':' + d.soll['u-wb']")" "50:50"

echo "== Abgelehnt und offen zählt nicht"
post tok-wa claims "{\"questId\":\"$KUECHE\"}" > /dev/null
MO=$(sql "select id from claims where claimed_by = 'u-wa' and status = 'offen'" | feld "[0].id")
pruefe "Offen: Waage gleich" "$(fair tok-wa "zeitraum=woche" | feld ".waage.je['u-wa']")" "$((KP * 2))"
post tok-wb "claims/$MO/decide" '{"status":"abgelehnt"}' > /dev/null
pruefe "Abgelehnt: Waage gleich" "$(fair tok-wa "zeitraum=woche" | feld ".waage.je['u-wa']")" "$((KP * 2))"
pruefe "Abgelehnt ist nicht bestätigt" "$(fair tok-wa "zeitraum=woche" | feld ".unsichtbar.bestaetigt['u-wb']")" "1"

echo "== Ein Vorschlag und eine Einlösung"
post tok-wb proposals "{\"art\":\"quest_points\",\"zielId\":\"$BAD\",\"wert\":$((BP + 1))}" > /dev/null
pruefe "Ben hat vorgeschlagen" "$(fair tok-wa "zeitraum=woche" | feld ".unsichtbar.vorgeschlagen['u-wb']")" "1"
R=$(get tok-wa state | feld ".belohnungen.filter(b => b.cost <= $((KP * 2))).sort((a, b) => a.cost - b.cost)[0].id")
RK=$(get tok-wa state | feld ".belohnungen.find(b => b.id === '$R').cost")
post tok-wa requests "{\"rewardId\":\"$R\"}" > /dev/null
AN=$(sql "select id from requests where requested_by = 'u-wa' and status = 'offen'" | feld "[0].id")
post tok-wb "requests/$AN/decide" '{"status":"bestaetigt"}' > /dev/null
pruefe "Anna hat eingelöst" "$(fair tok-wa "zeitraum=woche" | feld ".unsichtbar.eingeloest['u-wa']")" "$RK"
pruefe "Einlösen ändert die Waage nicht" "$(fair tok-wa "zeitraum=woche" | feld ".waage.je['u-wa']")" "$((KP * 2))"

echo "== Für Ben übernommen"
roh "update quests set wiederkehrend = 1, tage = 7, rhythmus = '1× pro Woche', faellig_am = date('now'), zugewiesen = 'u-wb' where id = '$BAD'"
pruefe "Ohne Grund geht es nicht" "$(post tok-wa claims "{\"questId\":\"$BAD\"}" | feld ".fehler")" "Diese Runde gehört jemand anderem — mit einer kurzen Begründung geht es trotzdem"
post tok-wa claims "{\"questId\":\"$BAD\",\"trotzdem\":true,\"grund\":\"Ben ist krank\"}" > /dev/null
MU=$(sql "select id, uebernommen_von as u from claims where claimed_by = 'u-wa' and status = 'offen'")
pruefe "Gemerkt, wem die Runde gehörte" "$(echo "$MU" | feld "[0].u")" "u-wb"
post tok-wb "claims/$(echo "$MU" | feld "[0].id")/decide" '{"status":"bestaetigt"}' > /dev/null
pruefe "Übernommen zählt bei Anna" "$(fair tok-wa "zeitraum=woche" | feld ".unsichtbar.uebernommen['u-wa']")" "1"
# Ältere Meldungen kannten nur die Notiz.
roh "update claims set uebernommen_von = null where claimed_by = 'u-wa' and note like 'Für % übernommen%'"
pruefe "… auch aus der alten Notiz" "$(fair tok-wa "zeitraum=woche" | feld ".unsichtbar.uebernommen['u-wa']")" "1"
roh "update quests set wiederkehrend = 0, zugewiesen = null where id = '$BAD'"

echo "== Der Vormonat: Buchungen in die Vergangenheit gelegt"
post tok-wb claims "{\"questId\":\"$KUECHE\",\"anzahl\":3}" > /dev/null
MV=$(sql "select id from claims where claimed_by = 'u-wb' and status = 'offen'" | feld "[0].id")
post tok-wa "claims/$MV/decide" '{"status":"bestaetigt"}' > /dev/null
roh "update ledger set created_at = datetime('now', 'start of month', '-1 month', '+4 days', '+12 hours') where source_id = '$MV'"
roh "update claims set created_at = datetime('now', 'start of month', '-1 month', '+4 days', '+11 hours'), decided_at = datetime('now', 'start of month', '-1 month', '+4 days', '+12 hours') where id = '$MV'"
roh "update couples set created_at = datetime('now', '-400 days') where id = '$PAAR'"
M0=$(fair tok-wa "zeitraum=monat")
M1=$(fair tok-wa "zeitraum=monat&zurueck=1")
pruefe "Monat: Ben nur von diesem Monat" "$(echo "$M0" | feld ".waage.je['u-wb']")" "$BP"
pruefe "Vormonat im Vergleich" "$(echo "$M0" | feld ".vorher.je['u-wb']")" "$((KP * 3))"
pruefe "Zurückgeblättert" "$(echo "$M1" | feld ".waage.je['u-wb']")" "$((KP * 3))"
pruefe "Der Vormonat heißt wie der Vergleich" "$(echo "$M0" | feld ".vorherText")" "im $(echo "$M1" | feld ".titel.split(' ')[0]")"
pruefe "Bestätigt im Vormonat" "$(echo "$M1" | feld ".unsichtbar.bestaetigt['u-wa']")" "1"
pruefe "Monat: Wochen als Fächer" "$(echo "$M0" | rech "[4, 5, 6].includes(d.faecher.length)")" "true"
pruefe "Das erste Fach beginnt am Ersten" "$(echo "$M0" | feld ".faecher[0].von.slice(8)")" "01"
pruefe "Weiter zurück geht" "$(echo "$M0" | feld ".frueher")" "true"
pruefe "Dreizehn Wochen" "$(fair tok-wa "zeitraum=quartal" | feld ".faecher.length")" "13"
J0=$(fair tok-wa "zeitraum=jahr")
pruefe "Zwölf Monate" "$(echo "$J0" | feld ".faecher.length")" "12"
pruefe "Das Jahr sieht beides" "$(echo "$J0" | feld ".waage.je['u-wb']")" "$((KP * 3 + BP))"
pruefe "Unbekannter Zeitraum wird Monat" "$(fair tok-wa "zeitraum=tag" | feld ".zeitraum")" "monat"
roh "update couples set created_at = datetime('now') where id = '$PAAR'"
pruefe "Vor der Gründung ist Schluss" "$(fair tok-wa "zeitraum=woche" | feld ".frueher")" "false"

echo "== Was fair heißt, stimmt ihr ab"
pruefe "Nur in Fünferschritten" "$(post tok-wa proposals '{"art":"fair_soll","zielId":"u-wa","wert":62}' | feld ".fehler")" "Das Soll liegt zwischen 10 und 90, in Fünferschritten"
pruefe "Nicht 95" "$(post tok-wa proposals '{"art":"fair_soll","zielId":"u-wa","wert":95}' | feld ".fehler")" "Das Soll liegt zwischen 10 und 90, in Fünferschritten"
pruefe "Nicht für Fremde" "$(post tok-wa proposals '{"art":"fair_soll","zielId":"u-wc","wert":60}' | feld ".fehler")" "Diese Person gehört nicht dazu"
pruefe "Nicht, was schon gilt" "$(post tok-wa proposals '{"art":"fair_soll","zielId":"u-wa","wert":50}' | feld ".fehler")" "So ist es schon"
pruefe "Anna schlägt 40 : 60 vor" "$(post tok-wa proposals '{"art":"fair_soll","zielId":"u-wa","wert":40,"grund":"Ich arbeite Vollzeit"}' | feld ".ok")" "true"
pruefe "Nur eine Abstimmung" "$(post tok-wb proposals '{"art":"fair_soll","zielId":"u-wb","wert":55}' | feld ".fehler")" "Dazu läuft schon eine Abstimmung"
F=$(fair tok-wb "zeitraum=woche")
pruefe "Läuft" "$(echo "$F" | rech "d.sollOffen.neu + ' für ' + d.sollOffen.ziel")" "40 für u-wa"
pruefe "Bis dahin gilt das alte" "$(echo "$F" | feld ".soll['u-wa']")" "50"
pruefe "Auf der Karte: wessen Anteil" "$(get tok-wb state | feld ".abstimmungen.find(a => a.art === 'fair_soll').ziel")" "u-wa"
pruefe "Ben hat eine Nachricht" "$(sql "select count(*) as n from ereignisse where user_id = 'u-wb' and titel like '%was fair heißt%'" | feld "[0].n")" "1"
VID=$(get tok-wb state | feld ".abstimmungen.find(a => a.art === 'fair_soll').id")
post tok-wb "proposals/$VID/vote" '{"antwort":true}' > /dev/null
F=$(fair tok-wb "zeitraum=woche")
pruefe "Angenommen: Anna 40" "$(echo "$F" | feld ".soll['u-wa']")" "40"
pruefe "… Ben 60" "$(echo "$F" | feld ".soll['u-wb']")" "60"
pruefe "Keine offene mehr" "$(echo "$F" | rech "String(d.sollOffen)")" "null"
pruefe "Auch aus Bens Richtung" "$(post tok-wb proposals '{"art":"fair_soll","zielId":"u-wb","wert":60}' | feld ".fehler")" "So ist es schon"

echo "== Kinder stehen neben der Waage"
post tok-wa haushalt '{"art":"familie"}' > /dev/null
LENA=$(post tok-wa kinder '{"name":"Lena","tier":"🦊","stufe":"ohne","einwilligung":true}' | feld ".id")
KQ=$(get tok-wa state | feld ".quests.find(q => q.fuer === 'kinder').id")
KQP=$(get tok-wa state | feld ".quests.find(q => q.id === '$KQ').points")
post tok-wa claims "{\"questId\":\"$KQ\",\"fuer\":\"$LENA\",\"anzahl\":2}" > /dev/null
F=$(fair tok-wa "zeitraum=woche")
pruefe "Lena in der Kinderzeile" "$(echo "$F" | feld ".kinder.map(k => k.name + ' ' + k.tier).join()")" "Lena 🦊"
pruefe "… mit ihren Cleanies" "$(echo "$F" | feld ".kinder[0].cleanies")" "$((KQP * 2))"
pruefe "… und zwei Aufgaben" "$(echo "$F" | feld ".kinder[0].aufgaben")" "2"
pruefe "Nicht in der Waage" "$(echo "$F" | rech "Object.keys(d.waage.je).length + ' ' + d.personen.length")" "2 2"
pruefe "Mama bestätigt Lena: zählt bei Mama als bestätigt" "$(echo "$F" | feld ".unsichtbar.bestaetigt['u-wa']")" "2"
pruefe "Das Soll bleibt" "$(echo "$F" | feld ".soll['u-wa']")" "40"

echo "== Ohne Plus: nur diese Woche, nur die Waage"
roh "update couples set plus = 0 where id = '$PAAR'"
F=$(fair tok-wa "zeitraum=jahr&zurueck=2")
pruefe "Gesperrt" "$(echo "$F" | feld ".gesperrt")" "true"
pruefe "Immer diese Woche" "$(echo "$F" | rech "d.zeitraum + ' ' + d.zurueck")" "woche 0"
pruefe "Die Waage ist da" "$(echo "$F" | feld ".waage.je['u-wa'] > 0")" "true"
pruefe "Die Kinder auch" "$(echo "$F" | feld ".kinder.length")" "1"
pruefe "Kein Verlauf, keine Räume" "$(echo "$F" | rech "[d.faecher, d.raeume, d.unsichtbar, d.aufgefallen].filter(x => x !== undefined).length")" "0"
pruefe "Testen geht" "$(echo "$F" | feld ".testen")" "true"
pruefe "Im Zustand: kein Plus" "$(get tok-wa state | feld ".haushalt.plus")" "false"
pruefe "Lena kann nicht testen" "$(post tok-wa fair/testen "{\"alsKind\":\"$LENA\"}" | feld ".fehler")" "Das geht in der Kinderansicht nicht"
T=$(post tok-wb fair/testen '{}')
pruefe "Ben startet den Test" "$(echo "$T" | feld ".plus")" "true"
pruefe "… mit Ende" "$(echo "$T" | rech "!!d.testBis")" "true"
pruefe "Jetzt geht das Jahr" "$(fair tok-wa "zeitraum=jahr" | feld ".faecher.length")" "12"
pruefe "Nur einmal" "$(post tok-wa fair/testen '{}' | feld ".fehler")" "Getestet habt ihr schon"
roh "update couples set plus_test_bis = datetime('now', '-1 hour') where id = '$PAAR'"
F=$(fair tok-wa "zeitraum=monat")
pruefe "Abgelaufen: wieder gesperrt" "$(echo "$F" | rech "d.gesperrt + ' ' + d.zeitraum")" "true woche"
pruefe "… und kein zweiter Test" "$(echo "$F" | feld ".testen")" "false"
roh "update couples set plus = 1 where id = '$PAAR'"
pruefe "Mit Plus: Wer Plus hat, testet nicht" "$(post tok-wa fair/testen '{}' | feld ".fehler")" "Ihr habt Plus schon"

echo "== WG zu dritt: gleich verteilt, kein eigenes Soll"
CODE=$(post tok-wx haushalt/einrichten '{"name":"Xaver","art":"wg","personen":3}' | feld ".code")
post tok-wy pair/join "{\"code\":\"$CODE\"}" > /dev/null
post tok-wz pair/join "{\"code\":\"$CODE\"}" > /dev/null
F=$(fair tok-wy "zeitraum=monat")
pruefe "Drei auf der Waage" "$(echo "$F" | feld ".personen.length")" "3"
pruefe "Jede Person ein Drittel" "$(echo "$F" | feld ".soll['u-wx']")" "33.3"
pruefe "Kein eigenes Soll" "$(echo "$F" | feld ".sollAenderbar")" "false"
pruefe "Abstimmen geht nicht" "$(post tok-wy proposals '{"art":"fair_soll","zielId":"u-wy","wert":40}' | feld ".fehler")" "Ein eigenes Soll gibt es, wenn ihr zwei Erwachsene seid"

echo
[ "$fehler" = 0 ] && echo "ALLES GRÜN" || echo "$fehler Fehler"
exit $fehler
