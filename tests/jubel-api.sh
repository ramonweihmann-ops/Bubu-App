#!/usr/bin/env bash
# Cleanies-Phasen und eigene GIFs.
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

# Ein winziges echtes GIF (1×1, transparent) als Data-URL.
MINI="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

echo "== Aufräumen"
roh "delete from jubel_gifs"
roh "update couples set phase_leise = 3, phase_mittel = 6"

echo "== Die Grenzen stehen im Zustand"
pruefe "Leise bis" "$(get tok-a state | feld ".haushalt.phasen.leise")" "3"
pruefe "Mittel bis" "$(get tok-a state | feld ".haushalt.phasen.mittel")" "6"

echo "== Verstellen darf nur die Verwaltung"
pruefe "C darf nicht" "$(post tok-c phasen '{"leise":2,"mittel":5}' | feld ".fehler")" "Das kann nur, wer den Haushalt verwaltet"
pruefe "A darf" "$(post tok-a phasen '{"leise":2,"mittel":5}' | feld ".phasen.mittel")" "5"
pruefe "Steht im Zustand" "$(get tok-b state | feld ".haushalt.phasen.leise")" "2"
pruefe "Verdrehte Grenzen" "$(post tok-a phasen '{"leise":8,"mittel":4}' | feld ".fehler")" "Die zweite Grenze muss über der ersten liegen"
pruefe "Gleiche Grenzen" "$(post tok-a phasen '{"leise":5,"mittel":5}' | feld ".fehler")" "Die zweite Grenze muss über der ersten liegen"
pruefe "Zurück auf Standard" "$(post tok-a phasen '{"leise":3,"mittel":6}' | feld ".phasen.leise")" "3"

echo "== GIFs hochladen"
pruefe "C darf nicht" "$(post tok-c gifs "{\"phase\":\"gross\",\"name\":\"x.gif\",\"daten\":\"$MINI\"}" | feld ".fehler")" "Das kann nur, wer den Haushalt verwaltet"
pruefe "Unbekannte Phase" "$(post tok-a gifs "{\"phase\":\"riesig\",\"name\":\"x.gif\",\"daten\":\"$MINI\"}" | feld ".fehler")" "Unbekannte Phase"
pruefe "Kein Bild" "$(post tok-a gifs '{"phase":"gross","name":"x.txt","daten":"data:text/plain;base64,aGFsbG8="}' | feld ".fehler")" "Das muss ein GIF, WebP oder PNG sein"
pruefe "A lädt hoch" "$(post tok-a gifs "{\"phase\":\"gross\",\"name\":\"party.gif\",\"daten\":\"$MINI\"}" | feld ".ok")" "true"
pruefe "Steht im Zustand" "$(get tok-b state | feld ".gifs.length")" "1"
pruefe "Mit Phase" "$(get tok-b state | feld ".gifs[0].phase")" "gross"
pruefe "Mit Namen" "$(get tok-b state | feld ".gifs[0].name")" "party.gif"
pruefe "Größe berechnet" "$(get tok-b state | feld ".gifs[0].groesse > 0")" "true"

echo "== Zu groß wird abgewiesen"
# Ein halbes Megabyte passt nicht mehr in eine Kommandozeile — also über eine Datei.
node -e "const fs=require('fs');fs.writeFileSync('/tmp/gross.json',JSON.stringify({phase:'leise',name:'riesig.gif',daten:'data:image/gif;base64,'+'A'.repeat(600000)}))"
ANTWORT=$("${CURL[@]}" -H "Cookie: hq_sitzung=tok-a" -H "$J" --data-binary @/tmp/gross.json "$B/gifs")
pruefe "Abgewiesen" "$(echo "$ANTWORT" | feld ".fehler.startsWith('Zu groß')")" "true"
pruefe "Nicht gespeichert" "$(sql "select count(*) as n from jubel_gifs" | feld "[0].n")" "1"

echo "== Löschen"
GIF=$(get tok-a state | feld ".gifs[0].id")
pruefe "C darf nicht" "$(post tok-c "gifs/$GIF/weg" '{}' | feld ".fehler")" "Das kann nur, wer den Haushalt verwaltet"
pruefe "A darf" "$(post tok-a "gifs/$GIF/weg" '{}' | feld ".ok")" "true"
pruefe "Weg" "$(get tok-a state | feld ".gifs.length")" "0"
pruefe "Zweimal geht nicht" "$(post tok-a "gifs/$GIF/weg" '{}' | feld ".fehler")" "Dieses GIF gibt es nicht"

echo "== Aufräumen"
roh "delete from jubel_gifs"
roh "update couples set phase_leise = 3, phase_mittel = 6"

echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler FEHLER"
exit "$fehler"
