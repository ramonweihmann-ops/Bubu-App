#!/usr/bin/env bash
# Urlaubsmodus: für eine Person und für den ganzen Haushalt.
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
tag() { node -e "const d=new Date();d.setUTCDate(d.getUTCDate()+($1));console.log(d.toISOString().slice(0,10))"; }
alleJa() { for t in tok-a tok-b tok-c; do post "$t" "proposals/$1/vote" '{"antwort":true}' > /dev/null; done; }
offenId() { get tok-a state | feld ".abstimmungen.find(v=>v.status==='offen')?.id"; }
punkte() { sql "select coalesce(sum(delta),0) as n from ledger where member_id='$1'" | feld "[0].n"; }

echo "== Aufräumen"
roh "delete from urlaube; delete from proposal_votes; delete from proposals; delete from bewerbungen; delete from claims; delete from requests; delete from ereignisse; delete from ledger"
roh "update quests set wiederkehrend = 0, faellig_am = null, tage = null, rhythmus = null, vergabe_runde = null, dran = null, zugewiesen = null, strafe_runde = null, mahnung_runde = null"
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 100, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')"

echo "== Zeitraum wird geprüft"
pruefe "Ohne Datum" "$(post tok-a proposals '{"art":"urlaub_person"}' | feld ".fehler")" "Der Zeitraum fehlt oder ist unvollständig"
pruefe "Ende vor Anfang" "$(post tok-a proposals "{\"art\":\"urlaub_person\",\"von\":\"$(tag 10)\",\"bis\":\"$(tag 3)\"}" | feld ".fehler")" "Das Ende liegt vor dem Anfang"
pruefe "Schon vorbei" "$(post tok-a proposals "{\"art\":\"urlaub_person\",\"von\":\"$(tag -20)\",\"bis\":\"$(tag -10)\"}" | feld ".fehler")" "Dieser Urlaub liegt schon hinter euch"
pruefe "Unsinn als Datum" "$(post tok-a proposals '{"art":"urlaub_person","von":"morgen","bis":"später"}' | feld ".fehler")" "Der Zeitraum fehlt oder ist unvollständig"

echo "== Urlaub für eine Person"
VON=$(tag 0); BIS=$(tag 13)
pruefe "A schlägt vor (14 Tage)" "$(post tok-a proposals "{\"art\":\"urlaub_person\",\"von\":\"$VON\",\"bis\":\"$BIS\",\"grund\":\"Portugal\"}" | feld ".tage")" "14"
VOR=$(offenId)
pruefe "Zweimal geht nicht" "$(post tok-a proposals "{\"art\":\"urlaub_person\",\"von\":\"$VON\",\"bis\":\"$BIS\"}" | feld ".fehler")" "Dazu läuft schon eine Abstimmung"
pruefe "Steht bei B unter Prüfen" "$(get tok-b state | feld ".abstimmungen.find(v=>v.id==='$VOR').art")" "urlaub_person"
pruefe "Zeitraum kommt mit" "$(get tok-b state | feld ".abstimmungen.find(v=>v.id==='$VOR').urlaub_von")" "$VON"
pruefe "Noch kein Urlaub" "$(sql "select count(*) as n from urlaube" | feld "[0].n")" "0"
alleJa "$VOR"
pruefe "Abstimmung durch" "$(sql "select status from proposals where id='$VOR'" | feld "[0].status")" "bestaetigt"
pruefe "Urlaub steht" "$(sql "select art from urlaube where id='$VOR'" | feld "[0].art")" "person"
pruefe "Gehört A" "$(sql "select member_id from urlaube where id='$VOR'" | feld "[0].member_id")" "u-a"
pruefe "Im Zustand sichtbar" "$(get tok-b state | feld ".urlaube.length")" "1"

echo "== Der Plan bleibt stehen, A wird verschont"
roh "update quests set wiederkehrend = 1, tage = 7, rhythmus = '1× pro Woche', faellig_am = date('now','-8 days') where id = (select id from quests where couple_id = (select couple_id from members where user_id='u-a') and active = 1 limit 1)"
Q=$(sql "select id from quests where wiederkehrend = 1" | feld "[0].id")
ALT=$(sql "select faellig_am from quests where id='$Q'" | feld "[0].faellig_am")
VOR_A=$(punkte u-a); VOR_B=$(punkte u-b)
get tok-b state > /dev/null
pruefe "Fälligkeit unverändert" "$(sql "select faellig_am from quests where id='$Q'" | feld "[0].faellig_am")" "$ALT"
pruefe "B zahlt die Strafe" "$(punkte u-b)" "$((VOR_B - $(sql "select points from quests where id='$Q'" | feld "[0].points")))"
pruefe "A zahlt nicht" "$(punkte u-a)" "$VOR_A"
pruefe "A wurde nicht gemahnt" "$(sql "select count(*) as n from ereignisse where user_id='u-a' and titel like '%überfällig%'" | feld "[0].n")" "0"
pruefe "B schon" "$(sql "select count(*) as n from ereignisse where user_id='u-b' and titel like '%ist überfällig%'" | feld "[0].n")" "1"

echo "== A beendet vorzeitig"
pruefe "B darf nicht" "$(post tok-b "urlaub/$VOR/beenden" '{}' | feld ".fehler")" "Beenden kann nur, wessen Urlaub es ist"
pruefe "A darf" "$(post tok-a "urlaub/$VOR/beenden" '{}' | feld ".art")" "person"
pruefe "Nicht mehr im Zustand" "$(get tok-a state | feld ".urlaube.length")" "0"
pruefe "Zweimal geht nicht" "$(post tok-a "urlaub/$VOR/beenden" '{}' | feld ".fehler")" "Diesen Urlaub gibt es nicht"

echo "== Urlaub für den ganzen Haushalt"
roh "delete from ereignisse"
roh "update quests set strafe_runde = null, mahnung_runde = null, faellig_am = date('now','+3 days') where id='$Q'"
VOR_PLAN=$(sql "select faellig_am from quests where id='$Q'" | feld "[0].faellig_am")
V2=$(tag 0); B2=$(tag 9)
pruefe "B schlägt vor (10 Tage)" "$(post tok-b proposals "{\"art\":\"urlaub_haushalt\",\"von\":\"$V2\",\"bis\":\"$B2\"}" | feld ".tage")" "10"
VOR2=$(offenId)
pruefe "Plan noch unberührt" "$(sql "select faellig_am from quests where id='$Q'" | feld "[0].faellig_am")" "$VOR_PLAN"
alleJa "$VOR2"
pruefe "Abstimmung durch" "$(sql "select status from proposals where id='$VOR2'" | feld "[0].status")" "bestaetigt"
pruefe "Verschoben um 10 Tage" "$(sql "select verschoben from urlaube where id='$VOR2'" | feld "[0].verschoben")" "10"
SOLL=$(node -e "const d=new Date('$VOR_PLAN'+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+10);console.log(d.toISOString().slice(0,10))")
pruefe "Fälligkeit ist gerückt" "$(sql "select faellig_am from quests where id='$Q'" | feld "[0].faellig_am")" "$SOLL"
pruefe "Nicht wiederkehrende bleiben" "$(sql "select count(*) as n from quests where wiederkehrend = 0 and faellig_am is not null" | feld "[0].n")" "0"

echo "== Während des Haushaltsurlaubs ruht alles"
roh "update quests set faellig_am = date('now','-9 days'), strafe_runde = null, mahnung_runde = null where id='$Q'"
VOR_A=$(punkte u-a); VOR_B=$(punkte u-b)
get tok-a state > /dev/null
pruefe "Keine Strafe" "$(punkte u-b)" "$VOR_B"
pruefe "Auch nicht für A" "$(punkte u-a)" "$VOR_A"
pruefe "Keine Mahnung" "$(sql "select count(*) as n from ereignisse where titel like '%überfällig%'" | feld "[0].n")" "0"

echo "== Zweimal Haushaltsurlaub für dieselbe Zeit geht nicht"
pruefe "Abgewiesen" "$(post tok-c proposals "{\"art\":\"urlaub_haushalt\",\"von\":\"$V2\",\"bis\":\"$B2\"}" | feld ".fehler")" "Für diese Zeit ist schon ein Urlaub eingetragen"

echo "== Beenden darf der Vorschlagende"
pruefe "C darf nicht" "$(post tok-c "urlaub/$VOR2/beenden" '{}' | feld ".fehler")" "Das kann nur, wer ihn vorgeschlagen hat oder den Haushalt verwaltet"
pruefe "B darf" "$(post tok-b "urlaub/$VOR2/beenden" '{}' | feld ".art")" "haushalt"
pruefe "Verschobene Daten bleiben" "$(sql "select faellig_am from quests where id='$Q'" | feld "[0].faellig_am")" "$(sql "select date('now','-9 days') as d" | feld "[0].d")"

echo "== Nur die verbleibenden Tage, wenn schon mittendrin"
roh "delete from urlaube"
roh "update quests set faellig_am = date('now','+30 days'), strafe_runde = null, mahnung_runde = null where id='$Q'"
JETZT=$(sql "select faellig_am from quests where id='$Q'" | feld "[0].faellig_am")
post tok-a proposals "{\"art\":\"urlaub_haushalt\",\"von\":\"$(tag -4)\",\"bis\":\"$(tag 2)\"}" > /dev/null
VOR3=$(offenId)
alleJa "$VOR3"
pruefe "Nur die 3 Resttage" "$(sql "select verschoben from urlaube where id='$VOR3'" | feld "[0].verschoben")" "3"
SOLL3=$(node -e "const d=new Date('$JETZT'+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+3);console.log(d.toISOString().slice(0,10))")
pruefe "Fälligkeit um 3 gerückt" "$(sql "select faellig_am from quests where id='$Q'" | feld "[0].faellig_am")" "$SOLL3"

# Aufräumen: ein laufender Haushaltsurlaub hielte sonst den Plan der nächsten
# Suite an — genau so, wie er es soll. Und die Quest muss wieder normal werden.
roh "delete from urlaube"
roh "update quests set wiederkehrend = 0, faellig_am = null, tage = null, rhythmus = null, vergabe_runde = null, dran = null, zugewiesen = null, strafe_runde = null, mahnung_runde = null"

echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler FEHLER"
exit "$fehler"
