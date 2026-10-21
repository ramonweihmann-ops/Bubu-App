#!/usr/bin/env bash
# Kostenlos bleiben: Wie viele Zeilen liest die App?
#
# Im kostenlosen Plan von Cloudflare darf die Datenbank am Tag 5 Millionen Zeilen
# lesen — gezählt wird jede Zeile, die eine Abfrage anfasst, auch die, die sie nur
# durchsucht. Die App fragt alle 25 Sekunden nach; was dabei gelesen wird, zählt
# also sehr oft. Dieser Test misst es mit der Messhülle (messen/) auf einer Kopie
# der lokalen Testdatenbank und hält die Obergrenzen fest:
#
#   /api/stand  — die kleine Frage alle 25 Sekunden: höchstens 10 Zeilen
#   /api/state  — der ganze Zustand:                  höchstens 1.500 Zeilen
#
# Läuft als letzter Teil von alle.sh, wenn die Testdaten vollständig sind.
set -u
cd "$(dirname "$0")"
HIER=$PWD
APP=$(cd .. && pwd)
B=http://127.0.0.1:8794
CURL=(curl -s -m 20 --noproxy 127.0.0.1)
fehler=0
pruefe() { if [ "$2" = "$3" ]; then echo "  ok   $1: $2"; else echo "  FEHL $1: ist=$2 soll=$3"; fehler=$((fehler+1)); fi; }
hoechstens() { if [ "$2" -le "$3" ]; then echo "  ok   $1: $2 (höchstens $3)"; else echo "  FEHL $1: $2, erlaubt $3"; fehler=$((fehler+1)); fi; }
rech() { node -e "let s='';process.stdin.on('data',x=>s+=x).on('end',()=>{try{const d=JSON.parse(s);console.log(($1) ?? '')}catch(e){console.log('FEHLER '+e.message)}})"; }
kopf() { tr -d '\r' | awk -v k="$1" 'tolower($1)==tolower(k)":" {print $2}'; }

KOPIE=$(mktemp -d)
cp -r "$APP/.wrangler/state" "$KOPIE/"
(cd "$HIER/messen" && nohup npx --prefix "$APP" wrangler dev -c wrangler.toml --local \
  --persist-to "$KOPIE/state" --port 8794 > "$KOPIE/server.log" 2>&1 &)
aufraeumen() {
  for p in $(pgrep -f "persist-to $KOPIE/state"); do kill "$p" 2>/dev/null; done
  for p in $(pgrep -f "socket-addr=entry=localhost:8794"); do kill "$p" 2>/dev/null; done
  sleep 1; rm -rf "$KOPIE"
}
trap aufraeumen EXIT
for _ in $(seq 1 60); do "${CURL[@]}" -o /dev/null "$B/api/health" && break; sleep 1; done

echo "== Lesen je Abruf (Zeilen)"
gemessen=0
for t in ramon a b c d e f wa; do
  koepfe=$("${CURL[@]}" -o "$KOPIE/state.json" -D - -H "Cookie: hq_sitzung=tok-$t" "$B/api/state?versatz=120")
  [ "$(echo "$koepfe" | head -1 | awk '{print $2}')" = "200" ] || continue
  [ "$(rech 'd.eingerichtet' < "$KOPIE/state.json")" = "true" ] || continue
  gemessen=$((gemessen+1))
  voll=$(echo "$koepfe" | kopf x-lesen)
  koepfe=$("${CURL[@]}" -o "$KOPIE/stand.json" -D - -H "Cookie: hq_sitzung=tok-$t" "$B/api/stand")
  klein=$(echo "$koepfe" | kopf x-lesen)
  echo "  $t: Zustand $voll, kleine Frage $klein"
  hoechstens "  $t — ganzer Zustand" "$voll" 1500
  hoechstens "  $t — kleine Frage" "$klein" 10
  pruefe "  $t — kleine Frage kennt denselben Stand" "$(rech 'd.stand' < "$KOPIE/stand.json")" "$(rech 'd.stand' < "$KOPIE/state.json")"
done
pruefe "Gemessene Personen" "$([ "$gemessen" -ge 3 ] && echo "mindestens 3" || echo "$gemessen")" "mindestens 3"

echo "== Der Zähler springt bei Änderungen"
"${CURL[@]}" -H "Cookie: hq_sitzung=tok-wa" "$B/api/state?versatz=120" > "$KOPIE/vorher.json"
vorher=$(rech 'd.stand' < "$KOPIE/vorher.json")
quest=$(rech 'd.quests[0].id' < "$KOPIE/vorher.json")
"${CURL[@]}" -H "Cookie: hq_sitzung=tok-wa" -H "Content-Type: application/json" \
  -d "{\"questId\":\"$quest\"}" "$B/api/claims" > /dev/null
nachher=$("${CURL[@]}" -H "Cookie: hq_sitzung=tok-wa" "$B/api/stand" | rech 'd.stand')
pruefe "Nach einer Meldung ist der Stand weiter" "$([ "$nachher" -gt "$vorher" ] && echo ja || echo "nein ($vorher → $nachher)")" ja
nochmal=$("${CURL[@]}" -H "Cookie: hq_sitzung=tok-wa" "$B/api/stand" | rech 'd.stand')
pruefe "Ohne Änderung bleibt er stehen" "$nochmal" "$nachher"

echo "== Die mitgezählten Zahlen stimmen mit dem Nachzählen überein"
# Nach der ganzen Suite: Alles, was die Tests gemeldet, bestätigt, abgelehnt und
# gelöscht haben, muss in quests.genutzt und rewards.genutzt angekommen sein.
abweichend=$(node -e '
const {DatabaseSync}=require("node:sqlite"); const fs=require("fs"); const path=require("path");
const ordner=process.argv[1]; let erg="keine Datenbank";
for (const f of fs.readdirSync(ordner).filter((n)=>n.endsWith(".sqlite") && n!=="metadata.sqlite")) {
  const db=new DatabaseSync(path.join(ordner,f), {readOnly:true});
  const spalten=db.prepare("pragma table_info(quests)").all().map((c)=>c.name);
  if (!spalten.includes("genutzt")) continue;
  const q=db.prepare("select count(*) n from quests q where q.genutzt <> (select count(*) from claims c where c.quest_id=q.id and c.status=\x27bestaetigt\x27)").get().n;
  const r=db.prepare("select count(*) n from rewards b where b.genutzt <> (select count(*) from requests x where x.reward_id=b.id and x.status=\x27bestaetigt\x27)").get().n;
  erg=q+r;
}
console.log(erg);' "$KOPIE/state/v3/d1/miniflare-D1DatabaseObject" 2>/dev/null)
pruefe "Quests und Belohnungen mit falscher Zahl" "$abweichend" 0

echo "== Hochrechnung für den Pilot"
# 100 Personen, jede eine halbe Stunde am Tag mit offener App: 72 kleine Fragen,
# 6 volle Abrufe nach Ablauf der fünf Minuten und großzügig 20 nach Änderungen —
# und alle so groß wie der größte Testhaushalt. Die Wirklichkeit liegt darunter.
groesster=$("${CURL[@]}" -o /dev/null -D - -H "Cookie: hq_sitzung=tok-wa" "$B/api/state?versatz=120" | kopf x-lesen)
klein=$("${CURL[@]}" -o /dev/null -D - -H "Cookie: hq_sitzung=tok-wa" "$B/api/stand" | kopf x-lesen)
tag=$(( 100 * (72 * klein + 26 * groesster) ))
echo "  100 Personen × ½ Stunde: etwa $tag Zeilen am Tag (frei sind 5.000.000)"
hoechstens "Pilot bleibt unter der Hälfte des freien Rahmens" "$tag" 2500000

echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler Fehler"
exit $(( fehler > 0 ))
