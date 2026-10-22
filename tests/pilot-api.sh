#!/usr/bin/env bash
# Pilot: Einladungen, das Tor vor der Anmeldung, Gründen nur mit Einladung, das
# Betriebs-Dashboard und die Fehlerliste — über die Schnittstelle.
#
# Braucht den Testserver mit HQ_TEST=1 (Probe-Anmeldung statt Google) und
# BETRIEB_EMAILS=ramon@example.com, dazu die Sitzungen aus sitzungen.sh. Schaltet den
# Pilot für sich ein und am Ende wieder aus.
set -u
B=http://127.0.0.1:8792/api
J="Content-Type: application/json"
CURL=(curl -s -m 20 --noproxy 127.0.0.1)
fehler=0
post() { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" -H "$J" -d "$3" "$B/$2"; }
get()  { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" "$B/$2"; }
sql()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "$1" 2>/dev/null \
         | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s)[0].results;console.log(r.length?Object.values(r[0])[0]:'')})"; }
rech() { node -e "let s='';process.stdin.on('data',x=>s+=x).on('end',()=>{try{const d=JSON.parse(s);console.log(($1) ?? '')}catch(e){console.log('FEHLER '+e.message)}})"; }
pruefe() { if [ "$2" = "$3" ]; then echo "  ok   $1: $2"; else echo "  FEHL $1: ist=$2 soll=$3"; fehler=$((fehler+1)); fi; }
enthaelt() { case "$2" in *"$3"*) echo "  ok   $1";; *) echo "  FEHL $1: „$3“ fehlt in: $2"; fehler=$((fehler+1));; esac; }
kopf() { tr -d '\r' | awk -v k="$1" 'tolower($1)==tolower(k)":" {sub(/^[^:]*: */,""); print; exit}'; }
keks() { tr -d '\r' | grep -i "^set-cookie: $1=" | head -1 | sed -E "s/^[^:]*: $1=([^;]*).*/\1/"; }
# Probe-Anmeldung wie nach Google: $1 = sub, $2 = E-Mail, $3 = Cookie-Kopf (optional)
probe() { "${CURL[@]}" -o /dev/null -D - ${3:+-H "Cookie: $3"} "$B/auth/probe?sub=$1&email=$2&name=Probe"; }
pruefen() { "${CURL[@]}" -D - -H "$J" -d "{\"code\":\"$1\"}" "$B/pilot/pruefen"; }

# Aufräumen von früheren Läufen
cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command \
  "delete from members where user_id like 'probe-%'; delete from users where id like 'probe-%'; delete from einladungen; delete from fehler; delete from einstellungen where schluessel = 'fehler_tag';" > /dev/null 2>&1
cd - > /dev/null

echo "== Zugang zum Betrieb"
pruefe "Ohne Anmeldung" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$B/betrieb")" 401
pruefe "Angemeldet, aber nicht im Betrieb" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H 'Cookie: hq_sitzung=tok-a' "$B/betrieb")" 403
pruefe "ramon@example.com darf" "$(get tok-ramon betrieb | rech 'typeof d.pflicht')" boolean
post tok-ramon betrieb/pilot '{"pflicht":true}' > /dev/null
pruefe "Pilot ist an" "$("${CURL[@]}" "$B/pilot" | rech 'd.pflicht')" true

echo "== Einladungen anlegen"
pruefe "Ohne Namen geht es nicht" "$(post tok-ramon betrieb/einladung '{"name":"  "}' | rech 'd.fehler')" "Gib der Einladung einen Namen — nur du siehst ihn"
E1=$(post tok-ramon betrieb/einladung '{"name":"Familie Probe"}' | rech 'd.code')
pruefe "Code sieht aus wie HOMI-XXX-XXX" "$(echo "$E1" | grep -cE '^HOMI-[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$')" 1
E2=$(post tok-ramon betrieb/einladung '{"name":"WG Probe"}' | rech 'd.code')
E3=$(post tok-ramon betrieb/einladung '{"name":"Wird zurückgezogen"}' | rech 'd.code')
pruefe "Drei verschiedene Codes" "$(printf '%s\n' "$E1" "$E2" "$E3" | sort -u | wc -l | tr -d ' ')" 3
pruefe "Kinder dürfen nicht ins Dashboard" "$(post tok-a betrieb/einladung '{"name":"x"}' | rech 'd.fehler')" "Kein Zugang zum Betrieb"

echo "== Das Tor vor der Anmeldung"
pruefe "Unsinn" "$(pruefen "hallo" | tail -1 | rech 'd.fehler.slice(0,23)')" "So sieht kein Code aus "
pruefe "Unbekannte Einladung" "$(pruefen "HOMI-AAA-AAA" | tail -1 | rech 'd.fehler.slice(0,32)')" "Diese Einladung kennen wir nicht"
klein=$(echo "$E1" | tr 'A-Z' 'a-z' | tr -d '-')
antwort=$(pruefen "$klein")
pruefe "Klein und ohne Striche geht auch" "$(echo "$antwort" | tail -1 | rech 'd.code')" "$E1"
EK=$(echo "$antwort" | keks hq_einladung)
pruefe "Die Einladung reist als Keks" "$EK" "$E1"
enthaelt "Keks nur für die Anmeldung (HttpOnly, 30 Minuten)" "$(echo "$antwort" | tr -d '\r' | grep -i '^set-cookie: hq_einladung=')" "Max-Age=1800"

echo "== Anmelden ohne Einladung: nichts wird gespeichert"
ort=$(probe probe-ohne ohne@test | kopf location)
pruefe "Zurück zur Anmeldung" "$ort" "/app/?ohne-einladung"
pruefe "Kein Konto angelegt" "$(sql "select count(*) from users where id = 'probe-ohne'")" 0
pruefe "Wer schon ein Konto hat, kommt immer herein" "$(probe u-a a@test | kopf location)" "/app/"

echo "== Mit Einladung: Konto, Gründen, eingelöst"
koepfe=$(probe probe-1 eins@test "hq_einladung=$EK")
pruefe "Weiter in die App" "$(echo "$koepfe" | kopf location)" "/app/"
T1=$(echo "$koepfe" | keks hq_sitzung)
pruefe "Sitzung bekommen" "$([ -n "$T1" ] && echo ja)" ja
pruefe "Einladungs-Keks wird gelöscht" "$(echo "$koepfe" | tr -d '\r' | grep -ci '^set-cookie: hq_einladung=;')" 1
pruefe "Einladung angenommen" "$(sql "select angenommen_von from einladungen where code = '$E1'")" probe-1
pruefe "Dieselbe Einladung ein zweites Mal" "$(pruefen "$E1" | tail -1 | rech 'd.fehler.slice(0,37)')" "Diese Einladung ist schon angenommen."
pruefe "Darf gründen" "$(get "$T1" state | rech 'd.darfGruenden')" true
post "$T1" haushalt/einrichten '{"art":"wg","personen":3,"raeume":["Küche"]}' > /dev/null
pruefe "Gegründet" "$(get "$T1" state | rech 'd.eingerichtet')" true
pruefe "Einladung eingelöst" "$(sql "select count(*) from einladungen where code = '$E1' and gegruendet_am is not null and haushalt is not null")" 1
pruefe "Danach: schon gegründet" "$(pruefen "$E1" | tail -1 | rech 'd.fehler.slice(0,44)')" "Mit dieser Einladung ist schon ein Haushalt "

echo "== Mit dem Code eines Haushalts: beitreten, nicht gründen"
HC=$(get "$T1" state | rech 'd.code')
pruefe "Der Haushalt hat einen Code" "$(echo "$HC" | grep -cE '^[0-9]{6}$')" 1
antwort=$(pruefen "$HC")
pruefe "Haushaltscode gilt als Einladung" "$(echo "$antwort" | tail -1 | rech 'd.art')" haushalt
T2=$(probe probe-2 zwei@test "hq_einladung=$(echo "$antwort" | keks hq_einladung)" | keks hq_sitzung)
pruefe "Konto angelegt" "$(sql "select count(*) from users where id = 'probe-2'")" 1
pruefe "Darf nicht gründen" "$(get "$T2" state | rech 'd.darfGruenden')" false
pruefe "Gründen wird abgewiesen" "$(post "$T2" haushalt/einrichten '{"art":"paar","personen":2}' | rech 'd.fehler.slice(0,20)')" "Im Pilot gründest du"
pruefe "Auch der alte Weg nicht" "$(post "$T2" pair/create '{}' | rech 'd.fehler.slice(0,8)')" "Im Pilot"
post "$T2" pair/join "{\"code\":\"$HC\"}" > /dev/null
pruefe "Beigetreten" "$(get "$T2" state | rech 'd.mitglieder.length')" 2

echo "== In der App annehmen (schon angemeldet, ohne Haushalt)"
T3=$(probe probe-3 drei@test "hq_einladung=$(pruefen "$HC" | keks hq_einladung)" | keks hq_sitzung)
pruefe "Haushaltscode statt Einladung" "$(post "$T3" pilot/annehmen "{\"code\":\"$HC\"}" | rech 'd.fehler')" "Das ist der Code eines Haushalts — damit trittst du bei"
pruefe "Einladung annehmen" "$(post "$T3" pilot/annehmen "{\"code\":\"$E2\"}" | rech 'd.ok')" true
pruefe "Jetzt darf probe-3 gründen" "$(get "$T3" state | rech 'd.darfGruenden')" true
pruefe "Mit Haushalt nimmt man keine an" "$(post "$T1" pilot/annehmen "{\"code\":\"$E3\"}" | rech 'd.fehler')" "Du bist schon in einem Haushalt"

echo "== Zurückziehen"
pruefe "Offene Einladung zurückziehen" "$(post tok-ramon "betrieb/einladung/$E3/zurueckziehen" '{}' | rech 'd.ok')" true
pruefe "Gilt nicht mehr" "$(pruefen "$E3" | tail -1 | rech 'd.fehler')" "Diese Einladung gilt nicht mehr"
pruefe "Eingelöste lässt sich nicht zurückziehen" "$(post tok-ramon "betrieb/einladung/$E1/zurueckziehen" '{}' | rech 'd.fehler')" "Diese Einladung lässt sich nicht mehr zurückziehen"

echo "== Betrieb darf auch ohne Einladung hinein, Rücksprung nur auf eigene Seiten"
pruefe "Neues Konto mit Betriebsadresse" "$(probe probe-chef ramon@example.com | kopf location)" "/app/"
pruefe "Zurück zum Dashboard" "$(probe u-a a@test "hq_weiter=/betrieb/" | kopf location)" "/betrieb/"
pruefe "Fremde Adresse wird ignoriert" "$(probe u-a a@test "hq_weiter=//boese.example/" | kopf location)" "/app/"
pruefe "Start merkt sich das Ziel" "$("${CURL[@]}" -o /dev/null -D - "$B/auth/start?weiter=/betrieb/" | keks hq_weiter | sed 's#%2F#/#g')" "/betrieb/"

echo "== Fehler aus der App"
"${CURL[@]}" -H "$J" -d '{"nachricht":"TypeError: x is undefined","ort":"start"}' "$B/fehler" > /dev/null
post tok-a fehler '{"nachricht":"TypeError: x is undefined","ort":"start"}' > /dev/null
lage=$(get tok-ramon betrieb)
pruefe "Zusammengefasst" "$(echo "$lage" | rech 'd.fehler.length')" 1
pruefe "Zweimal" "$(echo "$lage" | rech 'd.fehler[0].anzahl')" 2
pruefe "Bei einer Person: nicht kritisch" "$(echo "$lage" | rech 'd.fehler[0].kritisch')" false
post tok-b fehler '{"nachricht":"TypeError: x is undefined","ort":"start"}' > /dev/null
lage=$(get tok-ramon betrieb)
pruefe "Bei zwei Personen: kritisch" "$(echo "$lage" | rech 'd.fehler[0].kritisch')" true
pruefe "Tor: ein kritischer Fehler offen" "$(echo "$lage" | rech 'd.tore.fehler.offen')" 1
ID=$(echo "$lage" | rech 'd.fehler[0].id')
post tok-ramon "betrieb/fehler/$ID/erledigt" '{}' > /dev/null
pruefe "Erledigt" "$(get tok-ramon betrieb | rech 'd.tore.fehler.offen')" 0
post tok-a fehler '{"nachricht":"TypeError: x is undefined","ort":"start"}' > /dev/null
pruefe "Kommt er wieder, ist er wieder offen" "$(get tok-ramon betrieb | rech 'd.tore.fehler.offen')" 1
pruefe "Leere Meldungen zählen nicht" "$(post tok-a fehler '{"nachricht":"  "}' > /dev/null; get tok-ramon betrieb | rech 'd.fehler.length')" 1
cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command \
  "insert into einstellungen (schluessel, wert) values ('fehler_tag', json_object('tag', date('now'), 'n', 200)) on conflict (schluessel) do update set wert = excluded.wert" > /dev/null 2>&1
cd - > /dev/null
post tok-a fehler '{"nachricht":"Neu, aber über der Grenze","ort":"start"}' > /dev/null
pruefe "Über 200 am Tag nimmt die App nichts mehr an" "$(get tok-ramon betrieb | rech 'd.fehler.length')" 1

echo "== Das Dashboard rechnet"
lage=$(get tok-ramon betrieb)
pruefe "Ein Pilot-Haushalt" "$(echo "$lage" | rech 'd.zahlen.haushalte')" 1
pruefe "Unter dem Namen der Einladung" "$(echo "$lage" | rech 'd.haushalte[0].name')" "Familie Probe"
pruefe "Zwei Personen" "$(echo "$lage" | rech 'd.haushalte[0].personen')" 2
pruefe "Ohne Kennung des Haushalts" "$(echo "$lage" | rech 'Object.keys(d.haushalte[0]).includes("id")')" false
pruefe "Vor dem Pilot gegründete getrennt" "$(echo "$lage" | rech 'd.zahlen.vorher > 0')" true
pruefe "Einladungen: 3 angelegt, 1 eingelöst, 1 offen, 1 zurückgezogen" \
  "$(echo "$lage" | rech '[d.zahlen.einladungen.angelegt, d.zahlen.einladungen.eingeloest, d.zahlen.einladungen.offen, d.zahlen.einladungen.zurueckgezogen].join(",")')" "3,1,1,1"
pruefe "Pilot hat begonnen" "$(echo "$lage" | rech 'd.pilot.woche')" 1
pruefe "Woche 4 noch nicht erreicht" "$(echo "$lage" | rech 'd.tore.woche4.von')" 0
pruefe "Allein: keiner" "$(echo "$lage" | rech 'd.tore.allein.anzahl')" 0
# Vier Wochen zurückdatieren: gegründet vor 30 Tagen, in Woche 4 eine bestätigte Quest
P1=$(sql "select haushalt from einladungen where code = '$E1'")
cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command \
  "update einladungen set gegruendet_am = datetime('now','-30 days') where code = '$E1';
   insert into claims (id, couple_id, quest_id, claimed_by, quantity, points_each, status, decided_by, decided_at, created_at)
   select 'probe-claim', '$P1', id, 'probe-1', 1, 5, 'bestaetigt', 'probe-2', datetime('now','-7 days'), datetime('now','-7 days')
     from quests where couple_id = '$P1' limit 1;" > /dev/null 2>&1
cd - > /dev/null
lage=$(get tok-ramon betrieb)
pruefe "Woche 4: aktiv" "$(echo "$lage" | rech 'd.tore.woche4.aktiv + "/" + d.tore.woche4.von')" "1/1"
pruefe "Fünf Wochen Verlauf" "$(echo "$lage" | rech 'd.wochen.length')" 5
pruefe "Woche 4 im Verlauf aktiv" "$(echo "$lage" | rech 'd.wochen[3].anteil')" 100
pruefe "Woche 1 nicht" "$(echo "$lage" | rech 'd.wochen[0].anteil')" 0
pruefe "Status: genau 7 Tage still ist noch aktiv" "$(echo "$lage" | rech 'd.haushalte[0].status')" aktiv

echo "== Pilot ausschalten"
post tok-ramon betrieb/pilot '{"pflicht":false}' > /dev/null
pruefe "Aus" "$("${CURL[@]}" "$B/pilot" | rech 'd.pflicht')" false
pruefe "Ohne Einladung geht es wieder" "$(probe probe-frei frei@test | kopf location)" "/app/"
T5=$(probe probe-frei frei@test | keks hq_sitzung)
pruefe "… und gründen auch" "$(get "$T5" state | rech 'd.darfGruenden')" true

# Aufräumen: Probe-Konten und ihre Haushalte weg, Pilot bleibt aus.
cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command \
  "delete from couples where id in (select couple_id from members where user_id like 'probe-%');
   delete from users where id like 'probe-%'; delete from einladungen; delete from fehler;
   delete from einstellungen where schluessel = 'fehler_tag';" > /dev/null 2>&1

echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler Fehler"
exit $(( fehler > 0 ))
