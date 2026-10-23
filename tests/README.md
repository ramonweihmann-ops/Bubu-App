# Tests

Zwei Sorten, beide gegen eine laufende App:

- **`*-api.sh`** sprechen mit `/api` über `curl` und prüfen die Regeln direkt in
  der Datenbank. Sie sind schnell und sagen genau, welche Regel gebrochen ist.
- **`ui-*.mjs`** fahren die Oberfläche mit Playwright — zu zweit oder zu dritt,
  jede Person in einem eigenen Browserfenster. Sie prüfen, was auf dem Schirm
  steht, und melden jeden Fehler aus der Browserkonsole mit.

## Loslegen

```bash
# in einem zweiten Fenster — mit den beiden Testschaltern:
npx wrangler dev --local --port 8792 --var HQ_TEST:1 --var BETRIEB_EMAILS:ramon@example.com
bash tests/alle.sh
```

`HQ_TEST=1` schaltet `/api/auth/probe` frei, eine Anmeldung wie nach Google, aber mit ausgedachter Person — nur
auf 127.0.0.1 und nur mit diesem Schalter, live gibt es sie nicht. `BETRIEB_EMAILS` lässt das Testkonto
`ramon@example.com` ins Betriebs-Dashboard. Für alle übrigen Tests ist der Pilot aus (`seed.sql`).

`alle.sh` spielt alles in der Reihenfolge durch, in der es sich verträgt, und
gibt je Suite die letzten Zeilen aus. Jede muss auf **ALLES GRÜN** enden.

Playwright liegt bewusst nicht im Projekt — es wiegt mehr als die ganze App.
`alle.sh` sucht es an den üblichen Stellen; mit `HQ_PLAYWRIGHT=/pfad/node_modules`
lässt sich der Ort auch vorgeben. Screenshots landen in `HQ_BILDER` (sonst
`/tmp`).

## Die Reihenfolge ist keine Laune

Alle Suiten teilen sich eine Datenbank:

1. `seed.sql` + `sitzungen.sh` legen den **Zweier-Haushalt** an — den braucht
   `test.sh` für die sieben Arten von Vorschlägen.
2. `haushalt.sh` baut daraus die **Dreier-WG**. Alles Weitere setzt sie voraus.
3. `ui3.mjs` prüft die **Ersteinrichtung** und braucht dafür frische Konten,
   die `reset-def.sh` herstellt — deshalb steht es am Ende.

Wer eine Suite einzeln laufen lässt, sollte vorher `reset-def.sh` und
`haushalt.sh` aufrufen. Jede Suite räumt hinter sich auf, was sie umgestellt
hat; ein laufender Haushaltsurlaub etwa hielte sonst den Plan der nächsten an —
genau so, wie er es soll.

## Was drin steckt

| Suite | Prüft |
| --- | --- |
| `test.sh` | Alle Arten von Vorschlägen: anlegen, ändern, löschen, Aktionen — und dass eine hängengebliebene Abstimmung sich selbst heilt |
| `haushalt.sh` | Einrichtung, Beitritt, Räume, Bilder, Rollen, Übertragungen |
| `plan-api.sh` | Haushaltsplan: Rhythmus, Sperre, Bewerbung, Rangliste, Mahnung, Gruppenstrafe |
| `rueck-api.sh` | Rückfragen, Empfangsbestätigung, Strafe bei Nichtlieferung, Nachholen |
| `storno-api.sh` | Eine offene Anfrage nachbessern oder zurückziehen |
| `urlaub-api.sh` | Urlaub für eine Person und für den Haushalt |
| `gutschrift-api.sh` | Cleanies einer Belohnung dem Empfänger gutschreiben |
| `ruecktritt-api.sh` | Von einer zugeteilten Aufgabe zurücktreten — Mehrheit statt Einstimmigkeit |
| `event-api.sh` | Events: anlegen, freigeben, einlösen, Deckel, Dauerevent, beenden |
| `bilder-api.sh` | Symbole, Farben und Hintergründe: ohne Abstimmung, nur Emoji oder kleine Bilder, Auslieferung nur im eigenen Haushalt |
| `familie-api.sh` | Familienmodus: Kinder ohne Google, Kinder bestätigen nie Kinder, Code fürs eigene Gerät, Taschengeld, Kurs-Abstimmung, Eltern-PIN, allein mit Kleinen zählt es sofort |
| `fair-api.sh` | Fair-Bericht: Waage, Zeiträume und Blättern, Räume, was man nicht sieht, Übernommen, Soll per Abstimmung, Kinder neben der Waage, ohne Plus und der Test, WG zu dritt |
| `konto-api.sh` | Konto löschen und Haushalt verlassen: nur mit „löschen“ und POST, was weg ist und was ohne Namen bleibt, Platzhalter „Ehemaliges Mitglied“, Verwaltung geht weiter, letzte Erwachsene nimmt den Haushalt mit, Jugendliche behalten ihr Konto, allein |
| `ui.mjs` | Dunkles Design, Einstellungen |
| `ui3.mjs` | Ersteinrichtung von der Begrüßung bis zum Einladecode |
| `ui-scroll.mjs` | Der Schirm springt nicht nach oben, wenn im Hintergrund geladen wird |
| `ui-plan.mjs` | Der Haushaltsplan auf dem Schirm |
| `ui-questplan.mjs` | Eine Aufgabe aus dem Plan bleibt eine Quest — melden, gesperrt, fremde Runde |
| `ui-rueck.mjs` | Rückfragen und Belohnungen auf dem Schirm |
| `ui-wieder.mjs` | Eine Quest zur wiederkehrenden Aufgabe machen |
| `ui-offen.mjs` | „Wartet auf …“ — die Zeile auf der Startseite und ihr Blatt |
| `ui-abst.mjs` | Abstimmungen unter „Für dich“, mit allem, was draufsteht |
| `ui-storno.mjs` | Nachbessern und Zurückziehen auf dem Schirm |
| `ui-urlaub.mjs` | Urlaubsmodus auf dem Schirm |
| `ui-gutschrift.mjs` | Der Haken „Cleanies an Empfänger senden“ |
| `ui-ruecktritt.mjs` | Zurücktreten auf dem Schirm, zu dritt |
| `jubel-api.sh` | Cleanies-Phasen verschieben, eigene GIFs hochladen und löschen |
| `ui-jubel.mjs` | Der Jubel in der App, die Einstellungen der Verwaltung |
| `mockup-anim.mjs` | Das Animations-Mockup: laufen wirklich alle dreißig? |
| `ui-event.mjs` | Events auf dem Schirm, zu dritt — vom Blatt über die Pille bis zum Beenden |
| `ui-start.mjs` | Die Startseite: Stapel per Knopf und Wisch, Später, Jubel, Kacheln, Wochenziel, das Plus — alles auf einem Bildschirm |
| `ui-bilder.mjs` | Der Stift oben, Symbol und Farbe wählen, eigenes Bild hochladen, Hintergründe für Belohnungen — zu zweit |
| `mockup-events.mjs` | Das Event-Mockup: alle Schirme da, nichts läuft über, kein „Punkte“ |
| `mockup-klang.mjs` | Die Hörprobe: klingen alle sechzehn Jubel, und sind sie gleich laut? |
| `mockup-start.mjs` | Der Startseiten-Mockup: jede Variante passt auf einen Bildschirm, abhaken, Stapel, Kacheln |
| `mockup-icons.mjs` | Das Bilder-Mockup: Stift oben, Symbol wählen und hochladen, Hintergründe, die Schrift bleibt vorn |
| `ui-familie.mjs` | Familienmodus im Browser: Kind anlegen, Code und QR, für ein Kind eintragen, Kinderansicht mit PIN, Glas und Weg, eigenes Gerät per Link |
| `ui-fair.mjs` | Fair-Bericht im Browser: hinein über „Diese Woche“, Zeitraum und Blättern, Säule antippen, Soll zur Abstimmung, Export als Tabelle und PDF, Rückblick in Karten und auf der Startseite, Schloss ohne Plus, dunkel und 375 px |
| `ui-startbild.mjs` | Startbild und Name: Homi Point in Titel, Manifest, Anmeldung und Website; das Logo nur beim echten Start, mindestens 1 s, höchstens 2,5 s, nicht nach dem Neuladen, im Dunkeln dunkel |
| `ui-konto.mjs` | Konto löschen und Haushalt verlassen im Browser: Folgen im Blatt, „löschen“ eintippen, Gruß auf der Anmeldung, Verlassen bis zur Einrichtung, letzte Erwachsene mit Kind, Löschseite im Web und der Weg über die Anmeldung |
| `recht.mjs` | Impressum, Datenschutz, Teilnahmebedingungen: erreichbar, Pflichtangaben, Links untereinander und von Startseite, Anmeldung, Einstellungen und Löschseite, 375 px, dunkel |
| `pilot-api.sh` | Pilot über die Schnittstelle: Zugang zum Betrieb, Einladungen anlegen und zurückziehen, das Tor vor der Anmeldung (Unsinn, unbekannt, klein geschrieben, schon angenommen, schon gegründet), ohne Einladung kein Konto, Gründen nur mit Einladung, Haushaltscode als Einladung, Annehmen in der App, Rücksprung nur auf eigene Seiten, Fehlerliste mit Tagesgrenze, Dashboard-Zahlen bis Woche 4, Pilot aus |
| `ui-pilot.mjs` | Pilot im Browser: Anmeldeseite mit Einladungsfeld, Link `?pilot=`, ohne Einladung, Haushaltscode → gleich beitreten, Einladung in der App annehmen, Absturz landet im Dashboard (Absagen nicht), Dashboard auf dem Handy und am Rechner, Einladung anlegen, zurückziehen, Pilot-Schalter |
| `testkauf-api.sh` | Testkauf über die Schnittstelle: 14 Tage Test beim Gründen mit Einladung, Hinweis ab zwei Tagen vor Ende (nicht für Jugendliche), nach dem Test 402 für Kinderansicht, Kinder-Gerät, Kind anlegen, Geräte-Code, Taschengeld, Kurs, Eintragen für Kinder und das vierte Event; „Jetzt nicht“ mit Gründen, Kauf nur durch Erwachsene und nur einmal, die ehrliche Frage, Dashboard-Zahlen, Haushalte von vor dem Pilot, Verlassen ohne Namen |
| `ui-testkauf.mjs` | Testkauf im Browser: die Zeile auf der Startseite, die Plus-Seite mit drei Plänen, „Jetzt nicht“ mit Gründen, Familienmodus pausiert, Kinder-Gerät mit Pause, Jugendliche „Frag die Großen“, Kauf aus dem Fair-Bericht mit Danke und ehrlicher Frage, Einstellungen, Dashboard am Rechner und auf dem Handy, hell und dunkel |
| `mockup-testkauf.mjs` | Mockup Testkauf für Plus: Anlass in beiden Varianten, drei Pläne, Testkauf mit ehrlicher Frage, „Jetzt nicht“, Folgen, Dashboard-Kacheln; 375 px hell und dunkel |
| `ui-android.mjs` | Android im Browser: assetlinks.json für com.homipoint.app, Store-App im Manifest, einfarbiges Zeichen für Benachrichtigungen, das Band „Homi Point als App“ auf Anmeldung und Kinder-Anmeldung, Wegtippen merkt sich die App, Zeile auf der Startseite |
| `mockup-android.mjs` | Mockup Homi Point als Android-App: Play Store oder aus dem Browser, Einladung, Store-Eintrag, Startbildschirm, App ohne Adresszeile, Benachrichtigung, Link öffnet die App, zwei Symbole, Zeitplan, Updates; 375 px hell und dunkel |
| `mockup-pilot.mjs` | Mockup Pilot-Codes und Betriebs-Dashboard: Einladung vor der Anmeldung oder beim Gründen, mit Link, von Hand, schon benutzt, ohne; Dashboard mit Toren, Einladungen, Fehlern, Schalter; 375 px hell und dunkel |
| `ui-stand.mjs` | Kostenlos bleiben im Browser: Alle 25 Sekunden nur die kleine Frage nach dem Änderungszähler, der ganze Zustand nur nach einer Änderung oder nach fünf Minuten, mit offenem Blatt gar nichts |
| `lesen.sh` | Kostenlos bleiben in Zahlen: misst mit der Messhülle (`messen/`) auf einer Kopie der Testdatenbank, wie viele Zeilen ein Abruf liest (Zustand höchstens 1.500, kleine Frage höchstens 10), ob der Zähler springt, ob „N× erledigt“ stimmt, und rechnet den Pilot hoch. Läuft als Letztes |
| `mockup-familie.mjs` | Das Familienmodus-Mockup: Kind meldet, Eltern bestätigen oder tragen ein, Wunsch, Kind anlegen, Taschengeld, PIN, hell und dunkel |
| `mockup-fair.mjs` | Das Fair-Bericht-Mockup: Zeitraum, Soll, Plus und Kind wirken in allen drei Varianten, Tooltip per Tastatur, Tabellen, Geschichte blättert, Schloss ohne Plus, Handy und dunkel |
| `mockup-startbild.mjs` | Das Startbild-Mockup: erster Start zeigt das Logo mindestens 1 s, Zurückholen und Neuladen nicht, ganz schließen setzt zurück, langsames Netz bis 2 s, dunkel, 375 px |
| `mockup-konto.mjs` | Das Mockup „Konto löschen und Haushalt verlassen“: eintippen, gedrückt halten, 14 Tage Bedenkzeit, vier Personen mit ihren Folgen, Sicht der anderen, Löschseite im Web, Handy und dunkel |
| `cleanie-shot.mjs` | Der Cleanies-Stern in hell und dunkel |

## Helfer, die nicht im Gesamtlauf stecken

| Datei | Wofür |
| --- | --- |
| `voller-tag.sh` | Stellt einen vollen, realistischen Tag in der Dreier-WG nach — für Bilder und Messungen. Überschreibt die Testdaten. |
| `start-messen.mjs` | Misst die Startseite an so einem Tag: Höhe in Bildschirmen, Blöcke, rote Elemente. |
| `start-bild.mjs` | Nimmt das Vorher-Bild für `web/mockup-start/` auf. |
| `start-schauen.mjs` | Ein Bild der Startseite für eine Person, hell oder dunkel — zum Hinschauen, ohne Prüfung. |
