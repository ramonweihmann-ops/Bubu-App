#!/usr/bin/env bash
# Events: konfigurieren, freigeben, einlösen — und die Grenzen, die dabei gelten.
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

# Der jüngste offene Vorschlag — die Liste kommt „offen zuerst, neu zuerst“.
neuster() { get tok-a state | feld ".abstimmungen[0].id"; }
# Ein Vorschlag geht durch, wenn alle drei zugestimmt haben. A hat schon.
durch() { post tok-b "proposals/$1/vote" '{"antwort":true}' > /dev/null
          post tok-c "proposals/$1/vote" '{"antwort":true}' > /dev/null; }

TAG=$(date -u +%F)
MORGEN=$(date -u -d "+1 day" +%F)

echo "== Aufräumen und Guthaben geben"
roh "delete from urlaube; delete from requests; delete from claims; delete from transfers; delete from ereignisse; delete from ledger"
roh "delete from rewards where event_id is not null; delete from quests where event_id is not null; delete from events"
roh "delete from proposals where kind in ('neues_event','event_aendern','event_aus')"
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 200, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')"

echo "== Ein Event anlegen: es gilt erst, wenn alle zugestimmt haben"
post tok-a proposals '{"art":"neues_event","richtung":"ausgeben","titel":"1 Stunde Zockzeit",
  "beschreibung":"Nicht nach 20 Uhr.","cleanies":20,"proPerson":2,"fuer":["u-c"],
  "zeitart":"dauer","laenge":2,"grund":"Damit sich das Aufräumen lohnt"}' > /dev/null
V1=$(neuster)
pruefe "Steht zur Abstimmung" "$(get tok-b state | feld ".abstimmungen[0].art")" "neues_event"
pruefe "Titel steht auf der Karte" "$(get tok-b state | feld ".abstimmungen[0].titel")" "1 Stunde Zockzeit"
pruefe "Die Konfiguration reist mit" "$(get tok-b state | feld ".abstimmungen[0].event.proPerson")" "2"
pruefe "Noch kein Event" "$(sql "select count(*) as n from events" | feld "[0].n")" "0"
pruefe "Noch keine Belohnung" "$(get tok-c state | feld ".belohnungen.filter(b=>b.event_id).length")" "0"

durch "$V1"
pruefe "Jetzt gibt es das Event" "$(sql "select count(*) as n from events where aktiv=1" | feld "[0].n")" "1"
pruefe "Es läuft" "$(get tok-c state | feld ".events[0].laeuft")" "true"
pruefe "Dahinter steht eine Belohnung" "$(get tok-c state | feld ".belohnungen.filter(b=>b.event_id).length")" "1"
BEL=$(get tok-c state | feld ".belohnungen.find(b=>b.event_id).id")
pruefe "Sie kostet, was das Event sagt" "$(get tok-c state | feld ".belohnungen.find(b=>b.event_id).cost")" "20"
pruefe "C ist dabei" "$(get tok-c state | feld ".events[0].dabei")" "true"
pruefe "B ist nicht dabei" "$(get tok-b state | feld ".events[0].dabei")" "false"
pruefe "Zwei bleiben C" "$(get tok-c state | feld ".events[0].rest_ich")" "2"

echo "== Einlösen läuft wie eine Belohnung"
VOR_C=$(punkte u-c)
post tok-c requests "{\"rewardId\":\"$BEL\"}" > /dev/null
A1=$(get tok-a state | feld ".antraege[0].id")
pruefe "Der Antrag steht bei den anderen" "$(get tok-a state | feld ".antraege.length")" "1"
post tok-a "requests/$A1/decide" '{"status":"bestaetigt"}' > /dev/null
pruefe "C hat bezahlt" "$(punkte u-c)" "$((VOR_C - 20))"
pruefe "Einmal genutzt" "$(get tok-c state | feld ".events[0].genutzt")" "1"
pruefe "Noch eines übrig" "$(get tok-c state | feld ".events[0].rest_ich")" "1"

echo "== Der Deckel pro Person hält"
post tok-c requests "{\"rewardId\":\"$BEL\"}" > /dev/null
A2=$(get tok-a state | feld ".antraege[0].id")
post tok-a "requests/$A2/decide" '{"status":"bestaetigt"}' > /dev/null
pruefe "Der dritte Anlauf wird abgewiesen" \
  "$(post tok-c requests "{\"rewardId\":\"$BEL\"}" | feld ".fehler")" \
  "Du hast dieses Event in diesem Zeitraum schon ausgeschöpft"

echo "== Wer nicht gemeint ist, kommt nicht dran"
pruefe "B wird abgewiesen" "$(post tok-b requests "{\"rewardId\":\"$BEL\"}" | feld ".fehler")" \
  "Dieses Event ist nicht für dich gedacht"

echo "== Eine Aktion legt sich nicht auf den Eventpreis"
roh "insert into aktionen (id, couple_id, art, prozent, beginn, ende, created_by) values ('akt-ev', (select couple_id from members where user_id='u-a'), 'belohnung_rabatt', 50, datetime('now','-1 hour'), datetime('now','+1 day'), 'u-a')"
pruefe "Der Eventpreis bleibt" "$(get tok-c state | feld ".belohnungen.find(b=>b.event_id).kosten_jetzt")" "20"
pruefe "Die feste Liste bekommt den Rabatt" \
  "$(get tok-c state | feld ".belohnungen.some(b=>!b.event_id && b.rabatt===50)")" "true"
roh "delete from aktionen where id='akt-ev'"

echo "== Was zu einem Event gehört, wird nicht einzeln geändert"
pruefe "Preis ändern abgewiesen" \
  "$(post tok-a proposals "{\"art\":\"reward_cost\",\"zielId\":\"$BEL\",\"wert\":5}" | feld ".fehler")" \
  "Das gehört zu einem Event — dort wird es geändert"
pruefe "Löschen abgewiesen" \
  "$(post tok-a proposals "{\"art\":\"delete_reward\",\"zielId\":\"$BEL\"}" | feld ".fehler")" \
  "Das gehört zu einem Event — dort wird es beendet"

echo "== Ändern geht über die Abstimmung"
EV=$(sql "select id from events where aktiv=1" | feld "[0].id")
post tok-a proposals "{\"art\":\"event_aendern\",\"zielId\":\"$EV\",\"titel\":\"2 Stunden Zockzeit\",
  \"cleanies\":35,\"proPerson\":3,\"fuer\":[\"u-c\"],\"zeitart\":\"dauer\",\"laenge\":2}" > /dev/null
V2=$(neuster)
pruefe "Der alte Wert steht daneben" "$(get tok-b state | feld ".abstimmungen[0].alt")" "20"
pruefe "Noch gilt der alte Preis" "$(get tok-c state | feld ".belohnungen.find(b=>b.event_id).cost")" "20"
durch "$V2"
pruefe "Neuer Preis" "$(get tok-c state | feld ".belohnungen.find(b=>b.event_id).cost")" "35"
pruefe "Neuer Name" "$(get tok-c state | feld ".events[0].titel")" "2 Stunden Zockzeit"
pruefe "Ein Platz mehr für C" "$(get tok-c state | feld ".events[0].rest_ich")" "1"

echo "== Beenden geht auch nur gemeinsam"
post tok-a proposals "{\"art\":\"event_aus\",\"zielId\":\"$EV\",\"grund\":\"reicht\"}" > /dev/null
V3=$(neuster)
pruefe "Noch läuft es" "$(get tok-c state | feld ".events.length")" "1"
durch "$V3"
pruefe "Das Event ist weg" "$(get tok-c state | feld ".events.length")" "0"
pruefe "Die Belohnung auch" "$(get tok-c state | feld ".belohnungen.filter(b=>b.event_id).length")" "0"
pruefe "Der Verlauf bleibt" "$(sql "select count(*) as n from ledger where reason like '%Zockzeit%'" | feld "[0].n")" "2"

echo "== Richtung „verdienen“: dahinter steht eine Quest"
post tok-a proposals '{"art":"neues_event","richtung":"verdienen","titel":"Sonntagsessen kochen",
  "cleanies":15,"proPerson":1,"zeitart":"dauer","laenge":3}' > /dev/null
durch "$(neuster)"
pruefe "Eine Quest ist dazugekommen" "$(get tok-b state | feld ".quests.filter(q=>q.event_id).length")" "1"
QU=$(get tok-b state | feld ".quests.find(q=>q.event_id).id")
pruefe "Ohne Kreis ist jeder dabei" "$(get tok-b state | feld ".events[0].dabei")" "true"
VOR_B=$(punkte u-b)
post tok-b claims "{\"questId\":\"$QU\"}" > /dev/null
M1=$(get tok-a state | feld ".meldungen[0].id")
post tok-a "claims/$M1/decide" '{"status":"bestaetigt"}' > /dev/null
pruefe "B hat verdient" "$(punkte u-b)" "$((VOR_B + 15))"
pruefe "Einmal ist Schluss" "$(post tok-b claims "{\"questId\":\"$QU\"}" | feld ".fehler")" \
  "Du hast dieses Event in diesem Zeitraum schon ausgeschöpft"
pruefe "C darf noch" "$(post tok-c claims "{\"questId\":\"$QU\"}" | feld ".ok")" "true"
roh "delete from claims"
EV2=$(sql "select id from events where aktiv=1" | feld "[0].id")
post tok-a proposals "{\"art\":\"event_aus\",\"zielId\":\"$EV2\"}" > /dev/null
durch "$(neuster)"

echo "== Der Gesamtdeckel gilt für alle zusammen"
post tok-a proposals '{"art":"neues_event","richtung":"verdienen","titel":"Balkon fegen",
  "cleanies":5,"gesamt":1,"zeitart":"dauer","laenge":1}' > /dev/null
durch "$(neuster)"
QU2=$(get tok-b state | feld ".quests.find(q=>q.event_id).id")
post tok-b claims "{\"questId\":\"$QU2\"}" > /dev/null
pruefe "Für C ist nichts mehr da" "$(post tok-c claims "{\"questId\":\"$QU2\"}" | feld ".fehler")" \
  "Dieses Event ist für diesen Zeitraum ausgeschöpft"
roh "delete from claims"
EV3=$(sql "select id from events where aktiv=1" | feld "[0].id")
post tok-a proposals "{\"art\":\"event_aus\",\"zielId\":\"$EV3\"}" > /dev/null
durch "$(neuster)"

echo "== Ein Dauerevent rückt von allein weiter"
post tok-a proposals '{"art":"neues_event","richtung":"ausgeben","titel":"Taschengeld",
  "cleanies":10,"rhythmus":"jede Woche","starttag":6,"laenge":2}' > /dev/null
durch "$(neuster)"
EV4=$(sql "select id from events where aktiv=1" | feld "[0].id")
pruefe "Es beginnt an einem Samstag" \
  "$(sql "select strftime('%w', von) as w from events where id='$EV4'" | feld "[0].w")" "6"
pruefe "Zwei Tage lang" \
  "$(sql "select julianday(bis)-julianday(von) as d from events where id='$EV4'" | feld "[0].d")" "1"
pruefe "Drei Termine im Voraus" "$(get tok-a state | feld ".events[0].naechste.length")" "3"

# Ein Fenster in die Vergangenheit schieben — der nächste Aufruf muss es
# weiterrücken und die Belohnung dabei stumm schalten.
roh "update events set von=date('now','-30 days'), bis=date('now','-29 days') where id='$EV4'"
roh "update rewards set active=1 where event_id='$EV4'"
get tok-a state > /dev/null
pruefe "Das Fenster liegt wieder vorn" \
  "$(sql "select case when bis >= date('now') then 'ja' else 'nein' end as w from events where id='$EV4'" | feld "[0].w")" "ja"
pruefe "Es ist immer noch ein Samstag" \
  "$(sql "select strftime('%w', von) as w from events where id='$EV4'" | feld "[0].w")" "6"
LAEUFT=$(sql "select case when von <= date('now') then 1 else 0 end as w from events where id='$EV4'" | feld "[0].w")
pruefe "Die Belohnung folgt dem Fenster" \
  "$(sql "select active as a from rewards where event_id='$EV4'" | feld "[0].a")" "$LAEUFT"

echo "== Haushaltsurlaub schiebt Events mit"
VORHER=$(sql "select von from events where id='$EV4'" | feld "[0].von")
post tok-a proposals "{\"art\":\"urlaub_haushalt\",\"von\":\"$TAG\",\"bis\":\"$MORGEN\"}" > /dev/null
durch "$(neuster)"
pruefe "Zwei Tage nach hinten" \
  "$(sql "select julianday(von) - julianday('$VORHER') as d from events where id='$EV4'" | feld "[0].d")" "2"
roh "update urlaube set beendet_am = datetime('now')"
roh "update events set von=date(von,'-2 days'), bis=date(bis,'-2 days') where id='$EV4'"

echo "== Unsinn wird abgewiesen"
EV5=$(sql "select id from events where aktiv=1" | feld "[0].id")
post tok-a proposals "{\"art\":\"event_aus\",\"zielId\":\"$EV5\"}" > /dev/null
durch "$(neuster)"
pruefe "Ohne Wofür geht nichts" \
  "$(post tok-a proposals '{"art":"neues_event","titel":"","cleanies":5,"zeitart":"dauer","laenge":1}' | feld ".fehler")" \
  "Wofür das Event gut ist, muss dastehen"
pruefe "Null Cleanies gehen nicht" \
  "$(post tok-a proposals '{"art":"neues_event","titel":"Test","cleanies":0,"zeitart":"dauer","laenge":1}' | feld ".fehler")" \
  "Der Cleanies-Wert passt nicht"
pruefe "Ein Zeitraum von gestern geht nicht" \
  "$(post tok-a proposals '{"art":"neues_event","titel":"Test","cleanies":5,"zeitart":"zeitraum","von":"2020-01-01","bis":"2020-01-02"}' | feld ".fehler")" \
  "Dieser Zeitraum liegt schon hinter euch"
pruefe "Eine krumme Dauer geht nicht" \
  "$(post tok-a proposals '{"art":"neues_event","titel":"Test","cleanies":5,"zeitart":"dauer","laenge":5}' | feld ".fehler")" \
  "Diese Dauer gibt es nicht"
pruefe "Ein Fenster darf sich nicht überholen" \
  "$(post tok-a proposals '{"art":"neues_event","titel":"Test","cleanies":5,"rhythmus":"jede Woche","starttag":1,"laenge":14}' | feld ".fehler")" \
  "So lange, wie es läuft, kommt es nicht wieder — kürzeres Fenster oder größerer Abstand"
pruefe "Der Starttag im Monat hat Grenzen" \
  "$(post tok-a proposals '{"art":"neues_event","titel":"Test","cleanies":5,"rhythmus":"1× im Monat","starttag":31,"laenge":7}' | feld ".fehler")" \
  "Der Starttag muss zwischen 1 und 28 liegen"

echo "== Aufräumen"
roh "delete from requests; delete from claims; delete from ereignisse"
roh "delete from rewards where event_id is not null; delete from quests where event_id is not null"
roh "delete from events; delete from urlaube"
roh "delete from proposals where kind in ('neues_event','event_aendern','event_aus','urlaub_haushalt')"

echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler FEHLER"
exit "$fehler"
