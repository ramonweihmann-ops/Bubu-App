#!/usr/bin/env bash
# Von einer zugeteilten Aufgabe zurücktreten — Mehrheit statt Einstimmigkeit.
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
offenId() { get tok-a state | feld ".abstimmungen.find(v=>v.status==='offen'&&v.art==='ruecktritt')?.id"; }

echo "== Eine wiederkehrende Aufgabe, A gehört sie"
roh "delete from urlaube; delete from proposal_votes; delete from proposals; delete from bewerbungen; delete from claims; delete from requests; delete from ereignisse; delete from ledger"
roh "update quests set wiederkehrend = 0, faellig_am = null, tage = null, rhythmus = null, vergabe_runde = null, dran = null, zugewiesen = null, strafe_runde = null, mahnung_runde = null"
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 100, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')"
roh "update quests set wiederkehrend = 1, tage = 7, rhythmus = '1× pro Woche', faellig_am = date('now','+3 days'), vergabe_runde = date('now','+3 days'), zugewiesen = 'u-a' where id = (select id from quests where active = 1 and couple_id = (select couple_id from members where user_id='u-a') limit 1)"
Q=$(sql "select id from quests where wiederkehrend = 1" | feld "[0].id")
pruefe "Gehört A" "$(sql "select zugewiesen from quests where id='$Q'" | feld "[0].zugewiesen")" "u-a"

echo "== Nur wem sie gehört, und nur mit Grund"
pruefe "B darf nicht" "$(post tok-b proposals "{\"art\":\"ruecktritt\",\"zielId\":\"$Q\",\"grund\":\"keine Lust\"}" | feld ".fehler")" "Zurücktreten kann nur, wem die Aufgabe gerade gehört"
pruefe "Ohne Grund geht nicht" "$(post tok-a proposals "{\"art\":\"ruecktritt\",\"zielId\":\"$Q\"}" | feld ".fehler")" "Schreib kurz dazu, warum es nicht geht"
pruefe "Zu kurz geht auch nicht" "$(post tok-a proposals "{\"art\":\"ruecktritt\",\"zielId\":\"$Q\",\"grund\":\"ne\"}" | feld ".fehler")" "Schreib kurz dazu, warum es nicht geht"

echo "== A tritt zurück: bei dreien reichen zwei Stimmen"
ANTWORT=$(post tok-a proposals "{\"art\":\"ruecktritt\",\"zielId\":\"$Q\",\"grund\":\"Liege flach mit Grippe.\"}")
pruefe "Nötig" "$(echo "$ANTWORT" | feld ".noetig")" "2"
pruefe "Von" "$(echo "$ANTWORT" | feld ".koepfe")" "3"
R1=$(offenId)
pruefe "Zweimal geht nicht" "$(post tok-a proposals "{\"art\":\"ruecktritt\",\"zielId\":\"$Q\",\"grund\":\"immer noch krank\"}" | feld ".fehler")" "Dazu läuft schon eine Abstimmung"
pruefe "Aufgabe gehört weiter A" "$(sql "select zugewiesen from quests where id='$Q'" | feld "[0].zugewiesen")" "u-a"
pruefe "Steht bei B unter Prüfen" "$(get tok-b state | feld ".abstimmungen.find(v=>v.id==='$R1').art")" "ruecktritt"
pruefe "Zähler kommt mit" "$(get tok-b state | feld ".abstimmungen.find(v=>v.id==='$R1').noetig")" "2"
pruefe "Grund kommt mit" "$(get tok-b state | feld ".abstimmungen.find(v=>v.id==='$R1').grund")" "Liege flach mit Grippe."
pruefe "A zählt schon als Ja" "$(sql "select count(*) as n from proposal_votes where proposal_id='$R1' and answer=1" | feld "[0].n")" "1"

echo "== Eine weitere Stimme genügt"
pruefe "B stimmt zu" "$(post tok-b "proposals/$R1/vote" '{"antwort":true}' | feld ".status")" "bestaetigt"
pruefe "Zuteilung ist weg" "$(sql "select coalesce(zugewiesen,'-') as z from quests where id='$Q'" | feld "[0].z")" "-"
pruefe "Frist bleibt stehen" "$(sql "select faellig_am from quests where id='$Q'" | feld "[0].faellig_am")" "$(sql "select date('now','+3 days') as d" | feld "[0].d")"
pruefe "Nicht neu vergeben" "$(sql "select coalesce(dran,'-') as d from quests where id='$Q'" | feld "[0].d")" "-"
pruefe "C musste nicht abstimmen" "$(sql "select count(*) as n from proposal_votes where proposal_id='$R1'" | feld "[0].n")" "2"
pruefe "Steht an der Aufgabe" "$(get tok-c "plan/$Q" | feld ".ruecktritt.status")" "bestaetigt"
# Bis zur Fälligkeit ist sie für alle gesperrt — das prüft plan-api.sh.
roh "update quests set faellig_am = date('now') where id='$Q'"
pruefe "Jeder darf jetzt melden" "$(post tok-c claims "{\"questId\":\"$Q\",\"anzahl\":1}" | feld ".ok")" "true"
roh "update quests set faellig_am = date('now','+3 days') where id='$Q'"

echo "== Ein Nein beendet nichts"
roh "delete from claims; delete from proposal_votes; delete from proposals; delete from ereignisse"
roh "update quests set zugewiesen = 'u-a', dran = null where id='$Q'"
post tok-a proposals "{\"art\":\"ruecktritt\",\"zielId\":\"$Q\",\"grund\":\"Muss unerwartet arbeiten.\"}" > /dev/null
R2=$(offenId)
pruefe "B lehnt ab, bleibt offen" "$(post tok-b "proposals/$R2/vote" '{"antwort":false,"grund":"Wir sind auch im Stress."}' | feld ".status")" "offen"
pruefe "Aufgabe gehört weiter A" "$(sql "select zugewiesen from quests where id='$Q'" | feld "[0].zugewiesen")" "u-a"
pruefe "Begründung ist gespeichert" "$(sql "select grund from proposal_votes where proposal_id='$R2' and member_id='u-b'" | feld "[0].grund")" "Wir sind auch im Stress."
pruefe "C entscheidet mit Ja" "$(post tok-c "proposals/$R2/vote" '{"antwort":true}' | feld ".status")" "bestaetigt"
pruefe "Jetzt ist sie frei" "$(sql "select coalesce(zugewiesen,'-') as z from quests where id='$Q'" | feld "[0].z")" "-"

echo "== Zwei Nein beenden ihn"
roh "delete from proposal_votes; delete from proposals; delete from ereignisse"
roh "update quests set zugewiesen = 'u-a' where id='$Q'"
post tok-a proposals "{\"art\":\"ruecktritt\",\"zielId\":\"$Q\",\"grund\":\"Habe wirklich keine Zeit.\"}" > /dev/null
R3=$(offenId)
post tok-b "proposals/$R3/vote" '{"antwort":false}' > /dev/null
pruefe "Mit dem zweiten Nein vorbei" "$(post tok-c "proposals/$R3/vote" '{"antwort":false}' | feld ".status")" "abgelehnt"
pruefe "Aufgabe gehört weiter A" "$(sql "select zugewiesen from quests where id='$Q'" | feld "[0].zugewiesen")" "u-a"
pruefe "Neuer Anlauf möglich" "$(post tok-a proposals "{\"art\":\"ruecktritt\",\"zielId\":\"$Q\",\"grund\":\"Jetzt ist es akut geworden.\"}" | feld ".ok")" "true"

echo "== Was gemeldet ist, wird nicht mehr abgegeben"
roh "delete from proposal_votes; delete from proposals; delete from ereignisse"
roh "update quests set faellig_am = date('now') where id='$Q'"
post tok-a claims "{\"questId\":\"$Q\",\"anzahl\":1}" > /dev/null
pruefe "Meldung steht" "$(sql "select count(*) as n from claims where quest_id='$Q' and status='offen'" | feld "[0].n")" "1"
pruefe "Abgewiesen" "$(post tok-a proposals "{\"art\":\"ruecktritt\",\"zielId\":\"$Q\",\"grund\":\"doch nicht geschafft\"}" | feld ".fehler")" "Sie ist schon erledigt gemeldet — dann zieh die Meldung zurück"

echo "== Alles andere braucht weiter alle Stimmen"
roh "delete from claims; delete from proposal_votes; delete from proposals; delete from ereignisse"
BEL=$(get tok-a state | feld ".belohnungen[0].id")
# Immer ein anderer Wert als jetzt — sonst weist die App den Vorschlag ab.
NEU=$(get tok-a state | feld ".belohnungen[0].cost + 1")
post tok-a proposals "{\"art\":\"reward_cost\",\"zielId\":\"$BEL\",\"wert\":$NEU}" > /dev/null
V=$(get tok-a state | feld ".abstimmungen.find(v=>v.status==='offen').id")
pruefe "Nötig sind alle" "$(get tok-a state | feld ".abstimmungen.find(v=>v.id==='$V').noetig")" "3"
pruefe "Zwei Ja reichen nicht" "$(post tok-b "proposals/$V/vote" '{"antwort":true}' | feld ".status")" "offen"
pruefe "Erst die dritte" "$(post tok-c "proposals/$V/vote" '{"antwort":true}' | feld ".status")" "bestaetigt"

echo "== Aufräumen"
roh "delete from claims; delete from proposal_votes; delete from proposals; delete from ereignisse"
roh "update quests set wiederkehrend = 0, faellig_am = null, tage = null, rhythmus = null, vergabe_runde = null, dran = null, zugewiesen = null, strafe_runde = null, mahnung_runde = null"

echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler FEHLER"
exit "$fehler"
