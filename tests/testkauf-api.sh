#!/usr/bin/env bash
# Der Testkauf für Plus: 14 Tage Test für neue Pilot-Haushalte, danach pausiert
# Plus (Kinderansicht, Kinder-Geräte, Taschengeld, mehr als drei Events), bis ein
# Erwachsener den Testkauf macht. Dazu die ehrliche Frage, „Jetzt nicht“ mit
# Gründen und die Zahlen im Betriebs-Dashboard. Abgebucht wird nichts.
#
# Braucht den Testserver mit BETRIEB_EMAILS=ramon@example.com und die Sitzungen
# aus sitzungen.sh. Legt eigene Konten an und räumt sie am Ende wieder weg.
set -u
B=http://127.0.0.1:8792/api
J="Content-Type: application/json"
CURL=(curl -s -m 20 --noproxy 127.0.0.1)
fehler=0
post() { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" -H "$J" -d "$3" "$B/$2"; }
get()  { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" "$B/$2"; }
code() { "${CURL[@]}" -o /dev/null -w '%{http_code}' -H "Cookie: hq_sitzung=$1" -H "$J" -d "$3" "$B/$2"; }
sql()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "$1" 2>/dev/null \
         | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s)[0].results;console.log(r.length?Object.values(r[0])[0]:'')})"; }
roh()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "$1" > /dev/null 2>&1; }
rech() { node -e "let s='';process.stdin.on('data',x=>s+=x).on('end',()=>{try{const d=JSON.parse(s);console.log(($1) ?? '')}catch(e){console.log('FEHLER '+e.message)}})"; }
pruefe() { if [ "$2" = "$3" ]; then echo "  ok   $1: $2"; else echo "  FEHL $1: ist=$2 soll=$3"; fehler=$((fehler+1)); fi; }
enthaelt() { case "$2" in *"$3"*) echo "  ok   $1";; *) echo "  FEHL $1: „$3“ fehlt in: $2"; fehler=$((fehler+1));; esac; }

aufraeumen() {
  roh "delete from couples where id in (select couple_id from members where user_id like 'u-tk%');
       delete from users where id like 'u-tk%' or (id like 'kind-%' and id not in (select user_id from members));
       delete from einladungen where name like 'Testkauf %' or name = 'Google-Prüfung';"
}
aufraeumen
for n in tk1 tk2 tk3 tk4 tk5; do
  roh "insert into users (id, email, name) values ('u-$n', '$n@test', 'Konto $n') on conflict(id) do nothing"
done
node -e '
const c=require("crypto");
for (const t of ["tok-tk1","tok-tk2","tok-tk3","tok-tk4","tok-tk5"]) console.log(t.slice(4)+" "+c.createHash("sha256").update(t).digest("hex"));
' | while read n h; do
  roh "insert into sessions (token_hash, user_id, expires_at) values ('$h', 'u-$n', datetime('now','+1 day')) on conflict(token_hash) do update set user_id = 'u-$n', expires_at = datetime('now','+1 day')"
done

echo "== Gründen mit Pilot-Einladung: 14 Tage Plus zum Testen"
E1=$(post tok-ramon betrieb/einladung '{"name":"Testkauf Familie"}' | rech 'd.code')
pruefe "Einladung angenommen" "$(post tok-tk1 pilot/annehmen "{\"code\":\"$E1\"}" | rech 'd.ok')" true
HC=$(post tok-tk1 haushalt/einrichten '{"name":"Tina","art":"familie","erwachsene":2,"kinder":1,"raeume":["Küche"]}' | rech 'd.code')
PAAR=$(sql "select couple_id from members where user_id = 'u-tk1'")
pruefe "Plus ist nicht fest an" "$(sql "select plus from couples where id = '$PAAR'")" 0
pruefe "Der Test läuft 14 Tage" "$(sql "select cast(julianday(date(plus_test_bis)) - julianday(date('now')) as integer) from couples where id = '$PAAR'")" 14
S=$(get tok-tk1 state)
pruefe "Im Zustand: Plus an" "$(echo "$S" | rech 'd.plus.an + "/" + d.haushalt.plus')" "true/true"
pruefe "Noch 14 Tage" "$(echo "$S" | rech 'd.plus.testTage')" 14
pruefe "Noch kein Hinweis" "$(echo "$S" | rech 'd.plus.hinweis')" false
pruefe "Erwachsene können kaufen" "$(echo "$S" | rech 'd.plus.kannKaufen')" true
pruefe "Noch nichts gekauft" "$(echo "$S" | rech 'String(d.plus.gekauft)')" null
pruefe "Nicht von Hand testen" "$(post tok-tk1 fair/testen '{}' | rech 'd.fehler')" "Getestet habt ihr schon"

post tok-tk2 pair/join "{\"code\":\"$HC\"}" > /dev/null
post tok-tk3 pair/join "{\"code\":\"$HC\"}" > /dev/null
post tok-tk1 mitglieder/u-tk3/jugendlich '{"ja":true}' > /dev/null
pruefe "Drei mit Google" "$(get tok-tk1 state | rech 'd.mitglieder.length')" 3
pruefe "Jugendliche kaufen nicht" "$(get tok-tk3 state | rech 'd.plus.kannKaufen')" false

echo "== Im Test geht der Familienmodus"
LENA=$(post tok-tk1 kinder '{"name":"Lena","tier":"🦊","stufe":"geraet","taschengeld":true,"einwilligung":true}' | rech 'd.id')
pruefe "Kind angelegt" "$([ -n "$LENA" ] && echo ja)" ja
KC=$(post tok-tk1 "kinder/$LENA/code" '{}' | rech 'd.code')
KIND=$("${CURL[@]}" -D - -o /dev/null -H "$J" -d "{\"code\":\"$KC\"}" "$B/kind/anmelden" | tr -d '\r' | grep -i '^set-cookie: hq_sitzung=' | sed -E 's/.*hq_sitzung=([^;]*).*/\1/')
pruefe "Lenas Gerät ist angemeldet" "$(get "$KIND" state | rech 'd.ich.name')" Lena
Q=$(get tok-tk1 state | rech "d.quests.find(q => q.fuer === 'kinder').id")
pruefe "Kinderansicht meldet" "$(post tok-tk1 claims "{\"questId\":\"$Q\",\"alsKind\":\"$LENA\"}" | rech 'd.ok')" true

echo "== Kurz vor Ende: die Zeile auf der Startseite"
roh "update couples set plus_test_bis = datetime('now', '+2 days') where id = '$PAAR'"
S=$(get tok-tk1 state)
pruefe "Endet übermorgen" "$(echo "$S" | rech 'd.plus.testTage')" 2
pruefe "Hinweis für Erwachsene" "$(echo "$S" | rech 'd.plus.hinweis')" true
pruefe "Nicht für Jugendliche" "$(get tok-tk3 state | rech 'd.plus.hinweis')" false
roh "update couples set plus_test_bis = datetime('now', '+3 days') where id = '$PAAR'"
pruefe "Drei Tage vorher noch nicht" "$(get tok-tk1 state | rech 'd.plus.hinweis')" false

echo "== Test vorbei, kein Kauf: Plus pausiert"
roh "update couples set plus_test_bis = datetime('now', '-1 hour') where id = '$PAAR'"
S=$(get tok-tk1 state)
pruefe "Plus aus" "$(echo "$S" | rech 'd.plus.an + "/" + d.haushalt.plus')" "false/false"
pruefe "Test vorbei" "$(echo "$S" | rech 'd.plus.vorbei')" true
pruefe "Hinweis bleibt" "$(echo "$S" | rech 'd.plus.hinweis')" true
pruefe "Fair-Bericht nur die Woche" "$(get tok-tk1 'fair?zeitraum=monat' | rech 'd.zeitraum')" woche
pruefe "Kinderansicht: 402" "$(code tok-tk1 claims "{\"questId\":\"$Q\",\"alsKind\":\"$LENA\"}")" 402
enthaelt "… mit Erklärung" "$(post tok-tk1 claims "{\"questId\":\"$Q\",\"alsKind\":\"$LENA\"}" | rech 'd.fehler')" "Die Kinderansicht gibt es mit Plus"
pruefe "Für Kinder eintragen: 402" "$(code tok-tk1 claims "{\"questId\":\"$Q\",\"fuer\":\"$LENA\"}")" 402
pruefe "Kind anlegen: 402" "$(code tok-tk1 kinder '{"name":"Mia","einwilligung":true}')" 402
pruefe "Geräte-Code: 402" "$(code tok-tk1 "kinder/$LENA/code" '{}')" 402
pruefe "Taschengeld auszahlen: 402" "$(code tok-tk1 "kinder/$LENA/auszahlen" '{"cleanies":1}')" 402
pruefe "Kurs vorschlagen: 402" "$(code tok-tk1 proposals '{"art":"kurs","wert":20}')" 402
pruefe "Kinderprofil ändern geht weiter" "$(post tok-tk1 "kinder/$LENA" '{"tier":"🐼"}' | rech 'd.fehler || "ok"')" ok
pruefe "Lenas Verlauf bleibt" "$(sql "select count(*) from claims where claimed_by = '$LENA'")" 1
pruefe "Lenas Gerät sieht den Zustand" "$(get "$KIND" state | rech 'd.plus.an')" false
pruefe "… und kauft nicht" "$(get "$KIND" state | rech 'd.plus.kannKaufen')" false
pruefe "… meldet aber nicht" "$(code "$KIND" claims "{\"questId\":\"$Q\"}")" 402
enthaelt "… mit Erklärung" "$(post "$KIND" claims "{\"questId\":\"$Q\"}" | rech 'd.fehler')" "Kinder-Geräte gibt es mit Plus"
pruefe "… und kauft auch nicht über die Schnittstelle" "$(code "$KIND" plus/kaufen '{"plan":"jahr"}')" 403

echo "== Ohne Plus drei Events zugleich"
for t in Eins Zwei Drei; do
  roh "insert into events (id, couple_id, richtung, titel, cleanies, von, bis, laenge, created_by)
       values ('tk-ev-$t', '$PAAR', 'verdienen', '$t', 5, date('now'), date('now', '+3 days'), 3, 'u-tk1')"
done
EV='{"art":"neues_event","richtung":"verdienen","titel":"Balkon","cleanies":5,"zeitart":"dauer","laenge":2}'
pruefe "Das vierte: 402" "$(code tok-tk1 proposals "$EV")" 402
enthaelt "… mit Erklärung" "$(post tok-tk1 proposals "$EV" | rech 'd.fehler')" "Mehr als 3 Events zugleich gibt es mit Plus"
roh "update events set aktiv = 0 where id = 'tk-ev-Drei'"
pruefe "Nach dem Beenden geht ein neues" "$(post tok-tk1 proposals "$EV" | rech 'd.fehler || "ok"')" ok
pruefe "Offene Vorschläge zählen mit" "$(code tok-tk2 proposals "$EV")" 402

echo "== Jetzt nicht — mit Gründen"
pruefe "Tom winkt ab" "$(post tok-tk2 plus/nicht '{"gruende":["Zu teuer","Quatsch","Zu teuer","Erst später"]}' | rech 'd.ok')" true
pruefe "Nur bekannte Gründe, jeder einmal" "$(sql "select gruende from plus_absagen where wer = 'u-tk2'")" '["Zu teuer","Erst später"]'
pruefe "Tom sieht keinen Hinweis mehr" "$(get tok-tk2 state | rech 'd.plus.hinweis')" false
pruefe "Tina schon" "$(get tok-tk1 state | rech 'd.plus.hinweis')" true

echo "== Der Testkauf"
pruefe "Jugendliche: Frag die Großen" "$(post tok-tk3 plus/kaufen '{"plan":"jahr"}' | rech 'd.fehler')" "Das machen die Erwachsenen"
pruefe "Unbekannter Plan" "$(post tok-tk1 plus/kaufen '{"plan":"woche"}' | rech 'd.fehler')" "Wähle Monat, Jahr oder für immer"
pruefe "Nur mit POST" "$(get tok-tk1 plus/kaufen | rech 'd.fehler')" "Unbekannter Endpunkt"
K=$(post tok-tk1 plus/kaufen '{"plan":"jahr"}')
pruefe "Gekauft: Jahr für 11,99 €" "$(echo "$K" | rech 'd.plan + "/" + d.preis_cent')" "jahr/1199"
KID=$(echo "$K" | rech 'd.id')
pruefe "Plus ist fest an" "$(sql "select plus from couples where id = '$PAAR'")" 1
S=$(get tok-tk1 state)
pruefe "Im Zustand: gekauft" "$(echo "$S" | rech 'd.plus.an + "/" + d.plus.gekauft.plan')" "true/jahr"
pruefe "Kein Hinweis mehr" "$(echo "$S" | rech 'd.plus.hinweis')" false
pruefe "Nicht mehr vorbei" "$(echo "$S" | rech 'd.plus.vorbei')" false
pruefe "Ein zweites Mal nicht" "$(post tok-tk2 plus/kaufen '{"plan":"monat"}' | rech 'd.fehler')" "Ihr habt Plus schon gekauft"
pruefe "Gilt für alle: Tom hat Plus" "$(get tok-tk2 state | rech 'd.plus.an')" true
pruefe "Die Kinderansicht geht wieder" "$(post tok-tk1 claims "{\"questId\":\"$Q\",\"alsKind\":\"$LENA\"}" | rech 'd.ok')" true
pruefe "Lenas Gerät auch" "$(post "$KIND" claims "{\"questId\":\"$Q\"}" | rech 'd.ok')" true
roh "update events set aktiv = 1 where id = 'tk-ev-Drei'; delete from proposals where couple_id = '$PAAR' and kind = 'neues_event'"
pruefe "Events ohne Grenze" "$(post tok-tk2 proposals "$EV" | rech 'd.fehler || "ok"')" ok

echo "== Die ehrliche Frage"
pruefe "Nur ja, vielleicht, nein" "$(post tok-tk1 plus/ehrlich "{\"id\":\"$KID\",\"antwort\":\"klar\"}" | rech 'd.fehler')" "Ja, vielleicht oder nein"
pruefe "Nur wer gekauft hat" "$(post tok-tk2 plus/ehrlich "{\"id\":\"$KID\",\"antwort\":\"ja\"}" | rech 'd.fehler')" "Diesen Testkauf gibt es nicht"
pruefe "Tina: vielleicht" "$(post tok-tk1 plus/ehrlich "{\"id\":\"$KID\",\"antwort\":\"vielleicht\"}" | rech 'd.ok')" true
pruefe "Gespeichert" "$(sql "select ehrlich from testkaeufe where id = '$KID'")" vielleicht

echo "== Ein zweiter Pilot-Haushalt: Test vorbei, nichts gekauft"
E2=$(post tok-ramon betrieb/einladung '{"name":"Testkauf Paar"}' | rech 'd.code')
post tok-tk4 pilot/annehmen "{\"code\":\"$E2\"}" > /dev/null
post tok-tk4 haushalt/einrichten '{"art":"paar","personen":2,"raeume":["Küche"]}' > /dev/null
PAAR2=$(sql "select couple_id from members where user_id = 'u-tk4'")
roh "update couples set plus_test_bis = datetime('now', '-3 days') where id = '$PAAR2'"
pruefe "Pausiert" "$(get tok-tk4 state | rech 'd.plus.vorbei')" true

echo "== Im Betriebs-Dashboard"
L=$(get tok-ramon betrieb)
pruefe "Testkauf: 1 von 2 nach dem Test" "$(echo "$L" | rech 'd.tore.testkauf.anzahl + "/" + d.tore.testkauf.von')" "1/2"
pruefe "Ziel 5 %" "$(echo "$L" | rech 'd.tore.testkauf.ziel')" 5
pruefe "Pläne" "$(echo "$L" | rech 'JSON.stringify(d.tore.testkauf.plaene)')" '{"jahr":1,"monat":0,"immer":0}'
pruefe "Ehrlich" "$(echo "$L" | rech 'JSON.stringify(d.tore.testkauf.ehrlich)')" '{"ja":0,"vielleicht":1,"nein":0,"offen":0}'
pruefe "Gründe" "$(echo "$L" | rech 'd.tore.testkauf.gruende["Zu teuer"] + "/" + d.tore.testkauf.gruende["Erst später"] + "/" + d.tore.testkauf.absagen')" "1/1/1"
pruefe "Je Haushalt: gekauft" "$(echo "$L" | rech 'd.haushalte.find(h => h.name === "Testkauf Familie").plus')" "gekauft · Jahr"
pruefe "Je Haushalt: pausiert" "$(echo "$L" | rech 'd.haushalte.find(h => h.name === "Testkauf Paar").plus')" "pausiert"
roh "update couples set plus_test_bis = datetime('now', '+5 days') where id = '$PAAR2'"
L=$(get tok-ramon betrieb)
pruefe "Im Test zählt nicht in den Nenner" "$(echo "$L" | rech 'd.tore.testkauf.anzahl + "/" + d.tore.testkauf.von')" "1/1"
pruefe "Je Haushalt: Test" "$(echo "$L" | rech 'd.haushalte.find(h => h.name === "Testkauf Paar").plus')" "Test"

echo "== Der Haushalt für Googles Prüfung zählt nicht mit"
VOR=$(get tok-ramon betrieb | rech '[d.zahlen.haushalte, d.zahlen.einladungen.angelegt, d.tore.testkauf.von].join(",")')
EP=$(post tok-ramon betrieb/einladung '{"name":"Google-Prüfung"}' | rech 'd.code')
post tok-tk5 pilot/annehmen "{\"code\":\"$EP\"}" > /dev/null
post tok-tk5 haushalt/einrichten '{"art":"familie","erwachsene":1,"kinder":1,"raeume":["Küche"]}' > /dev/null
roh "update couples set plus_test_bis = datetime('now', '-1 day') where id = (select couple_id from members where user_id = 'u-tk5')"
L=$(get tok-ramon betrieb)
pruefe "Gegründet" "$(sql "select count(*) from einladungen where name = 'Google-Prüfung' and haushalt is not null")" 1
pruefe "Zahlen unverändert (Haushalte, Einladungen, Testkauf-Nenner)" "$(echo "$L" | rech '[d.zahlen.haushalte, d.zahlen.einladungen.angelegt, d.tore.testkauf.von].join(",")')" "$VOR"
pruefe "Nicht unter den Haushalten" "$(echo "$L" | rech 'd.haushalte.some(h => h.name === "Google-Prüfung")')" false
pruefe "Die Einladung steht trotzdem in der Liste" "$(echo "$L" | rech 'd.einladungen.some(e => e.name === "Google-Prüfung")')" true

echo "== Haushalte von vor dem Pilot behalten Plus"
S=$(get tok-ramon state)
pruefe "Plus an, ohne Test" "$(echo "$S" | rech '[d.plus.an, d.plus.testBis, d.plus.vorbei, d.plus.hinweis].join(",")')" "true,,false,false"

echo "== Wer geht, bleibt ohne Namen gezählt"
post tok-tk1 mitglieder/u-tk3/jugendlich '{"ja":false}' > /dev/null
post tok-tk2 haushalt/verlassen '{}' > /dev/null
pruefe "Absage bleibt" "$(sql "select count(*) from plus_absagen where couple_id = '$PAAR'")" 1
pruefe "… ohne Namen" "$(sql "select coalesce(wer, 'niemand') from plus_absagen where couple_id = '$PAAR'")" niemand
pruefe "Tina geht" "$(post tok-tk1 haushalt/verlassen '{}' | rech 'd.fehler || "ok"')" ok
pruefe "Testkauf bleibt ohne Namen" "$(sql "select coalesce(wer, 'niemand') from testkaeufe where id = '$KID'")" niemand
pruefe "… und zählt weiter" "$(get tok-ramon betrieb | rech 'd.tore.testkauf.anzahl')" 1
pruefe "Plus bleibt dem Haushalt" "$(get tok-tk3 state | rech 'd.plus.an')" true

aufraeumen
echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler Fehler"
exit $(( fehler > 0 ))
