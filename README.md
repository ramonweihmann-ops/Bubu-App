# Haus-Quest

Auf dem Handy heißt die App **Homi Point** — so steht es im Icon, unter dem Icon und auf dem
Startbild. Die Adresse bleibt `haus-quest.com`.

Punktekonto für einen Haushalt. Aufgaben („Quests“) haben einen **vorher festgelegten**
Punktwert. Wer eine erledigt, meldet sie — gutgeschrieben wird sie erst, wenn **jemand
anderes bestätigt**. Punktwerte ändern sich nie im Alleingang, sondern nur über eine
**Abstimmung**, der **alle** zustimmen.

Ob Pärchen, WG, Familie oder etwas anderes: der Haushalt hat einen Typ und so viele
Plätze, wie ihr braucht.

Grundlage ist die Reinigungsquest-Tabelle (22 Quests, 11 Belohnungen, zwei Konten).

Eigenes Projekt mit eigener Datenbasis — bewusst getrennt von allen anderen Projekten.

- **Mockup:** [`docs/mockup.html`](./docs/mockup.html) — im Browser öffnen, der Prototyp oben ist antippbar.
- **Mockup „Erster Start":** [`web/mockup/`](./web/mockup) — live unter `haus-quest.com/mockup/`.
  Der Entwurf, aus dem die Einrichtung entstanden ist.
- **Mockup „Wiederkehrende Aufgaben":** [`web/mockup-plan/`](./web/mockup-plan) — live unter
  `haus-quest.com/mockup-plan/`. Der Entwurf, aus dem der Haushaltsplan entstanden ist.
- **Mockup „Quest-Liste mit Cleanies":** [`web/mockup-quests/`](./web/mockup-quests) — live unter
  `haus-quest.com/mockup-quests/`. Drei Entwürfe für den Cleanies-Chip; gewählt wurde C.
- **Mockup „Urlaubsmodus":** [`web/mockup-urlaub/`](./web/mockup-urlaub) — live unter
  `haus-quest.com/mockup-urlaub/`. Der Entwurf, aus dem der Urlaubsmodus entstanden ist.
- **Mockup „Zurücktreten":** [`web/mockup-ruecktritt/`](./web/mockup-ruecktritt) — live unter
  `haus-quest.com/mockup-ruecktritt/`. Der Entwurf, aus dem der Rücktritt entstanden ist.
- **Mockup „Jubel nach Cleanies-Phasen":** [`web/mockup-animationen/`](./web/mockup-animationen) —
  live unter `haus-quest.com/mockup-animationen/`. Alle dreißig Animationen laufen dort echt,
  aus derselben Datei wie in der App.
- **Mockup „Events konfigurieren":** [`web/mockup-events/`](./web/mockup-events) — live unter
  `haus-quest.com/mockup-events/`. Der Entwurf, aus dem die Events entstanden sind.
- **Hörprobe „Klang zum Jubel":** [`web/mockup-klang/`](./web/mockup-klang) — live unter
  `haus-quest.com/mockup-klang/`. Vier Klangfamilien in allen drei Cleanies-Phasen, aus
  derselben Datei, die in der App läuft.
- **Mockup „Startseite neu gedacht":** [`web/mockup-start/`](./web/mockup-start) — live unter
  `haus-quest.com/mockup-start/`. Vorher-Bild und drei Vorschläge zum Anfassen; gebaut wurde die Mischung.
- **Mockup „Bilder für Quests und Belohnungen":** [`web/mockup-icons/`](./web/mockup-icons) — live unter
  `haus-quest.com/mockup-icons/`. Stift oben, Symbole für Quests, Hintergründe für Belohnungen — je drei Varianten;
  gebaut wurde A bei den Quests und B bei den Belohnungen, der Stern schwach dahinter.
- **Mockup „Familienmodus":** [`web/mockup-familie/`](./web/mockup-familie) — live unter
  `haus-quest.com/mockup-familie/`. Kinderprofile ohne Handy, drei Kinderansichten (Sparglas, Weg, Liste),
  Eintragen für Kinder, Wünsche, Taschengeld. Gebaut wurden Sparglas und Weg — das Kind wählt —, die Liste fiel weg.
- **Mockup „Fair-Bericht":** [`web/mockup-fair/`](./web/mockup-fair) — live unter
  `haus-quest.com/mockup-fair/`. Wer macht wie viel über Wochen und Monate: Waage gegen ein gemeinsames Soll,
  Verlauf, Räume, Arbeit, die man nicht sieht — als Bericht, als Monatsgeschichte und auf einen Blick, mit und ohne Plus.
  Gebaut wurden der Bericht und der Rückblick zum Monatsanfang.
- **Mockup „Startbild":** [`web/mockup-startbild/`](./web/mockup-startbild) — live unter
  `haus-quest.com/mockup-startbild/`. Das Homi-Point-Logo eine Sekunde beim echten Start der App, nicht beim
  Zurückholen aus dem Hintergrund oder beim Neuladen — drei Varianten zum Antippen, hell und dunkel.
  Gebaut wurde A: nur das Icon, im Dunkeln dunkel, mindestens 1 und höchstens 2,5 Sekunden.
- **Mockup „Konto löschen":** [`web/mockup-konto/`](./web/mockup-konto) — live unter
  `haus-quest.com/mockup-konto/`. Konto löschen und Haushalt verlassen: drei Arten zu bestätigen, was mit Haushalt,
  Kindern und Cleanies passiert, was die anderen danach sehen, und die Löschseite im Web für Google Play.
  Gebaut wurde A: „löschen“ eintippen, sofort und endgültig, dazu „Haushalt verlassen“.
- **Tests:** [`tests/`](./tests) — alle Regressionssuiten, `bash tests/alle.sh` spielt sie durch.
- **Einrichtung:** [`docs/SETUP.md`](./docs/SETUP.md) — Schritt für Schritt, was zu klicken ist.
- **Google-Login:** [`docs/google-login.md`](./docs/google-login.md) — die neue Google Auth Platform, Klick für Klick.
- **Geplant:** [`docs/naechste-schritte.md`](./docs/naechste-schritte.md) — Dashboard mit Prognose, Rabatte, doppelte Punkte.
- **Datenbank:** [`d1/migrations/`](./d1/migrations) — Tabellen und Regeln, als Migrationen.

---

## Die drei Regeln

| Regel | Bedeutung |
| --- | --- |
| Preis steht vorher | Beim Melden wird der aktuelle Punktwert eingefroren. Spätere Änderungen wirken nie rückwirkend. |
| Vier Augen | Melden darf jeder, freigeben nur jemand **anderes**. Wer meldet, kann nie selbst bestätigen — sonst reicht eine beliebige andere Person aus dem Haushalt. |
| Nur gemeinsam | Punktwert ändern, Quest oder Belohnung anlegen **oder löschen**, Aktion starten, Event konfigurieren: nur mit Zustimmung **aller**. Ein Nein lässt alles beim Alten, eine fehlende Stimme hält den Vorschlag offen. |

Die Übernahme selbst — neuer Punktwert, neuer Eintrag, Löschung, Aktion, Event — passiert in derselben
Transaktion wie das Schließen der Abstimmung: entweder beides oder nichts. Sollte eine Abstimmung
doch einmal trotz vollständiger Zustimmung offen stehen bleiben, zieht die App sie beim nächsten Laden nach.

Die zweite Regel ist keine Frage der Oberfläche, sondern der Datenbank: Wer eine eigene Meldung
bestätigen will, bekommt einen Fehler — nicht weil ein Knopf versteckt ist, sondern weil die
Datenbank es abweist (CHECK in der Tabelle und Prüfung in `worker/api.js`). Punktestände werden nirgends
gespeichert, sondern aus allen Buchungen berechnet.

## Familienmodus

Kinder machen mit, auch ohne eigenes Handy. Ein Kind ist ein Mitglied ohne Google-Konto: Vorname und
Tier, keine E-Mail, kein Foto. Angelegt wird es nur mit Einwilligung eines Erwachsenen.

| Stufe | Anmeldung | Was das Kind sieht |
| --- | --- | --- |
| Ohne Handy | keine — die Eltern tragen ein | die Kinderansicht auf dem Handy der Eltern, mit Eltern-PIN zurück |
| Eigenes Gerät | ein Code oder QR-Code, zehn Minuten gültig, ohne Google | die Kinderansicht |
| Jugendlich | eigenes Google-Konto | die normale App |

Die Kinderansicht zeigt den Wunsch als Sparglas oder als Weg — das Kind wählt. Dazu gelten drei Regeln:
**Kinder bestätigen nie Kinder** (bei Kindern ist immer ein Erwachsener das zweite Paar Augen; Kinder
mit eigenem Gerät dürfen dafür die Eltern bestätigen), **abstimmen dürfen Erwachsene und Jugendliche**,
und **wer allein mit kleinen Kindern ist, dessen Meldung zählt sofort**. Was Eltern für ein Kind
eintragen, haben sie gesehen — es zählt gleich. Taschengeld ist eine Buchung wie eine Einlösung; den
Kurs ändern die Erwachsenen gemeinsam. Der Code dazu steht in `worker/familie.js`.

## Fair-Bericht

Wer macht wie viel — nicht nur diese Woche, sondern über Monate. Zu finden hinter der Kachel „Diese
Woche“ und unter „Wir“. Gerechnet wird aus den Buchungen, die es schon gibt (`worker/fair.js`).

| Teil | Was er zeigt |
| --- | --- |
| Waage | Cleanies aus bestätigten Quests, gemessen an dem, was ihr fair nennt — zu zweit per Abstimmung, Start bei 50 : 50 |
| Verlauf | je Tag, Woche oder Monat der Anteil, mit Soll-Linie und Tabelle |
| Wer macht was | Anteile je Raum |
| Was man nicht sieht | Bestätigen, Vorschlagen, Übernehmen, Einlösen — daneben, nicht in der Waage |
| Kinder | eine eigene Zeile, nicht in der Waage |
| Rückblick | der Vormonat in Karten, in der ersten Woche des Monats auf der Startseite |

Zeiträume: Woche, Monat, 13 Wochen, Jahr, zurückblättern; Export als PDF und als Tabelle (CSV). Ohne
Plus gibt es nur die Waage der laufenden Woche, der Rest liegt hinter dem Schloss, einmal 14 Tage zum
Testen. Bis Plus sich kaufen lässt, haben es alle Haushalte (`couples.plus` steht auf 1).

## Konto löschen und Haushalt verlassen

Beides unter Einstellungen → Konto, ohne App unter `haus-quest.com/konto-loeschen/` (verlangt Google Play).
Gelöscht wird sofort und endgültig, bestätigt durch Eintippen von „löschen“. Der Code steht in `worker/konto.js`.

- **Was einem selbst gehört, geht:** Name, E-Mail, Bild, Anmeldungen, Cleanies, Meldungen, Anträge,
  Erledigungen (auch aus dem Fair-Bericht der anderen), Nachrichten, offene Vorschläge und Stimmen.
- **Was andere betrifft, bleibt ohne Namen:** Bestätigungen, Geschenke, Aktionen, Events, Haushaltsurlaube.
  Sie zeigen auf einen Platzhalter „Ehemaliges Mitglied“ (`users.id` = `ehemalig-<Haushalt>-…`, ohne
  E-Mail, in keinem Haushalt); der Name verschwindet auch aus Buchungstexten und Nachrichten.
- **Die letzte Erwachsene** nimmt beim Löschen den Haushalt mit, samt Kinderprofilen; Jugendliche behalten
  ihr Konto. Verlassen kann sie den Haushalt nicht, solange Kinder da sind.
- **Haushalt verlassen** behält das Konto; danach neu gründen oder mit Code beitreten.

## Rechtstexte

`haus-quest.com/impressum/`, `/datenschutz/` und `/teilnahme/` (Teilnahmebedingungen für den Pilot; AGB kommen
mit der Bezahlung). Verlinkt von der Startseite, der Anmeldung, den Einstellungen und der Löschseite. Anbieter ist
im Pilot eine Privatperson, wie bei Love Diary. Ändert sich, was die App speichert, muss die Tabelle in der
Datenschutzerklärung mit.

## Datenbank in der EU

Die Datenbank liegt in Cloudflare als `homi-point` und ist auf die EU festgelegt (Jurisdiction `eu`). Die
Festlegung geht nur beim Anlegen; die erste Datenbank (`haus-quest`) hatte keine, deshalb der Umzug im Oktober 2026.

Für den Umzug hängt die alte Datenbank als `ALT` neben `DB`. `worker/umzug.js` kopiert alles aus `ALT` nach `DB` —
Eltern vor Kindern, Zeile für Zeile mit „insert or ignore“ — und setzt am Ende die Marke `umzug_eu` in
`einstellungen`. Weil ein Aufruf im kostenlosen Plan nur 10 ms Rechenzeit hat, kopiert jeder Aufruf höchstens 100
Zeilen und macht dort weiter, wo der letzte aufgehört hat; ein abgebrochener Aufruf verliert nichts. Bis die Marke
steht, antwortet die Schnittstelle mit 503 „Homi Point zieht gerade um“. `/api/health` schiebt den Umzug an und
zeigt, wie weit er ist, woran er scheitert und aus welcher Region die Datenbank antwortet — nach dem Ausrollen
`/api/health` aufrufen, bis dort `umzug.am` steht. Ist alles geprüft, fliegen `ALT` und `umzug.js` raus, und
die alte Datenbank wird gelöscht — spätestens 30 Tage nach dem Umzug, so steht es in der Datenschutzerklärung.

## Aufbau

```
haus-quest.com          →  Seite mit dem Installationsknopf
haus-quest.com/app      →  die App (Web-App zum Anheften, PWA)
haus-quest.com/api/…    →  Worker: prüft, wer fragt, und setzt die Regeln durch
                            D1: Quests, Meldungen, Buchungen
```

| Baustein | Technik | Kosten |
| --- | --- | --- |
| Website + App | Cloudflare Workers (statische Dateien) | 0 € |
| API und Regeln | derselbe Worker unter `/api` | 0 € |
| Datenbank | Cloudflare D1 (SQLite) | 0 € |
| Anmeldung | Google OAuth, Sitzung im Worker | 0 € |
| Benachrichtigungen | Web Push (VAPID), Schlüsselpaar erzeugt sich selbst | 0 € |
| Domain | beliebiger Registrar | ~5–12 €/Jahr |

Warum nicht Supabase: Der kostenlose Rahmen erlaubt zwei aktive Projekte pro Konto, und die
sind hier bereits belegt. Das fertige Postgres-Schema liegt für den Fall der Fälle unter
[`supabase/schema.sql`](./supabase/schema.sql) bereit — Details im
[Anhang der Einrichtung](./docs/SETUP.md#anhang-supabase-variante).

## Erster Start

Beim allerersten Öffnen läuft die Einrichtung — genau einmal:

1. **Name und Bild.** Vorname oder Spitzname frei wählbar, Google schlägt nur vor. Dazu
   eine der Figuren, ein Zeichen oder ein eigenes Foto.
2. **Begrüßung.** Von hier führt auch der Weg für alle, die eingeladen wurden: *Ich wurde
   eingeladen — Code eingeben*.
3. **Haushalt.** WG, Familie, Pärchen oder Sonstige, dazu die Zahl der Teilnehmer — bei
   einer Familie getrennt nach Erwachsenen und Kindern. Pärchen sind meist zwei, dürfen
   aber mehr sein.
4. **Räume.** Vorschläge zum Antippen, Eigenes dazu.
5. Zwei Erklärseiten, dann **Jetzt starten** und die Einladecodes.

Der Code gilt 24 Stunden und bleibt gültig, solange noch Plätze frei sind — in einer WG
kommen nicht alle in derselben Minute.

## Rollen

| Wer | Darf |
| --- | --- |
| Alle | Melden, bestätigen, beantragen, übertragen, abstimmen, Räume pflegen, Quests einem Raum zuordnen. Kinder eingeschlossen. |
| Verwalter | Zusätzlich: einladen, Haushaltstyp und Plätze ändern. Wer einrichtet, verwaltet; in einer Familie können das mehrere Erwachsene sein. |

Am täglichen Gebrauch ändert die Rolle nichts. Sie regelt nur das, was sonst niemand
allein tun sollte.

## Bilder

Jede Person hat ein eigenes Bild: eine der mitgelieferten Figuren, ein Zeichen — oder ein
Foto vom Handy. Das Foto wird **vor** dem Hochladen quadratisch zugeschnitten und auf 256
Pixel verkleinert; alles, was sonst in einer Fotodatei steckt (Ort, Uhrzeit, Kameramodell),
bleibt dabei auf der Strecke. Änderbar in den Einstellungen, jederzeit, ohne Abstimmung.

## Räume

Die Räume sind die Kategorien der Quests: danach wird sortiert, gefiltert und gesucht, und
daran hängt auch eine Aktion wie „+100 % auf Küche“. Pflegen darf sie jeder — das ist
Ordnung, nicht Punktesache. Ein umbenannter Raum zieht seine Quests mit; ausblenden geht
erst, wenn keine Quest mehr darin liegt.

Eine Quest in einen anderen Raum zu schieben geht über den **Stift** in der Liste und
braucht keine Abstimmung — am Punktwert ändert sich dabei nichts.

## Anmeldung

Google Sign-In — kein eigenes Passwort, keine Registrierung. Übernommen werden Name, E-Mail
und Profilbild. Wer den Namen in den Einstellungen ändert, behält ihn: die nächste Anmeldung
lässt ihn dann in Ruhe.

Ein Konto gehört zu genau einem Haushalt — das erzwingt die Datenbank. Wie viele Personen
ein Haushalt hat, steht in seinen Einstellungen und lässt sich jederzeit ändern.

## Trennung von anderen Projekten

| Ebene | Trennung |
| --- | --- |
| Repository | Eigenes Repo, eigener Verlauf, eigene Releases. |
| Datenbank | Eigene D1-Instanz, ausschließlich für diese App. Kein geteiltes Schema, keine geteilten Tabellen. |
| Nutzerkonten | Eigene Sitzungsverwaltung. Eine Anmeldung anderswo gilt hier nicht und umgekehrt. |
| Schlüssel | Eigene Secrets in diesem Repo. Kein Schlüssel wandert zwischen Projekten. |
| Hosting | Eigenes Cloudflare-Projekt unter eigener Domain. |

## Wie die App aufs Handy kommt

Über die Domain: Seite öffnen, **App installieren** antippen, fertig. Danach liegt sie als
Symbol auf dem Startbildschirm, mit eigenem Fenster und Push-Benachrichtigungen — auf Android
kaum von einer Store-App zu unterscheiden. Kein Store, keine Gebühr, keine Installationsdatei
zum Verschicken, und Updates sind sofort bei beiden.

Falls es später doch in den Play Store soll: Dieselbe App lässt sich mit Bubblewrap in eine APK
verpacken, ohne den Code neu zu schreiben. Das Google-Entwicklerkonto kostet einmalig 25 US-Dollar.

## Figuren und Namen

Fuchs und Wolf liegen als Bilddateien in `web/` (`logo.webp`, `fox.webp`, `wolf.webp`) und
in `docs/assets/`. Sie können bleiben oder in einem Zug getauscht werden. Das **App-Symbol**
in `web/icons/` ist davon unabhängig: es entsteht aus `docs/assets/grafik.png` und zeigt
beide Figuren nebeneinander.
Der Name **Haus-Quest** ist beschreibend und übersteht einen Verkauf; privat heißt die App
weiterhin Bubu App.

## Startseite

Die Startseite passt auf einen Bildschirm. Von oben nach unten:

- **Das Konto** als eine Leiste: der eigene Stand groß, dazu „+N diese Woche“, die anderen
  klein daneben. Antippen führt in den Verlauf.
- **Was gerade läuft** als schmale Pillen: Aktion, Event, Urlaub. Ein Event öffnet sein
  Blatt mit *Einlösen*, *Ändern* und *Beenden*.
- **Für dich** — ein Stapel aus Karten. Darin liegt alles, was auf mich wartet: Meldungen,
  Anträge und Geschenke zum Entscheiden, Rückfragen an mich, meine Aufgaben aus dem Plan,
  Abstimmungen ohne meine Stimme, Empfangsbestätigungen und Zusagen. Jede Karte hat zwei
  Knöpfe, und wischen geht auch: **rechts erledigt die Sache**, links ist das Sichere —
  *Nachfragen*, *Später*, *Weiterreichen*. Endgültig Nein sagt man im Stapel nur bei
  Abstimmungen; *Ablehnen* und alle anderen Feinheiten liegen hinter **Alle ›**.
  Zustimmen lässt die ausgelösten Cleanies aufsteigen, die letzte Karte bringt den Jubel.
  *Später* gilt, bis die App neu geladen wird.
- **Zwei Kacheln**: der Haushaltsplan (was überfällig ist, was mir gehört) und **Diese
  Woche** — was der Haushalt seit Montag zusammen gesammelt hat. Ein **Wochenziel** gibt
  es nur, wenn die Verwaltung eins eingetragen hat; bis dahin steht genau das dort.
  Es ist ein gemeinsames Ziel, keine Rangliste.
- **Zwei dünne Zeilen**: was auf die anderen wartet, und die letzte Buchung mit dem Weg
  in den Verlauf.

„Prüfen“ hat keinen eigenen Reiter mehr. In der Mitte der Leiste sitzt stattdessen das
**Plus**: die meistgenutzten Quests zuerst, darüber eine Suche, und von dort geht es weiter
wie immer.

## Listen bedienen

Quests und Belohnungen haben oben ein Suchfeld (Groß- und Kleinschreibung sowie Umlaute egal),
darunter Sortierung nach **meist genutzt**, **Cleanies** oder **Alphabet** — die aktive
Sortierung kehrt beim erneuten Tippen ihre Richtung um. Bei den Quests bleibt darunter der
Filter nach Kategorie.

Jede Quest zeigt links ein **Symbol** auf einer farbigen Kachel und rechts ihre **Cleanies**,
der Stern ganz schwach dahinter. Jede Belohnung trägt oben ein **Bild** und darunter die
Schrift — die Schrift steht nie auf dem Bild —, dazu ein Symbol statt des Herzens. Was noch
niemand gewählt hat, schlägt die App aus dem Namen vor, sonst aus dem Raum.

Antippen meldet eine Quest oder beantragt eine Belohnung. Zum Anpassen sitzt der **Stift
oben neben dem Plus**: er schaltet die Liste in den Bearbeiten-Modus, dann die Quest oder
Belohnung antippen. Das Menü bietet oben **Bild ändern** — Symbole in Gruppen wie bei
WhatsApp, eine Farbe, oder ein eigenes Bild; bei Belohnungen ein Motiv oder ein eigenes Foto.
Bilder sind Ordnung wie die Räume und gelten **sofort, ohne Abstimmung**. Darunter stehen wie
bisher Cleanies-Wert, Raum, Rhythmus und Löschen; Cleanies, Rhythmus und Löschen laufen weiter
über die Abstimmung. Eigene Bilder werden auf dem Handy verkleinert (Symbol 160, Foto 640
Pixel) und einzeln ausgeliefert, nicht mit jeder Abfrage des Zustands.

## Einstellungen

Das Zahnrad steht oben neben dem Verlauf, auf **Start** und auf **Wir**. Darunter liegen:

| Einstellung | Reicht wie weit |
| --- | --- |
| **Anzeigename** | Gilt für beide — der Name steht auch in der App des anderen. Ändern darf ihn jeder für sich allein, das ist keine Sache für eine Abstimmung. |
| **Dunkles Design** | Nur dieses Gerät. *System* folgt der Handy-Einstellung und wechselt mit ihr, *Hell* und *Dunkel* setzen sich darüber. |
| **Benachrichtigungen** | Nur dieses Gerät. Zeigt auch, wenn der Browser sie blockiert — dann hilft nur dessen Berechtigungsdialog. |

Der dunkle Satz ist dieselbe Marke mit getauschten Rollen: Navy als Grund, Weiß als Schrift.
Das Rot bleibt, wird aber für Schrift aufgehellt und für gefüllte Knöpfe vertieft — sonst
trägt weißer Text darauf nicht. Die Wahl liegt im Speicher des Browsers, nicht in der
Datenbank, und wird schon im Kopf der Seite gesetzt, damit beim Öffnen kein Weiß aufblitzt.

Die Fußleiste steht fest am unteren Rand: sie bleibt sichtbar, egal wie lang eine Liste ist.
Auf Unterseiten — Verlauf, Auswertung, Einstellungen — leuchtet weiter der Reiter, aus dem sie
hervorgehen, damit die Leiste nie erloschen wirkt.

## Haushaltsplan

Eine wiederkehrende Aufgabe ist **keine eigene Sorte, sondern eine Quest mit Rhythmus**.
Jede bestehende Quest lässt sich dazu machen — über den Stift, ohne sie neu anzulegen —
und genauso wieder zurück. Gemeldet und bestätigt wird sie wie jede andere Quest auch.

Der Plan zeigt alle Quests mit Rhythmus, zu finden auf der Startseite über der Auswertung;
ist etwas überfällig, springt eine rote Karte davor.

| Sache | Wie es läuft |
| --- | --- |
| **Rhythmus** | *1× pro Woche* bis *1× im Quartal*. Daraus folgt alles Weitere. |
| **Umstellen** | Stift an der Quest → *Wiederkehrende Aufgabe daraus machen*. Geht über dieselbe Abstimmung wie alles andere, und *Keine wiederkehrende Aufgabe mehr* macht es rückgängig — die Quest bleibt dabei bestehen. |
| **Sperre** | Nach dem Erledigen springt das Fälligkeitsdatum um genau den Rhythmus nach vorn. Bis dahin kann sie niemand noch einmal melden. Für besondere Umstände gibt es **Trotzdem erledigen** — mit Begründung, und jemand anderes muss trotzdem bestätigen. |
| **Punkte** | Ganz normal: melden, jemand anderes bestätigt, dann gibt es sie. |
| **Bewerbung** | Bewerben kann sich jeder. Einen Tag vor Fälligkeit friert die App die Reihenfolge ein und zeigt allen Bewerbern dieselbe Liste. |
| **Reihenfolge** | Wer am wenigsten **am Stück** dran war, steht oben. Bei Gleichstand die kleinere Jahreszahl. Wer zuletzt dran war, rutscht nach unten — genau das sorgt für den Wechsel. |
| **Annehmen** | Nur wer oben steht. Ablehnen reicht an Platz 2 weiter; lehnen alle ab, ist die Aufgabe wieder für jeden offen. |
| **Ein Bewerber** | Bekommt sie ohne Rangliste. Bewirbt sich niemand, macht sie, wer sie macht. |
| **Zurücktreten** | Wem die Runde gehört, kann sie abgeben — mit Begründung. Darüber entscheidet eine **Mehrheit** des Haushalts, nicht alle. Geht sie durch, fällt die Zuteilung weg und die Runde ist wieder für jeden offen; **die Frist bleibt stehen**. Ein einzelnes Nein beendet den Antrag nicht, und wer ablehnt, darf sagen warum. |
| **Überfällig** | Ab dem ersten Tag Benachrichtigung an alle. Nach sieben Tagen verliert jeder den Punktwert der Aufgabe — abschaltbar unter Einstellungen → Haushalt. |

„Am Stück" kann nur die Person haben, die zuletzt dran war: sobald jemand anderes erledigt,
fängt der Zähler aller anderen wieder bei null an. Beide Zahlen stehen offen in der Aufgabe,
damit die Reihenfolge nachvollziehbar bleibt.

Anlegen, umstellen und zurückstellen geht wie alles andere nur über eine **Abstimmung**.

Vergabe, Mahnung und Strafe hängen am Kalender, nicht an einer Bedienung. Ein **Cron**
weckt den Worker deshalb jeden Morgen um 6 Uhr UTC und zieht sie für alle Haushalte nach;
beim Laden der App passiert dasselbe noch einmal. Doppelt schadet nicht, weil jeder Schritt
am Fälligkeitsdatum festhält, dass er gelaufen ist.

### Mehrmals melden, bevor jemand entschieden hat

Eine offene Meldung hält keine zweite auf. Wäsche hängt man mehrmals am Tag auf, und
niemand sitzt daneben und gibt jedes Mal sofort frei — die Arbeit soll nicht warten müssen,
bis jemand Zeit zum Bestätigen hatte. Die Quest bleibt in der Liste wählbar und zeigt daneben,
wie viele Meldungen schon warten; im Blatt steht derselbe Hinweis.

**Jede Meldung wird einzeln entschieden.** Zweimal gemeldet und zweimal bestätigt heißt
zweimal Cleanies — die Arbeit war ja auch zweimal da. Das Vier-Augen-Prinzip bleibt davon
unberührt: freigeben muss weiterhin jemand anderes.

### Eine geplante Aufgabe bleibt eine Quest

Wer eine Quest in den Haushaltsplan hebt, gibt sie nicht ab. Sie steht weiter in der
**Quest-Liste**, lässt sich dort melden, und das Blatt zeigt als Streifen, was der Plan über
sie weiß — Rhythmus, Frist, wem die Runde gehört. Der Plan plant sie zusätzlich ein; gehören
tut sie ihm nicht.

Zwei Dinge wollen dabei einen Satz dazu, halten aber nicht auf:

| Fall | Was passiert |
| --- | --- |
| **Noch gesperrt** | Melden geht mit Begründung. Ohne die Sperre ließe sich dieselbe Aufgabe fünfmal am Tag abrechnen. |
| **Runde gehört jemand anderem** | Melden geht mit Begründung. Wer die Arbeit wirklich gemacht hat, weiß der Haushalt besser als eine Regel — und bestätigen muss ohnehin jemand anderes. |

Die Begründung wandert als Notiz an die Meldung, damit auf der Prüfkarte steht, was besonders
war: „Vorzeitig: …" oder „Für Anna übernommen: …". Solange eine Meldung offen ist, ist die
Aufgabe für alle gesperrt — es gibt nur eine Runde.

## Urlaubsmodus

Zwei Dinge, die beide „Urlaub" heißen. Beide beschließt der Haushalt gemeinsam, beide
stehen unter **Einstellungen → Urlaubsmodus**, und beide lassen sich vorzeitig beenden,
ohne noch einmal abzustimmen — früher zurück zu sein ist nie ein Vorteil.

| | **Nur eine Person** | **Der ganze Haushalt** |
| --- | --- | --- |
| Fälligkeiten | bleiben stehen | rücken um die Urlaubstage nach hinten |
| Mahnungen | gehen an alle anderen | fallen weg, solange er läuft |
| Gruppenstrafe | die Person zahlt nicht mit; die Anwesenden zahlen deshalb **nicht mehr**, sondern weiter nur ihren eigenen Anteil | fällt weg, solange er läuft |
| Rangliste | die Person wird übersprungen | ruht |
| Melden, Belohnungen, Cleanies senden | unberührt | unberührt |
| Beenden | die Person selbst | wer ihn vorgeschlagen hat, oder die Verwaltung |

Ein Rückstand wird beim Haushaltsurlaub **verschoben, nicht erlassen**: was vorher überfällig
war, ist es danach wieder, mit demselben Abstand. Sonst wäre „kurz vor dem Urlaub nichts mehr
machen" eine Strategie. Wird erst mitten im Urlaub abgestimmt, verschiebt die App nur noch die
verbleibenden Tage — sonst bekäme der Plan Tage geschenkt, die längst vorbei sind.

Die Zähler „am Stück" und „dieses Jahr" laufen im Urlaub nicht weiter, weil sie aus den
Meldungen kommen. Wer zurückkommt, steht also nicht schlechter da als vorher.

## Was von mir noch offen ist

Auf der Startseite führt die Zeile **Wartet auf …** zu allem, was ich losgeschickt habe und
was noch niemand entschieden hat: gemeldete Quests, beantragte Belohnungen samt Terminwunsch und
angebotene Übertragungen. Steht dazu eine Rückfrage, sagt die Zeile das ebenfalls.

## Rückfragen

Auf eine Meldung oder einen Antrag gab es lange nur Ja oder Nein. Passt bloß der Termin
nicht, ist beides falsch. Deshalb gibt es einen dritten Weg: **Nachfragen** — im Stapel
auf der Startseite der linke Knopf.

Der Antrag bleibt dabei offen — er wird weder genehmigt noch abgelehnt. Die Frage hängt
daran, samt Terminvorschlag; wer den Antrag gestellt hat, findet sie als Karte im Stapel,
antwortet und schickt ihn erneut. Danach steht er wieder zur Entscheidung.

## Belohnungen: zugesagt ist noch nicht erhalten

Nach der Genehmigung sind die Punkte weg — die Belohnung selbst kommt erst noch. Deshalb
bestätigt, **wer sie eingelöst hat**, dass sie tatsächlich kam.

| Fall | Was passiert |
| --- | --- |
| **Bekommen** | Fertig. |
| **Kam nicht** | Wer zugesagt hat, verliert denselben Betrag. Die Einlösung wird nicht rückgängig gemacht: bezahlt und nichts bekommen ist der Schaden, deshalb steht die Strafe auf der anderen Seite. |
| **Doch noch geliefert** | Binnen **drei Tagen** kann die zusagende Person *Habe ich nachgeholt* melden. Bestätigt der Empfänger, sind die Punkte wieder da. Danach ist es endgültig. |

Ausnahme- und Vetoanträge haben nichts zu liefern — für sie entfällt die Bestätigung.
Beim Anlegen oder Ändern einer Belohnung steht dafür ein Haken bereit, der wie alles
andere über eine Abstimmung gesetzt wird.

### Cleanies an den Empfänger

Normalerweise sind die Cleanies einer Einlösung danach einfach weg. Für „ich koche heute für
dich" ist das falsch herum: wer die Belohnung erbringt, soll sie auch bekommen können.

Im Antrag steht deshalb ein Haken **Cleanies an Empfänger senden**. Ist er gesetzt, wird der
Betrag bei der Genehmigung nicht nur abgebucht, sondern der gewählten Person gutgeschrieben —
beides in derselben Transaktion. Neben *Konto nach Einlösung* erscheint dann eine zweite
Zeile mit dem alten und neuen Stand dieser Person.

Wer mehr als eine Person im Haushalt hat, wählt zusätzlich aus, wer sie bekommt. Bei genau
einer anderen Person entfällt die Wahl — es gibt nur eine Möglichkeit.

Der Haken wird **nie gemerkt**: jeder Antrag fängt wieder ohne an. Sich selbst gutschreiben
geht nicht, und wer nicht zum Haushalt gehört, auch nicht. Bleibt die Belohnung aus, greift
dieselbe Regel wie sonst — wer zugesagt hat, verliert den Betrag wieder.

## Jubel

Nach jeder **bestätigten** Meldung wird gefeiert — wie laut, hängt an den Cleanies der Quest,
nicht am Kontostand. Drei Stufen, und das Feuerwerk gibt es nur in der obersten: sonst nutzt es
sich ab, und die kleine Quest fühlt sich an wie die große.

| Stufe | Standard | Was passiert |
| --- | --- | --- |
| **Leise** | 1 – 3 | Seifenblasen, Funkeln, Herzchen, eine sanfte Welle. Kurz und klein. |
| **Mittel** | 4 – 6 | Konfettiregen, Sternschnuppe, Luftschlangen, Sprudel. Mehr Bewegung, kein Knall. |
| **Groß** | ab 7 | Feuerwerk, Supernova, Doppelkanone, Raketen, großes Finale. Nach oben offen. |

Zehn Rezepte je Stufe, zufällig gezogen — aber nie dasselbe wie beim letzten Mal. Sie sind
Code, kein Download: eine kleine Bühne in [`web/app/feier.js`](./web/app/feier.js) kennt ein
paar Gesten (streuen, knallen, regnen, blitzen, Fontäne, Kanone, Welle), und ein Rezept ist
drei Zeilen. Damit laufen sie offline und kosten nichts.

Unter **Einstellungen → Jubel** verschiebt die Verwaltung die beiden Grenzen und legt eigene
**GIFs** dazu, je Stufe, bis 400 KB. Sie kommen zu den eingebauten dazu und ersetzen sie nicht
— sonst wäre nach dem ersten Hochladen wieder immer dasselbe zu sehen. Das braucht keine
Abstimmung: es ist eine Anzeigesache, keine Cleanies-Sache.

Wer am Gerät **„Bewegung reduzieren"** eingestellt hat, bekommt gar keine Animation. Das ist
eine Einstellung des Handys und hat Vorrang.

## Auswertung

Punkte je Tag der letzten zwei Wochen als Balken — du und alle anderen zusammen, dazu
Hochrechnungen auf Woche und Monat aus dem Schnitt der letzten sieben Tage. Gezählt wird nur,
was durch **bestätigte Quests** hereinkam — Übertragungen und Einlösungen sind Bewegungen,
kein Verdienst.

Der Tag beginnt dort, wo die Person wohnt: die App schickt ihren Zeitversatz mit, damit eine
Meldung um 23 Uhr nicht auf den Folgetag rutscht.

## Aktionen

Befristete Zeiträume, die nur gemeinsam starten — über dieselbe Abstimmung wie alles andere:

- **Doppelte Punkte** auf Quests, wahlweise für alle oder nur für einen Raum
  („+100 % auf Küche, diese Woche“)
- **Rabatt** auf Belohnungen, in Prozent

Der Faktor greift beim **Melden** bzw. beim **Stellen des Antrags** — dort friert der Wert ein.
Wer während der Aktion meldet, behält den erhöhten Wert, auch wenn erst danach bestätigt wird;
wer vorher gemeldet hat, bekommt nichts nachträglich. Damit bleibt die Grundregel unangetastet:
der Preis steht fest, bevor gearbeitet wird — und niemand hat einen Grund, Meldungen
zurückzuhalten.

## Events

Eine **Regel auf Zeit, die der Haushalt selbst schreibt** — das Gegenstück zur festen
Belohnungsliste. Angelegt wird sie unter **Wir → Aktionen → Event konfigurieren**, freigegeben
wie alles andere: nur mit der Zustimmung aller.

| Feld | |
| --- | --- |
| Richtung | **ausgeben** (Cleanies gehen weg, es gibt etwas dafür) oder **verdienen** |
| Wofür | freies Textfeld, Pflicht — kein Menü, keine Kategorien |
| Was gilt | freiwilliges Kleingedrucktes („nicht nach 20 Uhr") |
| Cleanies | eine Zahl pro Stück; was ein Stück ist, sagt der Text |
| Wie oft | einmal pro Person oder mehrfach, dazu ein freiwilliger Deckel fürs ganze Event |
| Für wen | alle oder ausgewählte Personen; wer nicht dabei ist, sieht es ohne Knopf |
| Wann | eine **Dauer** ab Freigabe *oder* ein **Zeitraum** im Kalender |
| Dauerevent | Rhythmus (jede Woche · alle 2 Wochen · 1× im Monat · 1× im Quartal), Starttag, Fensterlänge |

Der Kniff dabei: ein freigegebenes Event ist **keine neue Mechanik**. Es hängt an einer ganz
gewöhnlichen Belohnung (Richtung „ausgeben") oder an einer ganz gewöhnlichen Quest
(„verdienen") und schaltet sie im Fenster scharf. Einlösen ist deshalb der Antrag, den es
längst gibt — samt Freigabe, Empfangsbestätigung, Rückholung bei Nichtlieferung, Verlauf und
Statistik. Ein eigener Reiter hätte all das noch einmal von vorn gebraucht.

Ein Dauerevent wird **einmal** abgestimmt und rückt danach von allein weiter — beim Laden der
App und im Wecker. Der Starttag rastet dabei immer wieder ein: ein Haushaltsurlaub schiebt die
Fenster um seine Tage mit, und „jedes Wochenende" liegt danach wieder am Wochenende.
**Ändern und Beenden** gehen über dieselbe Abstimmung wie das Anlegen; ein laufendes Fenster
wird nie mittendrin abgeschnitten. Eine laufende Aktion legt sich **nicht** auf einen
Eventpreis — sonst hieße „20 Cleanies" mal 20 und mal 15.

## Benachrichtigungen

Jede Entscheidung erreicht die andere Person auf zwei Wegen:

- **Push aufs Handy**, auch bei geschlossener App. Das Schlüsselpaar (VAPID) erzeugt der Worker
  beim ersten Versand selbst und legt es in der Datenbank ab — es ist nichts von Hand zu hinterlegen.
- **Ein gemerktes Ereignis** in der Datenbank. Beim nächsten Öffnen zeigt die App den
  Vollbild-Moment nach — auch wenn die Push-Nachricht nie ankam oder weggewischt wurde.

Der Moment erscheint dadurch bei **beiden**: beim Prüfenden sofort — im Stapel als
aufsteigende Cleanies, unter „Alle ›“ als Vollbild —, beim Melder als Vollbild, sobald er die
App das nächste Mal öffnet. Zustimmung feiert mit Konfetti und hochzählenden Cleanies, eine
Ablehnung wird ruhig gezeigt.

## Aufbau des Codes

```
web/            Startseite mit Installationsknopf, Symbole, Service Worker
web/app/        Die App selbst (index.html, app.css, app.js) — ohne Bauschritt
                feier.js: die dreißig Jubel-Animationen
worker/         Schnittstelle: index.js (Router und Wecker), auth.js (Google),
                api.js (Regeln), plan.js (Quests mit Rhythmus),
                rueckmeldung.js (Rückfragen, Empfang, Strafe, Zurückziehen),
                urlaub.js (Urlaubsmodus), events.js (Regeln auf Zeit),
                melden.js und push.js (Benachrichtigungen)
d1/migrations/  Datenbank: Tabellen, Ansichten, Änderungsschritte
tests/          Regressionssuiten: API über curl, Oberfläche über Playwright
docs/           Mockup und Anleitungen
```
