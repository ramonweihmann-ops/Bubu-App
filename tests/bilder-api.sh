#!/usr/bin/env bash
# Symbole, Farben und Hintergründe für Quests und Belohnungen.
set -u
B=http://127.0.0.1:8792/api
CURL=(curl -s --noproxy 127.0.0.1 -m 20)
fehler=0
J='Content-Type: application/json'

post() { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" -H "$J" -d "$3" "$B/$2"; }
get()  { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" "$B/$2"; }
# Große Bilder passen nicht in ein Argument — sie gehen als Datei.
postgross() { local f; f=$(mktemp); printf '{"%s":"data:image/jpeg;base64,' "$3" > "$f"
              head -c "$4" /dev/zero | base64 -w0 >> "$f"; printf '"}' >> "$f"
              "${CURL[@]}" -H "Cookie: hq_sitzung=$1" -H "$J" --data-binary "@$f" "$B/$2"; rm -f "$f"; }
sql()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "$1" 2>/dev/null \
         | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s)[0].results)))'; }
roh()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "$1" > /dev/null 2>&1; }
feld() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(eval('(' + s + ')')$1 ?? '')}catch(e){console.log('FEHLER '+e.message)}})"; }
pruefe() { if [ "$2" = "$3" ]; then echo "  ok   $1: $2"; else echo "  FEHL $1: ist=$2 soll=$3"; fehler=$((fehler+1)); fi; }

# Ein winziges echtes PNG (1×1) als Data-URL.
MINI="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
HAUS="(select couple_id from members where user_id = 'u-a')"

echo "== Aufräumen"
roh "update quests set icon = null, farbe = null where couple_id = $HAUS"
roh "update rewards set icon = null, bild = null where couple_id = $HAUS"
roh "delete from bilder"
Q=$(sql "select id from quests where couple_id = $HAUS and active = 1 order by name limit 1" | feld "[0].id")
R=$(sql "select id from rewards where couple_id = $HAUS and active = 1 order by name limit 1" | feld "[0].id")

echo "== Noch nichts gewählt"
pruefe "Quest ohne Symbol" "$(get tok-a state | feld ".quests.find(q => q.id === '$Q').icon")" ""
pruefe "Belohnung ohne Bild" "$(get tok-a state | feld ".belohnungen.find(b => b.id === '$R').bild")" ""

echo "== Ein Symbol für die Quest — jeder darf, ohne Abstimmung"
pruefe "C setzt ein Emoji" "$(post tok-c "quests/$Q/bild" '{"icon":"🧽"}' | feld ".icon")" "🧽"
pruefe "B setzt die Farbe" "$(post tok-b "quests/$Q/bild" '{"farbe":"lila"}' | feld ".farbe")" "lila"
pruefe "Das Symbol bleibt dabei" "$(get tok-a state | feld ".quests.find(q => q.id === '$Q').icon")" "🧽"
pruefe "Die Farbe steht im Zustand" "$(get tok-a state | feld ".quests.find(q => q.id === '$Q').farbe")" "lila"
pruefe "Keine Abstimmung entstanden" "$(get tok-a state | feld ".abstimmungen.filter(a => a.status === 'offen').length")" "0"

echo "== Was kein Symbol ist, kommt nicht hinein"
pruefe "Text" "$(post tok-a "quests/$Q/bild" '{"icon":"Hallo"}' | feld ".fehler")" "Das ist kein Symbol"
pruefe "HTML" "$(post tok-a "quests/$Q/bild" '{"icon":"<img>"}' | feld ".fehler")" "Das ist kein Symbol"
pruefe "Unbekannte Farbe" "$(post tok-a "quests/$Q/bild" '{"farbe":"pink"}' | feld ".fehler")" "Diese Farbe gibt es nicht"
pruefe "Kein Bild" "$(post tok-a "quests/$Q/bild" '{"icon":"data:text/plain;base64,aGFsbG8="}' | feld ".fehler")" "Das Bild versteht die App nicht — JPEG, PNG oder WebP"
pruefe "Fremde Quest" "$(post tok-a "quests/gibtsnicht/bild" '{"icon":"🧽"}' | feld ".fehler")" "Diese Quest gibt es nicht"

echo "== Ein eigenes Bild als Symbol"
ICON=$(post tok-a "quests/$Q/bild" "{\"icon\":\"$MINI\"}" | feld ".icon")
pruefe "Wird zur Kennung" "${ICON:0:5}" "foto:"
ID=${ICON:5}
pruefe "Liegt in der Bildablage" "$(sql "select count(*) as n from bilder" | feld "[0].n")" "1"
pruefe "Nicht im Zustand mitgeschleppt" "$(get tok-a state | grep -c 'base64')" "0"
pruefe "Wird ausgeliefert" "$("${CURL[@]}" -o /dev/null -w '%{http_code} %{content_type}' -H "Cookie: hq_sitzung=tok-b" "$B/bild/$ID")" "200 image/png"
pruefe "Darf lange bleiben" "$("${CURL[@]}" -D - -o /dev/null -H "Cookie: hq_sitzung=tok-b" "$B/bild/$ID" | grep -ci 'immutable')" "1"
pruefe "Nicht für andere Haushalte" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H "Cookie: hq_sitzung=tok-ramon" "$B/bild/$ID")" "404"
pruefe "Nicht ohne Anmeldung" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$B/bild/$ID")" "401"
pruefe "Fremde Kennung abgewiesen" "$(post tok-a "quests/$Q/bild" '{"icon":"foto:gibtsnicht"}' | feld ".fehler")" "Dieses Bild gibt es nicht"
pruefe "Farbe ändern behält das Bild" "$(post tok-a "quests/$Q/bild" "{\"icon\":\"$ICON\",\"farbe\":\"gelb\"}" | feld ".icon")" "$ICON"
pruefe "Zurück zum Emoji" "$(post tok-a "quests/$Q/bild" '{"icon":"🧹"}' | feld ".icon")" "🧹"
pruefe "Das alte Bild ist weg" "$(sql "select count(*) as n from bilder" | feld "[0].n")" "0"

echo "== Zu groß"
pruefe "Symbol über 60 KB" "$(postgross tok-a "quests/$Q/bild" icon 120000 | feld ".fehler.startsWith('Das Bild ist zu groß')")" "true"
pruefe "Foto über 300 KB" "$(postgross tok-a "rewards/$R/bild" bild 400000 | feld ".fehler.startsWith('Das Bild ist zu groß')")" "true"

echo "== Belohnung: Symbol statt Herz, Motiv oder Foto"
pruefe "Symbol" "$(post tok-c "rewards/$R/bild" '{"icon":"🎬"}' | feld ".icon")" "🎬"
pruefe "Motiv" "$(post tok-c "rewards/$R/bild" '{"bild":"motiv:kino"}' | feld ".bild")" "motiv:kino"
pruefe "Steht im Zustand" "$(get tok-a state | feld ".belohnungen.find(b => b.id === '$R').bild")" "motiv:kino"
pruefe "Unbekanntes Motiv" "$(post tok-a "rewards/$R/bild" '{"bild":"motiv:mond"}' | feld ".fehler")" "Dieses Motiv gibt es nicht"
pruefe "Unsinn" "$(post tok-a "rewards/$R/bild" '{"bild":"https://example.com/x.jpg"}' | feld ".fehler")" "Dieses Bild versteht die App nicht"
FOTO=$(post tok-a "rewards/$R/bild" "{\"bild\":\"$MINI\"}" | feld ".bild")
pruefe "Eigenes Foto" "${FOTO:0:5}" "foto:"
pruefe "Ein Foto darf größer sein als ein Symbol" "$(postgross tok-a "rewards/$R/bild" bild 90000 | feld ".bild.startsWith('foto:')")" "true"
pruefe "Das vorige Foto ist weg" "$(sql "select count(*) as n from bilder" | feld "[0].n")" "1"
pruefe "Bewusst ohne Bild" "$(post tok-a "rewards/$R/bild" '{"bild":"ohne"}' | feld ".bild")" "ohne"
pruefe "Und das Foto ist weg" "$(sql "select count(*) as n from bilder" | feld "[0].n")" "0"
pruefe "Das Symbol blieb" "$(get tok-a state | feld ".belohnungen.find(b => b.id === '$R').icon")" "🎬"
pruefe "Zurück auf Vorschlag" "$(post tok-a "rewards/$R/bild" '{"bild":null,"icon":null}' | feld ".bild === null")" "true"

echo "== Andere Haushalte bleiben außen vor"
pruefe "Fremde Quest" "$(post tok-ramon "quests/$Q/bild" '{"icon":"🧽"}' | feld ".fehler")" "Diese Quest gibt es nicht"
pruefe "Fremde Belohnung" "$(post tok-ramon "rewards/$R/bild" '{"icon":"🧽"}' | feld ".fehler")" "Diese Belohnung gibt es nicht"

echo "== Aufräumen"
roh "update quests set icon = null, farbe = null where couple_id = $HAUS"
roh "update rewards set icon = null, bild = null where couple_id = $HAUS"
roh "delete from bilder"

echo
[ "$fehler" = 0 ] && echo "ALLES GRÜN" || echo "$fehler FEHLER"
exit $fehler
