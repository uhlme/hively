/**
 * Saisonkalender: Imker-Arbeitsschritte mit Richttermin und Anleitung.
 * Zeitangaben beziehen sich grob auf das Schweizer Mittelland / ähnliche Klimazonen
 * und dienen als Orientierung – je nach Wetter und Trachtlage anpassen.
 */

export const CALENDAR_MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];

/**
 * @typedef {{ id: string, title: string, approxDate: string, guide: string }} CalendarTask
 * @type {Record<string, CalendarTask[]>}
 */
export const CALENDAR_TASKS = {
  '1': [
    {
      id: 'jan-ruhe',
      title: 'Winterruhe der Bienen nicht stören',
      approxDate: 'ganzer Januar',
      guide: `Im Januar sind die Völker in der Wintertraube und verbrauchen Futter, ohne die Beute zu öffnen.

So gehst du vor:
• Beuten nur von aussen beobachten – Deckel und Rähmchen bleiben zu.
• Keine unnötigen Vibrationen (Rasenmäher, Klopfen, Verschieben).
• Bei Schnee: Flugloch und Beutenboden freischaufeln, damit die Luft zirkuliert.
• Totbienen vor dem Flugloch nur vorsichtig wegfegen, ohne die Beute anzuheben.

Tipp: Ein kurzer Blick auf das Flugloch bei frostfreien Tagen reicht. Wenn du viele frische Totbienen oder Unruhe siehst, notiere das für Februar.`
    },
    {
      id: 'jan-flugloch',
      title: 'Flugloch auf Verstopfung prüfen',
      approxDate: 'ca. 5.–20. Januar · frostfrei',
      guide: `Tote Bienen und Eis können das Flugloch verstopfen – dann erstickt die Traube oder es staut sich Feuchtigkeit.

So gehst du vor:
• An einem frostfreien Tag das Flugloch von aussen prüfen.
• Mit einem dünnen Stock oder Draht vorsichtig freimachen (nicht tief in die Beute stossen).
• Mäusegitter auf Sitz prüfen – es muss fest sitzen, aber Luft durchlassen.
• Bei starker Feuchtigkeit am Flugloch: Standort und Deckel/Isolation prüfen.

Achtung: Beute nicht öffnen. Nur von aussen arbeiten.`
    },
    {
      id: 'jan-material',
      title: 'Material für die neue Saison reparieren/bestellen',
      approxDate: 'Mitte bis Ende Januar',
      guide: `Jetzt ist die beste Zeit für Werkstattarbeit, bevor die Saison startet.

Checkliste:
• Rähmchen richten, Draht spannen, Mittelwände einlöten.
• Beuten, Böden und Deckel auf Risse und undichte Stellen prüfen.
• Absperrgitter, Fütterer und Varroa-Mittelbestand inventarisieren.
• Fehlendes Material bestellen (Mittelwände, Zucker, Behandlungsmittel, Gläser).

Tipp: Notiere dir, welche Völker im Vorjahr schwärmten oder schwach waren – dafür Ablegerkästen und Reservevölker einplanen.`
    }
  ],

  '2': [
    {
      id: 'feb-reinigung',
      title: 'Reinigungsausflug beobachten',
      approxDate: 'ca. 10.–28. Februar · ab ca. 10 °C',
      guide: `An den ersten warmen Tagen fliegen die Bienen aus, um sich zu entleeren. Das ist ein wichtiger Gesundheits-Check.

So beobachtest du:
• Stehe seitlich am Stand und zähle grob den Flugverkehr.
• Starke Völker fliegen lebhaft; schwache nur vereinzelt.
• Achte auf Krabbler vor dem Flugloch (Verdacht auf Krankheit/Varroa).
• Kotspuren an der Beutenfront notieren – bei massiven Spuren später genauer kontrollieren.

Nicht öffnen: Auch bei Flugbetrieb die Beute geschlossen lassen, solange es unter ca. 12–14 °C ist.`
    },
    {
      id: 'feb-futter',
      title: 'Futterkontrolle durch Anheben der Beute',
      approxDate: 'Mitte Februar · windstill',
      guide: `Viele Völker verhungern im Spätwinter. Ohne Öffnen kannst du das Gewicht abschätzen.

So gehst du vor:
• Beute hinten leicht anheben (Hebelwirkung) und mit anderen Völkern vergleichen.
• Sehr leichte Völker markieren – Notfütterung vorbereiten (Futterteig von oben).
• Nur bei milder Witterung und möglichst kurz öffnen, falls Teig nötig ist.
• Futterteig direkt über die Traube (Folie/Abdeckung mit Loch), Deckel rasch wieder drauf.

Richtwert: Eine Zander-Zarge sollte sich «kräftig» anfühlen. Im Zweifel lieber stützen als riskieren.`
    },
    {
      id: 'feb-totbienen',
      title: 'Tote Bienen am Flugloch entfernen',
      approxDate: 'ganzer Februar · bei Bedarf',
      guide: `Ein paar Totbienen sind normal. Ein Haufen blockiert aber den Ausgang.

So gehst du vor:
• Mit Handfeger oder Stock tote Bienen und Abfall vor dem Flugloch entfernen.
• Menge grob schätzen: handvoll = normal; grosse Haufen = Volk genauer beobachten.
• Auf weisse Verpilzung oder üblen Geruch achten (Faulbrut-Verdacht → Fachberatung).
• Fluglochweite wintertauglich belassen (eng, aber offen).

Dokumentiere auffällige Völker in Hively, damit du sie bei der ersten Durchsicht priorisierst.`
    }
  ],

  '3': [
    {
      id: 'mar-durchsicht',
      title: 'Erste Frühjahrsdurchsicht',
      approxDate: 'ca. 15.–31. März · bei >15 °C',
      guide: `Ziel: Königin/Brut bestätigen, Futter und Platz prüfen – kurz und warm.

Voraussetzungen:
• Tagestemperatur über ca. 15 °C, wenig Wind, Bienen fliegen.
• Rauchbereit, frische Waben/Mittelwände griffbereit.

Ablauf:
1. Deckel öffnen, kurz rauchen, oberste Folie/Abdeckung abheben.
2. Prüfen: Ist Brut vorhanden (Eier/offene/verdeckelte Brut)?
3. Futtervorrat schätzen (mind. einige volle Futterwaben).
4. Weiselrichtigkeit: Brutnest geschlossen und harmonisch?
5. Kranke/schimmelige Waben ausscheiden, Beute wieder schliessen.

Dauer: Pro Volk idealerweise unter 10 Minuten. Bei Kälte sofort abbrechen.`
    },
    {
      id: 'mar-maeuse',
      title: 'Mäusegitter entfernen',
      approxDate: 'Ende März · nach letztem Frost',
      guide: `Sobald keine Nachtfröste mehr drohen und der Pollenflug läuft, kommt das Mäusegitter weg.

So gehst du vor:
• Gitter abnehmen und lagern (beschriften/reinigen).
• Flugloch auf die frühjahrsgerechte Weite einstellen.
• Boden kurz auf Nagerkot oder Nester kontrollieren.
• Bei Verdacht auf Mäusebefall: Beute gründlicher prüfen und Volk umweiseln/stärken falls nötig.

Zu früh entfernen riskiert Kälteeinbrüche mit Mäusen – lieber eine Woche warten als zu eilig sein.`
    },
    {
      id: 'mar-boden',
      title: 'Boden reinigen',
      approxDate: 'Ende März · bei der ersten Durchsicht',
      guide: `Wintergemüll und Totbienen belasten Hygiene und Luftfeuchtigkeit.

So gehst du vor:
• Bei offenen Böden: Windel/Einschub ziehen und reinigen.
• Gemüllmenge und Milben (Varroa) grob beurteilen.
• Bei festem Boden: nur wenn nötig und warm – Boden tauschen oder auskehren.
• Alles trocken und sauber wieder einsetzen.

Tipp: Hoher Milbenfall jetzt schon → Varroa-Strategie fürs Frühjahr anpassen (Drohnenrahmen, Ableger).`
    }
  ],

  '4': [
    {
      id: 'apr-honigraum',
      title: 'Kirschblüte: Honigraum aufsetzen',
      approxDate: 'ca. 10.–25. April · Kirsch-/Löwenzahnblüte',
      guide: `Wenn das Brutnest eng wird und Tracht einsetzt, brauchen die Bienen Platz oben – sonst droht Schwarmstimmung.

So erkennst du den Zeitpunkt:
• Flugbetrieb stark, Pollen kommt reichlich rein.
• Brutnest nimmt den Grossteil der Brutraumwaben ein.
• An den Randwaben bereits Nektar/Honig.

Vorgehen:
1. Absperrgitter auf den Brutraum legen (falls genutzt).
2. Honigraum mit ausgebauten Waben oder Mittelwänden aufsetzen.
3. Bei starken Völkern frühzeitig zweiten Raum vorbereiten.
4. Nach 3–5 Tagen kontrollieren, ob der Honigraum angenommen wird.

Zu spätes Aufsetzen ist ein klassischer Schwarm-Auslöser.`
    },
    {
      id: 'apr-drohnen',
      title: 'Drohnenrahmen einhängen (Varroa-Prophylaxe)',
      approxDate: 'Mitte April · Beginn Drohnenbrut',
      guide: `Varroa bevorzugt Drohnenbrut. Ein Drohnenrahmen wirkt als biologische Falle.

So gehst du vor:
1. Einen leeren/ausgeschnittenen Drohnenrahmen an den Brutnestrand hängen.
2. Nach Verdeckelung (ca. 7–12 Tage je nach Lage) den Rahmen entnehmen.
3. Verdeckelte Drohnenbrut ausschneiden oder einfrieren und entsorgen.
4. Rahmen erneut einhängen – Zyklus die Saison über wiederholen.

Wichtig: Nicht vergessen auszuschneiden, sonst vermehrt ihr die Milben.`
    },
    {
      id: 'apr-schwarm',
      title: 'Schwarmkontrolle beginnen',
      approxDate: 'Ende April · alle 7–9 Tage',
      guide: `Ab warmer Witterung und guter Tracht starten die Völker in die Schwarmphase.

Kontrollpunkte:
• Spielnäpfchen und Weiselzellen an den Wabenunterkanten.
• Enge im Brutraum, viele Drohnen, «Bärte» vor dem Flugloch.
• Honigraum voll, aber Brutraum verhonigt.

Massnahmen bei Schwarmstimmung:
• Platz geben (Honigraum/Waben).
• Ableger oder Zwischenableger bilden.
• Verdeckelte Weiselzellen gezielt brechen (nur wenn Strategie klar ist).

Intervall: Alle 7–9 Tage – exakt an den Entwicklungszyklus der Königinnenzelle gekoppelt.`
    }
  ],

  '5': [
    {
      id: 'mai-schwarm',
      title: 'Wöchentliche Schwarmkontrolle',
      approxDate: 'ganzer Mai · alle 7–9 Tage',
      guide: `Mai ist Hochsaison für Schwärme. Disziplin bei den Intervallen zählt mehr als Perfektion bei jeder Wabe.

Routine:
1. Datum der letzten Kontrolle notieren (z. B. in Hively).
2. Brutraum kurz auf Weiselzellen prüfen (besonders Rahmenkanten).
3. Platz und Trachtsituation checken.
4. Bei Zellen: Ableger bilden oder Zellen nach Betriebsweise behandeln.
5. Nächstes Kontrolldatum sofort einplanen.

Bei sehr starken Völkern lieber einen Tag früher als einen zu spät.`
    },
    {
      id: 'mai-ableger',
      title: 'Erste Ableger bilden',
      approxDate: 'Mitte Mai · stabile Tracht & warm',
      guide: `Ableger entlasten das Wirtschaftsvolk und sichern Reserve/Königinnen.

Klassischer Brut-Ableger (kurz):
1. 2–3 Brutwaben mit Bienen (ohne alte Königin) entnehmen.
2. 1–2 Futter-/Pollenwaben dazu, in Ablegerkasten setzen.
3. Flugbienen abfliegen lassen bzw. Standplatz beachten.
4. Nach 1 Tag Zuchtzelle zusetzen oder selbst nachziehen lassen.
5. Eng halten, füttern falls nötig, vor Räuberei schützen.

Voraussetzung: Spendervolk muss stark genug bleiben.`
    },
    {
      id: 'mai-honigraum',
      title: 'Honigräume kontrollieren und erweitern',
      approxDate: 'Mai · je nach Tracht alle paar Tage',
      guide: `In der Haupttracht kann ein Honigraum in wenigen Tagen voll sein.

So gehst du vor:
• Gewicht und Verdeckelung prüfen.
• Fast volle Räume nach oben setzen, leeren Raum darunter («Magazinieren»).
• Mittelwände nur geben, wenn die Tracht trägt – sonst werden sie verbaut/zerknabbert.
• Bei Trachtstopp keinen leeren Raum zu viel halten (Auskühlung).

Ziel: Immer genug Platz, aber kein unnötiges Volumen.`
    }
  ],

  '6': [
    {
      id: 'jun-schwarm-ende',
      title: 'Letzte Schwarmkontrollen durchführen',
      approxDate: 'Anfang bis Mitte Juni',
      guide: `Die Schwarmneigung lässt je nach Lage im Juni nach – aber nicht abrupt.

So gehst du vor:
• Intervalle beibehalten, bis kaum noch Näpfchen angesetzt werden.
• Besonders Jungvölker und enge Kästen weiter beobachten.
• Nach der Sonnenwende oft Entspannung – trotzdem einmal zu viel kontrollieren schadet weniger als ein Schwarm.

Danach Fokus auf Ernte und Volksgesundheit legen.`
    },
    {
      id: 'jun-ernte',
      title: 'Erste Honigernte (Frühtracht) schleudern',
      approxDate: 'ca. 10.–30. Juni · je nach Blüte',
      guide: `Ernte erst, wenn der Honig reif ist (verdeckelt bzw. spritzt nicht aus der Wabe).

Ablauf:
1. Reife prüfen (Spritzprobe / Verdeckelung).
2. Honigraum abkehren oder Bienenflucht nutzen.
3. Waben transportieren, schleudern, sieben, klären lassen.
4. Leere Waben zurückgeben oder lagern (Wachs-/Mottenchutz).
5. Ertrag in Hively pro Volk verbuchen.

Lebensmittelhygiene beachten: saubere Eimer, Siebe, Gläser. Wassergehalt bei Unsicherheit messen.`
    },
    {
      id: 'jun-trachtluecke',
      title: 'Trachtlücke beachten',
      approxDate: 'Ende Juni · nach Frühtracht',
      guide: `Zwischen Früh- und Sommertracht kann das Nektarangebot einbrechen.

Was du tun solltest:
• Völker auf Futter kontrollieren (besonders Ableger).
• Bei Bedarf leicht und vorsichtig füttern – Räuberei vermeiden (abends, Flugloch eng).
• Keine grossen offenen Futterquellen am Stand.
• Schwache Völker nicht unnötig öffnen.

Eine kurze Lücke ist normal; längere Trockenheit braucht aktives Gegensteuern.`
    }
  ],

  '7': [
    {
      id: 'jul-sommerernte',
      title: 'Sommertracht schleudern',
      approxDate: 'ca. 10.–25. Juli',
      guide: `Oft die Haupternte. Danach beginnt die kritische Phase für Varroa und Wintervorbereitung.

Ablauf wie bei der Frühtracht:
• Nur reifen Honig ernten.
• Völker nicht komplett «ausräumen» – Reserven im Brutraum belassen.
• Ernte dokumentieren (Menge, Sorte).
• Direkt den Behandlungsplan für Varroa terminieren.

Nach der letzten Ernte keine Honigräume mehr über längere Zeit mit offenen Futterwaben stehen lassen (Räuberei).`
    },
    {
      id: 'jul-varroa',
      title: '1. Varroa-Behandlung nach der Ernte',
      approxDate: 'Ende Juli · direkt nach letzter Ernte',
      guide: `Ohne rechtzeitige Behandlung brechen Völker im Herbst/Winter oft ein.

Grundregeln:
• Nur nach der letzten Honigernte behandeln (Wartezeiten/Mittel beachten).
• Zugelassenes Mittel wählen (z. B. Ameisensäure-Systeme) und Packungsanweisung exakt befolgen.
• Temperaturfenster des Mittels einhalten.
• Windel/Gemüll zur Erfolgskontrolle nutzen.
• Schutzausrüstung tragen, Nachbarn/Standplatz beachten.

Dokumentiere Datum, Mittel und Völker – das gehört zum Behandlungstagebuch.`
    },
    {
      id: 'jul-fuetterung',
      title: 'Erste Auffütterung starten',
      approxDate: 'Ende Juli · nach Behandlung/Ernte',
      guide: `Winterbienen brauchen rechtzeitig Futter und Platz zum Verdeckeln.

So gehst du vor:
1. Futtervorrat schätzen (Gewicht / Blick auf Randwaben).
2. Mit Zuckerwasser oder Fertigfutter in mehreren Gaben füttern.
3. Flugloch eng halten, abends füttern gegen Räuberei.
4. Nicht alles auf einmal kippen – besser portionieren.
5. Fortschritt nach 3–5 Tagen kontrollieren.

Richtwert (grob): Je nach Beutenmass oft 15–20 kg Winterfutter – an Betriebsweise anpassen.`
    }
  ],

  '8': [
    {
      id: 'aug-fuetterung',
      title: 'Auffütterung abschliessen',
      approxDate: 'Mitte August',
      guide: `Bis Mitte/Ende August sollte der Grossteil des Winterfutters eingetragen und verdeckelt sein.

Kontrollen:
• Beute anheben: deutliches Gewicht.
• Noch flüssiges Futter? Dann Zeit zum Verdeckeln lassen.
• Überfüllte Bruträume entlasten bzw. Futterwaben sinnvoll anordnen.
• Ableger und Wirtschaftsvölker getrennt beurteilen.

Zu spätes Auffüttern stresst das Volk und kann die Wintertraube stören.`
    },
    {
      id: 'aug-milben',
      title: 'Erfolgskontrolle der Varroa-Behandlung',
      approxDate: 'ca. 10.–25. August',
      guide: `Nach der Sommerbehandlung den Milbenfall auswerten.

So gehst du vor:
• Windel 48–72 h einschieben und Milben zählen (bei deinem System üblich).
• Hoher Restbefall → Nachbehandlung planen (Mittelwechsel/Strategie).
• Schwache oder stark befallene Völker markieren.
• Drohnenrahmen-Zyklen beenden, wenn nicht mehr nötig.

Ohne Kontrolle weisst du nicht, ob die Behandlung gewirkt hat.`
    },
    {
      id: 'aug-raeuberei',
      title: 'Räuberei vermeiden (Fluglöcher einengen)',
      approxDate: 'ganzer August',
      guide: `Ab Trachtende steigt die Räubereigefahr massiv.

Massnahmen:
• Fluglöcher auf wenige cm einengen.
• Keine offenen Honig-/Futterreste am Stand.
• Schwache Völker besonders schützen oder vereinigen.
• Durchsichten kurz halten, Beuten dicht schliessen.
• Bei Räuberei: Flugloch stark verengen, Volk evtl. versetzen, Ruhe.

Ein enggestelltes Flugloch ist jetzt Standard – nicht erst bei Chaos.`
    }
  ],

  '9': [
    {
      id: 'sep-varroa2',
      title: '2. Varroa-Behandlung (falls nötig)',
      approxDate: 'Anfang bis Mitte September',
      guide: `Wenn die Erfolgskontrolle zu hohe Werte zeigt oder das Volk auffällig ist, greift die zweite Behandlung.

So gehst du vor:
• Befall und Volksstärke bewerten.
• Passendes Mittel/Konzept wählen (nicht einfach «dasselbe nochmal» ohne Plan).
• Temperatur und Brutstatus beachten.
• Wieder dokumentieren und nachkontrollieren.

Ziel: Winterbienen sollen möglichst milbenarm schlüpfen.`
    },
    {
      id: 'sep-staerke',
      title: 'Volksstärke kontrollieren (winterfeste Bienen)',
      approxDate: 'Mitte September',
      guide: `Jetzt entscheidet sich, welche Völker sicher überwintern.

Prüfpunkte:
• Sitz der Bienen: mehrere Wabengassen dicht besetzt?
• Junge Bienen / Brut vorhanden?
• Ausreichend Futter und gesunder Eindruck?
• Königin leistungsfähig (Brutbild)?

Zu schwache Völker nicht «mit Hoffnung» allein lassen – siehe Vereinigung.`
    },
    {
      id: 'sep-vereinigen',
      title: 'Schwache Völker vereinigen',
      approxDate: 'Ende September',
      guide: `Lieber ein starkes Wintervolk als zwei schwache Verluste.

Typisches Vorgehen (Zeitungsmethode o. Ä.):
1. Schwaches Volk entweiseln (falls nötig/gewollt).
2. Auf starkes Volk setzen, getrennt durch Zeitungspapier mit Schlitzen.
3. Flugloch eng, einige Tage Ruhe.
4. Nach dem Durchfressen der Zeitung Waben ordnen und Futter prüfen.

Zeitpunkt: Früh genug, damit sich das Volk noch zusammenfindet.`
    }
  ],

  '10': [
    {
      id: 'okt-fuetterung-ende',
      title: 'Auffütterung muss beendet sein',
      approxDate: 'Anfang Oktober',
      guide: `Spätes Füttern stört die Winterruhe und wird schlechter verarbeitet.

Kontrolle:
• Gewicht nochmals prüfen.
• Flüssiges Futter sollte weitgehend verdeckelt sein.
• Notfalls nur noch kleine Korrekturen mit Futterteig.
• Keine grossen offenen Futtergaben mehr bei kalter Witterung.

Ab jetzt: Stabilität vor Optimierung.`
    },
    {
      id: 'okt-maeuse',
      title: 'Mäusegitter anbringen',
      approxDate: 'Mitte Oktober · vor ersten Frösten',
      guide: `Mäuse suchen ab kühleren Nächten Unterschlupf in Beuten.

So gehst du vor:
• Passendes Gitter fest am Flugloch montieren.
• Sicherstellen, dass Bienen trotzdem aus-/einfliegen können.
• Bodeneinschub und Umgebung auf Nagerhinweise prüfen.
• Gitterliste führen: Welches Volk ist geschützt?

Ein vergessenes Volk ohne Gitter kann im Winter schwer geschädigt werden.`
    },
    {
      id: 'okt-ruhe',
      title: 'Winterruhe einleiten',
      approxDate: 'Ende Oktober',
      guide: `Der Stand wird ruhig – das ist gewollt.

Massnahmen:
• Durchsichten einstellen.
• Beuten wind- und wettersicher ausrichten, Deckel beschweren.
• Spechte/Störungen am Standort bedenken.
• Letzte Notizen in Hively machen (Völkerstatus, Futter, Behandlung).

Ab jetzt gilt: Beobachten statt Manipulieren.`
    }
  ],

  '11': [
    {
      id: 'nov-windel',
      title: 'Letzte Varroa-Kontrolle (Windel)',
      approxDate: 'Anfang bis Mitte November',
      guide: `Ein kurzer Gemüll-Check zeigt, ob die Winterbehandlung nötig wird.

So gehst du vor:
• Windel für 2–3 Tage einschieben (bei geeignetem Boden).
• Milben fallen zählen und interpretieren.
• Starke Abweichungen zwischen Völkern notieren.
• Termin für Oxalsäure (brutfrei) grob planen.

Nicht jedes System hat eine Windel – dann alternative Diagnose nach deiner Betriebsweise nutzen.`
    },
    {
      id: 'nov-wachs',
      title: 'Werkstatt: Rähmchen einschmelzen',
      approxDate: 'November · Werkstattwetter',
      guide: `Alte und aussortierte Waben jetzt verarbeiten, nicht bis zum Frühjahr liegen lassen (Wachsmotte).

Ablauf:
• Altwaben ausschmelzen (Dampfwachsschmelzer o. Ä.).
• Wachs klären und lagern.
• Rähmchen reinigen, desinfizieren, neu drahten.
• Ausschuss und Plastikteile fachgerecht entsorgen.

Saubere Rähmchen im Frühjahr sparen Nerven und Zeit.`
    },
    {
      id: 'nov-ausruestung',
      title: 'Ausrüstung reinigen',
      approxDate: 'Mitte bis Ende November',
      guide: `Stockmeissel, Smoker, Anzüge und Kisten gehören vor dem Frühjahr gereinigt.

Checkliste:
• Textilien waschen, Rauchmaterial trocknen lagern.
• Beuten/Ablegerkästen trocknen und stapeln.
• Behandlungsmaterial und Haltbarkeit prüfen.
• Verbrauchsmaterial fürs nächste Jahr notieren.

Ein aufgeräumter Winterlagerplatz verhindert Chaos im März.`
    }
  ],

  '12': [
    {
      id: 'dez-oxal',
      title: 'Winterbehandlung (Oxalsäure) brutfrei',
      approxDate: 'ca. 10.–28. Dezember · brutfrei & kalt',
      guide: `Oxalsäure wirkt am besten, wenn keine Brut vorhanden ist (Milben sitzen auf den Bienen).

Voraussetzungen:
• Volk möglichst brutfrei (typisch nach Frostperiode).
• Tageswahl nach Mittel/Verfahren (Träufeln/Sublimieren) und Wetter.
• Schutzausrüstung zwingend.

Ablauf (träufeln – Prinzip):
1. Mittel nach Anleitung anmischen.
2. Beute kurz öffnen, Gassen träufeln.
3. Sofort wieder schliessen, Volk nicht auskühlen lassen.
4. Datum und Menge dokumentieren.

Packungsbeilage und lokale Vorschriften haben Vorrang vor dieser Kurzfassung.`
    },
    {
      id: 'dez-ruhe',
      title: 'Absolute Ruhe am Bienenstand',
      approxDate: 'ganzer Dezember',
      guide: `Nach der Winterbehandlung heisst es: Hände weg.

Do’s:
• Flugloch freilegen bei Schnee.
• Von aussen auf Specht-/Sturmschäden achten.
• Futter nur in echten Notfällen (sehr leichte Beute) mit Teig stützen.

Don’ts:
• Keine neugierigen Öffnungen «nur zum Schauen».
• Kein Verschieben der Beuten ohne Not.
• Keine lauten Arbeiten direkt am Stand.

Die beste Dezember-Arbeit ist oft: nichts tun und beobachten.`
    }
  ]
};
