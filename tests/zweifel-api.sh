#!/usr/bin/env bash
# Buchung anzweifeln: eine bestätigte Quest per Abstimmung zurücksetzen.
# Läuft in der Dreier-WG (a, b, c) aus haushalt.sh.
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
hash() { node -e "console.log(require('crypto').createHash('sha256').update('$1').digest('hex'))"; }

# Melden und von jemand anderem bestätigen lassen — gibt die Meldung zurück.
gebucht() {
  local wer=$1 quest=$2 bestaetiger=$3
  local m; m=$(post "$wer" claims "{\"questId\":\"$quest\",\"anzahl\":1}" | feld ".id")
  post "$bestaetiger" "claims/$m/decide" '{"status":"bestaetigt"}' > /dev/null
  echo "$m"
}
anzweifeln() { post "$1" proposals "{\"art\":\"zweifel\",\"zielId\":\"$2\",\"grund\":\"$3\",\"notiz\":\"${4:-}\"}"; }
zweifelId() { sql "select id from proposals where kind='zweifel' and target_id='$1'" | feld "[0].id"; }
stand() { get tok-a state | feld ".mitglieder.find(m=>m.id==='$1').punkte"; }
zeile() { get "$1" state | feld ".verlauf.find(v=>v.meldung==='$2'&&v.art==='claim')$3"; }

PAAR=$(sql "select couple_id from members where user_id='u-a'" | feld "[0].couple_id")

echo "== Ausgangslage: je 100 Cleanies, eine normale Quest"
roh "delete from urlaube; delete from proposal_votes; delete from proposals; delete from bewerbungen; delete from claims; delete from requests; delete from ereignisse; delete from ledger"
roh "update quests set wiederkehrend = 0, faellig_am = null, tage = null, rhythmus = null, vergabe_runde = null, dran = null, zugewiesen = null, strafe_runde = null, mahnung_runde = null"
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 100, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')"
Q=$(sql "select id from quests where active = 1 and couple_id = '$PAAR' and event_id is null order by name limit 1" | feld "[0].id")
QN=$(sql "select name from quests where id='$Q'" | feld "[0].name")
QP=$(sql "select points from quests where id='$Q'" | feld "[0].points")
GENUTZT=$(sql "select genutzt from quests where id='$Q'" | feld "[0].genutzt")
M1=$(gebucht tok-a "$Q" tok-b)
pruefe "A hat die Quest gebucht" "$(stand u-a)" "$((100 + QP))"
pruefe "Im Verlauf anzweifelbar" "$(zeile tok-b "$M1" ".anzweifelbar")" "true"
pruefe "Mit Meldezeit" "$(zeile tok-b "$M1" ".gemeldet_am ? 'ja' : 'nein'")" "ja"
pruefe "Mit Bestätigung von B" "$(zeile tok-b "$M1" ".bestaetigt_von")" "u-b"
pruefe "Startguthaben nicht anzweifelbar" "$(get tok-b state | feld ".verlauf.find(v=>v.reason==='Testguthaben').anzweifelbar ?? 'nein'")" "nein"

echo "== Was nicht geht"
pruefe "Ohne Grund" "$(anzweifeln tok-b "$M1" "" | feld ".fehler")" "Was stimmt nicht? Bitte einen Grund wählen"
pruefe "Unbekannter Grund" "$(anzweifeln tok-b "$M1" "keine-lust" | feld ".fehler")" "Was stimmt nicht? Bitte einen Grund wählen"
pruefe "Unbekannte Buchung" "$(anzweifeln tok-b "gibt-es-nicht" doppelt | feld ".fehler")" "Diese Buchung gibt es nicht"
OFFEN=$(post tok-a claims "{\"questId\":\"$Q\",\"anzahl\":1}" | feld ".id")
pruefe "Offene Meldung nicht" "$(anzweifeln tok-b "$OFFEN" doppelt | feld ".fehler")" "Anzweifeln lassen sich nur bestätigte Quests"
roh "delete from claims where id='$OFFEN'"
ALT=$(gebucht tok-a "$Q" tok-b)
roh "update claims set decided_at = datetime('now','-15 days') where id='$ALT'"
pruefe "Älter als 14 Tage nicht" "$(anzweifeln tok-b "$ALT" doppelt | feld ".fehler")" "Anzweifeln geht nur in den ersten 14 Tagen"
pruefe "Im Verlauf nicht anzweifelbar" "$(zeile tok-b "$ALT" ".anzweifelbar")" "false"
roh "delete from ledger where source_id='$ALT'; delete from claims where id='$ALT'"

echo "== B zweifelt an: bei dreien reichen zwei Stimmen"
ANTWORT=$(anzweifeln tok-b "$M1" doppelt "Einmal geputzt, zweimal gebucht")
pruefe "Steht zur Abstimmung" "$(echo "$ANTWORT" | feld ".status")" "offen"
pruefe "Nötig" "$(echo "$ANTWORT" | feld ".noetig")" "2"
pruefe "Von" "$(echo "$ANTWORT" | feld ".koepfe")" "3"
Z1=$(zweifelId "$M1")
pruefe "B zählt schon als Ja" "$(sql "select count(*) as n from proposal_votes where proposal_id='$Z1' and member_id='u-b' and answer=1" | feld "[0].n")" "1"
pruefe "Zweimal geht nicht" "$(anzweifeln tok-c "$M1" versehen | feld ".fehler")" "Dazu läuft schon eine Abstimmung"
pruefe "Noch nichts abgezogen" "$(stand u-a)" "$((100 + QP))"
pruefe "Karte: Titel" "$(get tok-c state | feld ".abstimmungen.find(v=>v.id==='$Z1').titel")" "$QN zurücksetzen"
pruefe "Karte: wessen Buchung" "$(get tok-c state | feld ".abstimmungen.find(v=>v.id==='$Z1').wem")" "u-a"
pruefe "Karte: Grund" "$(get tok-c state | feld ".abstimmungen.find(v=>v.id==='$Z1').zweifel")" "doppelt"
pruefe "Karte: Notiz" "$(get tok-c state | feld ".abstimmungen.find(v=>v.id==='$Z1').grund")" "Einmal geputzt, zweimal gebucht"
pruefe "Karte: Betrag" "$(get tok-c state | feld ".abstimmungen.find(v=>v.id==='$Z1').neu")" "$QP"
pruefe "Karte: Mehrheit" "$(get tok-c state | feld ".abstimmungen.find(v=>v.id==='$Z1').noetig")" "2"
pruefe "Zeile: angezweifelt" "$(zeile tok-c "$M1" ".angezweifelt")" "true"
pruefe "Zeile: nicht mehr anzweifelbar" "$(zeile tok-c "$M1" ".anzweifelbar")" "false"
pruefe "A und C erfahren es" "$(sql "select group_concat(user_id) as w from (select user_id from ereignisse where quelle_id='$Z1' order by user_id)" | feld "[0].w")" "u-a,u-c"
pruefe "Mit Grund im Text" "$(sql "select text from ereignisse where quelle_id='$Z1' and user_id='u-a'" | feld "[0].text.includes('Doppelt gezählt')")" "true"

echo "== C stimmt zu: zurückgesetzt"
roh "delete from ereignisse"
pruefe "C entscheidet" "$(post tok-c "proposals/$Z1/vote" '{"antwort":true}' | feld ".status")" "bestaetigt"
pruefe "Stand von A wieder 100" "$(stand u-a)" "100"
pruefe "Gegenbuchung" "$(sql "select delta from ledger where source_type='zurueck' and source_id='$M1'" | feld "[0].delta")" "-$QP"
pruefe "Mit Text" "$(sql "select reason from ledger where source_type='zurueck' and source_id='$M1'" | feld "[0].reason")" "Zurückgesetzt: $QN"
pruefe "Auf A gebucht" "$(sql "select member_id from ledger where source_type='zurueck' and source_id='$M1'" | feld "[0].member_id")" "u-a"
pruefe "Die alte Buchung bleibt" "$(sql "select count(*) as n from ledger where source_type='claim' and source_id='$M1'" | feld "[0].n")" "1"
pruefe "Meldung zurückgesetzt" "$(sql "select status || ':' || (zurueckgesetzt_am is not null) as s from claims where id='$M1'" | feld "[0].s")" "abgelehnt:1"
pruefe "Zählt nicht mehr als erledigt" "$(sql "select genutzt from quests where id='$Q'" | feld "[0].genutzt")" "$GENUTZT"
pruefe "Zeile: zurückgesetzt" "$(zeile tok-a "$M1" ".zurueckgesetzt")" "true"
pruefe "Gegenzeile im Verlauf" "$(get tok-a state | feld ".verlauf.find(v=>v.art==='zurueck'&&v.meldung==='$M1').reason")" "Zurückgesetzt: $QN"
pruefe "A und B erfahren es" "$(sql "select group_concat(user_id) as w from (select user_id from ereignisse where quelle_id='$Z1' order by user_id)" | feld "[0].w")" "u-a,u-b"
ANNA=$(sql "select name from users where id='u-a'" | feld "[0].name.split(' ')[0]")
pruefe "… mit dem Betrag" "$(sql "select text from ereignisse where quelle_id='$Z1' and user_id='u-a'" | feld "[0].text")" "$([ "$QP" = 1 ] && echo "1 Cleanie" || echo "$QP Cleanies") gehen von $ANNA zurück."
pruefe "Nicht noch einmal" "$(anzweifeln tok-c "$M1" doppelt | feld ".fehler")" "Diese Buchung ist schon zurückgesetzt"
pruefe "Wochenkachel ohne sie" "$(get tok-a state | feld ".woche.je.find(j=>j.id==='u-a').punkte")" "0"
pruefe "Auswertung ohne sie" "$(get tok-a "statistik?versatz=0" | feld ".tage.reduce((s,t)=>s+t.ich,0)")" "0"
pruefe "Fair-Bericht ohne sie" "$(get tok-a "fair?versatz=0&zeitraum=woche" | feld ".waage.je['u-a']")" "0"

echo "== Die Mehrheit sagt: bleibt"
roh "delete from ereignisse"
M2=$(gebucht tok-a "$Q" tok-b)
anzweifeln tok-b "$M2" anders "Kam mir zu wenig vor" > /dev/null
Z2=$(zweifelId "$M2")
pruefe "Ein Nein beendet nichts" "$(post tok-a "proposals/$Z2/vote" '{"antwort":false}' | feld ".status")" "offen"
pruefe "Das zweite schon" "$(post tok-c "proposals/$Z2/vote" '{"antwort":false}' | feld ".status")" "abgelehnt"
pruefe "Buchung bleibt" "$(stand u-a)" "$((100 + QP))"
pruefe "Keine Gegenbuchung" "$(sql "select count(*) as n from ledger where source_type='zurueck' and source_id='$M2'" | feld "[0].n")" "0"
pruefe "Meldung bleibt bestätigt" "$(sql "select status from claims where id='$M2'" | feld "[0].status")" "bestaetigt"
pruefe "Alle außer C erfahren es" "$(sql "select group_concat(user_id) as w from (select user_id from ereignisse where quelle_id='$Z2' and titel like '%bleibt%' order by user_id)" | feld "[0].w")" "u-a,u-b"
pruefe "Kein zweiter Anlauf" "$(anzweifeln tok-b "$M2" doppelt | feld ".fehler")" "Diese Buchung wurde schon einmal angezweifelt"
pruefe "Zeile nicht mehr anzweifelbar" "$(zeile tok-b "$M2" ".anzweifelbar")" "false"

echo "== Die eigene Buchung geht auch über die Abstimmung"
M3=$(gebucht tok-a "$Q" tok-b)
pruefe "A zweifelt selbst an" "$(anzweifeln tok-a "$M3" versehen | feld ".status")" "offen"
pruefe "Noch nicht abgezogen" "$(stand u-a)" "$((100 + 2 * QP))"
pruefe "B stimmt zu" "$(post tok-b "proposals/$(zweifelId "$M3")/vote" '{"antwort":true}' | feld ".status")" "bestaetigt"
pruefe "Jetzt abgezogen" "$(stand u-a)" "$((100 + QP))"

echo "== Konto darf ins Minus"
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type) values ('zw-weg', '$PAAR', 'u-a', -$((100 + QP)), 'Testausgabe', 'start')"
pruefe "Stand ist 0" "$(stand u-a)" "0"
M4=$(gebucht tok-a "$Q" tok-b)
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type) values ('zw-weg2', '$PAAR', 'u-a', -$QP, 'Testausgabe', 'start')"
anzweifeln tok-b "$M4" nicht_erledigt > /dev/null
post tok-c "proposals/$(zweifelId "$M4")/vote" '{"antwort":true}' > /dev/null
pruefe "Stand im Minus" "$(stand u-a)" "-$QP"
roh "delete from ledger where id in ('zw-weg','zw-weg2')"

echo "== Haushaltsplan: nicht erledigt heißt, die Runde geht wieder auf"
# Ohne die Buchungen von eben — sonst wäre die Runde schon erledigt.
roh "delete from ledger where source_id in (select id from claims where quest_id='$Q'); delete from claims where quest_id='$Q'"
roh "update quests set wiederkehrend = 1, tage = 7, rhythmus = '1× pro Woche', faellig_am = date('now') where id='$Q'"
P1=$(gebucht tok-a "$Q" tok-b)
pruefe "Runde erledigt: in 7 Tagen wieder" "$(sql "select faellig_am = date('now','+7 days') as j from quests where id='$Q'" | feld "[0].j")" "1"
anzweifeln tok-b "$P1" versehen > /dev/null
post tok-c "proposals/$(zweifelId "$P1")/vote" '{"antwort":true}' > /dev/null
pruefe "Aus Versehen: heute wieder fällig" "$(sql "select faellig_am = date('now') as j from quests where id='$Q'" | feld "[0].j")" "1"
pruefe "Jetzt wieder meldbar" "$(post tok-c claims "{\"questId\":\"$Q\",\"anzahl\":1}" | feld ".ok")" "true"
P2=$(sql "select id from claims where quest_id='$Q' and status='offen'" | feld "[0].id")
post tok-a "claims/$P2/decide" '{"status":"bestaetigt"}' > /dev/null
pruefe "Wieder erledigt" "$(sql "select faellig_am = date('now','+7 days') as j from quests where id='$Q'" | feld "[0].j")" "1"

echo "== Doppelt gezählt: die Runde bleibt erledigt"
# Wie bei Bibi: dieselbe Runde zweimal bestätigt, bevor es die Sperre gab.
roh "insert into claims (id, couple_id, quest_id, claimed_by, quantity, points_each, status, decided_by, decided_at, created_at) values ('zw-dop', '$PAAR', '$Q', 'u-c', 1, $QP, 'bestaetigt', 'u-a', datetime('now','-1 minute'), datetime('now','-2 minutes'))"
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id) values ('zw-dop-l', '$PAAR', 'u-c', $QP, '$QN', 'claim', 'zw-dop')"
anzweifeln tok-a "zw-dop" doppelt > /dev/null
post tok-b "proposals/$(zweifelId zw-dop)/vote" '{"antwort":true}' > /dev/null
pruefe "Zurückgesetzt" "$(sql "select zurueckgesetzt_am is not null as z from claims where id='zw-dop'" | feld "[0].z")" "1"
pruefe "Runde bleibt erledigt" "$(sql "select faellig_am = date('now','+7 days') as j from quests where id='$Q'" | feld "[0].j")" "1"

echo "== Aus Versehen, aber die Runde hat schon jemand anderes gemacht"
roh "insert into claims (id, couple_id, quest_id, claimed_by, quantity, points_each, status, decided_by, decided_at, created_at) values ('zw-vers', '$PAAR', '$Q', 'u-b', 1, $QP, 'bestaetigt', 'u-a', datetime('now','-30 seconds'), datetime('now','-1 minute'))"
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id) values ('zw-vers-l', '$PAAR', 'u-b', $QP, '$QN', 'claim', 'zw-vers')"
anzweifeln tok-a "zw-vers" versehen > /dev/null
post tok-c "proposals/$(zweifelId zw-vers)/vote" '{"antwort":true}' > /dev/null
pruefe "Zurückgesetzt" "$(sql "select zurueckgesetzt_am is not null as z from claims where id='zw-vers'" | feld "[0].z")" "1"
pruefe "Runde bleibt erledigt" "$(sql "select faellig_am = date('now','+7 days') as j from quests where id='$Q'" | feld "[0].j")" "1"
roh "update quests set wiederkehrend = 0, faellig_am = null, tage = null, rhythmus = null, vergabe_runde = null, dran = null, zugewiesen = null where id='$Q'"

echo "== Kinder: nur die Eltern zweifeln an"
roh "insert into users (id, email, name) values ('u-zj','zj@test','Jule Jugend'), ('u-zk','zk@test','Kim Kind') on conflict(id) do nothing"
roh "insert into members (couple_id, user_id, erwachsen, stufe) values ('$PAAR','u-zj',0,'gross'), ('$PAAR','u-zk',0,'ohne')"
roh "insert into sessions (token_hash, user_id, expires_at) values ('$(hash tok-zj)','u-zj',datetime('now','+1 day')), ('$(hash tok-zk)','u-zk',datetime('now','+1 day')) on conflict(token_hash) do update set expires_at = excluded.expires_at"
roh "insert into claims (id, couple_id, quest_id, claimed_by, quantity, points_each, status, decided_by, decided_at) values ('zw-kind', '$PAAR', '$Q', 'u-zk', 1, $QP, 'bestaetigt', 'u-a', datetime('now'))"
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id) values ('zw-kind-l', '$PAAR', 'u-zk', $QP, '$QN', 'claim', 'zw-kind')"
pruefe "Jugendliche nicht bei Kindern" "$(anzweifeln tok-zj zw-kind doppelt | feld ".fehler")" "Buchungen von Kindern zweifeln nur die Eltern an"
pruefe "… und sehen kein ›" "$(zeile tok-zj zw-kind ".anzweifelbar")" "false"
pruefe "Kinder ohne Konto gar nicht" "$(anzweifeln tok-zk zw-kind doppelt | feld ".fehler")" "Das machen die Erwachsenen"
pruefe "Eltern sehen das ›" "$(zeile tok-a zw-kind ".anzweifelbar")" "true"
ANTWORT=$(anzweifeln tok-a zw-kind versehen)
pruefe "Eltern dürfen" "$(echo "$ANTWORT" | feld ".status")" "offen"
pruefe "Kim stimmt nicht mit: 4 Köpfe" "$(echo "$ANTWORT" | feld ".koepfe")" "4"
pruefe "Kim stimmt nicht ab" "$(post tok-zk "proposals/$(zweifelId zw-kind)/vote" '{"antwort":true}' | feld ".fehler")" "Das machen die Erwachsenen"
roh "delete from proposal_votes where proposal_id in (select id from proposals where target_id='zw-kind'); delete from proposals where target_id='zw-kind'"
roh "delete from ledger where member_id in ('u-zj','u-zk'); delete from claims where claimed_by in ('u-zj','u-zk'); delete from ereignisse where user_id in ('u-zj','u-zk')"
roh "delete from sessions where user_id in ('u-zj','u-zk'); delete from members where user_id in ('u-zj','u-zk'); delete from users where id in ('u-zj','u-zk')"

echo "== Allein im Haushalt: entschieden ist es sofort"
roh "insert into users (id, email, name) values ('u-zs','zs@test','Sina Solo') on conflict(id) do nothing"
roh "insert into couples (id) values ('c-zs') on conflict(id) do nothing"
roh "insert into members (couple_id, user_id) values ('c-zs','u-zs') on conflict do nothing"
roh "insert into sessions (token_hash, user_id, expires_at) values ('$(hash tok-zs)','u-zs',datetime('now','+1 day')) on conflict(token_hash) do update set expires_at = excluded.expires_at"
roh "insert into quests (id, couple_id, name, points) values ('q-zs','c-zs','Fenster putzen',4) on conflict(id) do nothing"
roh "insert into claims (id, couple_id, quest_id, claimed_by, quantity, points_each, status, decided_at) values ('zw-solo','c-zs','q-zs','u-zs',1,4,'bestaetigt',datetime('now'))"
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id) values ('zw-solo-l','c-zs','u-zs',4,'Fenster putzen','claim','zw-solo')"
pruefe "Sofort zurückgesetzt" "$(anzweifeln tok-zs zw-solo versehen | feld ".status")" "bestaetigt"
pruefe "Stand 0" "$(sql "select points from balances where member_id='u-zs'" | feld "[0].points")" "0"
roh "delete from sessions where user_id='u-zs'; delete from couples where id='c-zs'; delete from users where id='u-zs'"

echo "== Aufräumen"
roh "delete from claims; delete from proposal_votes; delete from proposals; delete from ereignisse; delete from ledger"

echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler FEHLER"
exit "$fehler"
