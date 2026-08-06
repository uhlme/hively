/**
 * Saisonkalender: Imker-Arbeitsschritte mit Richttermin und Textanleitung
 * für den Schweizerkasten (Heckbedienung).
 *
 * Zeitangaben: grob Schweizer Mittelland – an Wetter/Tracht anpassen.
 */

export const CALENDAR_MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];

/** Numbered text step in a task guide (no images). */
function step(caption) {
  return { caption };
}

/**
 * @typedef {{ caption: string }} GuideStep
 * @typedef {{ id: string, title: string, approxDate: string, guide: string, guideSteps?: GuideStep[] }} CalendarTask
 * @type {Record<string, CalendarTask[]>}
 */
export const CALENDAR_TASKS = {
  '1': [
    {
      id: 'jan-ruhe',
      title: 'Winterruhe der Bienen nicht stören',
      approxDate: 'ganzer Januar',
      guide: `Im Januar bleibt der Schweizerkasten geschlossen. Die Wintertraube sitzt innen – jede Öffnung der Hintertür kostet Wärme und Futter.

So gehst du vor:
• Nur von aussen beobachten (Flugloch, Beutenfront).
• Hintertür, Fenster und Deckel nicht öffnen.
• Keine Vibrationen am Stand (Rasenmäher, Klopfen, Verschieben).
• Bei Schnee: Flugloch und Stand freischaufeln, damit Luft zirkuliert.

Tipp: Kurzer Blick bei frostfreien Tagen reicht. Viele frische Totbienen oder Unruhe → für Februar notieren.`,
      guideSteps: [
        step('Schweizerkasten im Winter: geschlossen lassen, nur von aussen beobachten.'),
        step('Flugloch und Beutenfront von vorne prüfen – ohne die Hintertür zu öffnen.')
      ]
    },
    {
      id: 'jan-flugloch',
      title: 'Flugloch auf Verstopfung prüfen',
      approxDate: 'ca. 5.–20. Januar · frostfrei',
      guide: `Tote Bienen und Eis können das Flugloch verstopfen – dann leidet die Luftzufuhr der Wintertraube.

So gehst du vor (Schweizerkasten):
• An einem frostfreien Tag das Flugloch von vorne prüfen.
• Mit dünnem Stock/Draht vorsichtig freimachen – nicht tief in den Kasten stossen.
• Mäusegitter auf festen Sitz prüfen (Luft muss durchkönnen).
• Hintertür bleibt zu.

Achtung: Nur von aussen arbeiten.`,
      guideSteps: [
        step('Flugloch mit Mäusegitter: auf Verstopfung und festen Sitz prüfen.')
      ]
    },
    {
      id: 'jan-material',
      title: 'Material für die neue Saison reparieren/bestellen',
      approxDate: 'Mitte bis Ende Januar',
      guide: `Werkstattzeit, bevor die Saison startet.

Checkliste für Schweizerkasten-Betriebe:
• Rähmchen richten, Draht spannen, Mittelwände einlöten (Schweizer-/Kuntzschmass beachten).
• Hintertüren, Fenster, Dichtungen und Böden prüfen.
• Absperrgitter, Fütterer, Mäusegitter und Varroa-Mittel inventarisieren.
• Fehlendes Material bestellen.

Tipp: Schwache/schwärmende Völker vom Vorjahr notieren – Ablegerkästen einplanen.`
    }
  ],

  '2': [
    {
      id: 'feb-reinigung',
      title: 'Reinigungsausflug beobachten',
      approxDate: 'ca. 10.–28. Februar · ab ca. 10 °C',
      guide: `An den ersten warmen Tagen fliegen die Bienen aus. Das ist ein Gesundheits-Check – ohne Öffnen.

So beobachtest du:
• Seitlich am Stand stehen, Flugverkehr grob einschätzen.
• Starke Völker fliegen lebhaft; schwache nur vereinzelt.
• Krabbler vor dem Flugloch beachten.
• Kotspuren an der Front notieren.

Schweizerkasten: Hintertür auch bei Flugbetrieb geschlossen lassen, solange es unter ca. 12–14 °C ist.`,
      guideSteps: [
        step('Beobachtung am Flugloch: Verkehr, Krabbler und Kotspuren von aussen beurteilen.')
      ]
    },
    {
      id: 'feb-futter',
      title: 'Futterkontrolle durch Anheben der Beute',
      approxDate: 'Mitte Februar · windstill',
      guide: `Viele Völker verhungern im Spätwinter. Beim Schweizerkasten kannst du das Gewicht von hinten abschätzen – ohne volles Öffnen.

So gehst du vor:
• Kasten hinten leicht anheben (Hebel) und mit Nachbarvölkern vergleichen.
• Sehr leichte Völker markieren.
• Notfütterung nur bei milder Witterung: Hintertür kurz, Futterteig möglichst nah an die Traube, sofort wieder schliessen.
• Flugloch eng halten.

Im Zweifel lieber stützen als riskieren.`,
      guideSteps: [
        step('Gewichtskontrolle: Schweizerkasten hinten leicht anheben und vergleichen.'),
        step('Notfütterung nur kurz über die geöffnete Hinterseite – rasch wieder schliessen.')
      ]
    },
    {
      id: 'feb-totbienen',
      title: 'Tote Bienen am Flugloch entfernen',
      approxDate: 'ganzer Februar · bei Bedarf',
      guide: `Ein paar Totbienen sind normal. Ein Haufen blockiert den Ausgang.

So gehst du vor:
• Mit Handfeger/Stock Totbienen vor dem Flugloch entfernen.
• Menge schätzen: handvoll = normal; grosse Haufen = genauer beobachten.
• Auf Verpilzung oder üblen Geruch achten.
• Mäusegitter und Fluglochweite wintertauglich belassen.

Auffällige Völker in Hively markieren.`,
      guideSteps: [
        step('Flugloch freimachen: Totbienen und Abfall entfernen, Gitter belassen.')
      ]
    }
  ],

  '3': [
    {
      id: 'mar-durchsicht',
      title: 'Erste Frühjahrsdurchsicht',
      approxDate: 'ca. 15.–31. März · bei >15 °C',
      guide: `Beim Schweizerkasten arbeitest du von hinten: Hintertür öffnen, Rahmen nach hinten herausziehen – nicht wie beim Magazin von oben.

Voraussetzungen:
• >15 °C, wenig Wind, Bienen fliegen.
• Raucher, Stockmeissel, Reserve-Waben bereit.

Ablauf Schweizerkasten:
1. Kurz rauchen am Flugloch, dann Hintertür öffnen.
2. Rahmen nacheinander herausziehen: Brut (Eier/offen/verdeckelt)?
3. Futtervorrat an den Randwaben schätzen.
4. Weiselrichtigkeit am Brutbild prüfen.
5. Kranke/schimmelige Waben ausscheiden, Hintertür fest schliessen.

Dauer: ideal unter 10 Minuten. Bei Kälte sofort abbrechen.`,
      guideSteps: [
        step('Waben laufen vorne→hinten: Rahmen an der Hintertür herausziehen (nicht links–rechts).'),
        step('Vor dem Öffnen: Temperatur und Flugbetrieb prüfen.')
      ]
    },
    {
      id: 'mar-maeuse',
      title: 'Mäusegitter entfernen',
      approxDate: 'Ende März · nach letztem Frost',
      guide: `Sobald Nachtfröste vorbei sind und Pollen fliegt, kommt das Mäusegitter weg.

So gehst du vor:
• Gitter am Flugloch abnehmen, reinigen, lagern.
• Flugloch auf frühjahrsgerechte Weite einstellen.
• Boden/Einschub kurz auf Nagerhinweise prüfen.
• Bei Verdacht: bei der Durchsicht von hinten genauer kontrollieren.

Lieber eine Woche warten als zu früh entfernen.`,
      guideSteps: [
        step('Mäusegitter am Flugloch demontieren und Fluglochweite anpassen.')
      ]
    },
    {
      id: 'mar-boden',
      title: 'Boden reinigen',
      approxDate: 'Ende März · bei der ersten Durchsicht',
      guide: `Wintergemüll belasten Hygiene und Feuchtigkeit.

So gehst du vor (Schweizerkasten):
• Falls vorhanden: Windel/Einschub ziehen und reinigen.
• Gemüll und Milben grob beurteilen.
• Bei festem Boden nur bei Wärme kehren oder tauschen.
• Alles trocken wiedereinsetzen, Hintertür schliessen.

Hoher Milbenfall → Drohnenrahmen und Ableger früh einplanen.`,
      guideSteps: [
        step('Bei der Durchsicht von hinten Bodenbereich und Gemüll mitbeurteilen.')
      ]
    }
  ],

  '4': [
    {
      id: 'apr-honigraum',
      title: 'Kirschblüte: Honigraum aufsetzen',
      approxDate: 'ca. 10.–25. April · Kirsch-/Löwenzahnblüte',
      guide: `Wenn das Brutnest eng wird und Tracht einsetzt, brauchen die Bienen Platz – sonst droht Schwarmstimmung.

Schweizerkasten:
• Honigraum je nach Bauart oben aufsetzen oder Honigrahmen im hinteren/oberen Bereich einhängen.
• Absperrgitter nutzen, falls in deiner Betriebsweise üblich.
• Nach 3–5 Tagen kontrollieren, ob der Raum angenommen wird.

Zu spätes Erweitern ist ein klassischer Schwarm-Auslöser.`,
      guideSteps: [
        step('Honigraum am Schweizerkasten erweitern – rechtzeitig bei Trachtbeginn.'),
        step('Kontrolle von hinten: Wird der Honigraum angenommen?')
      ]
    },
    {
      id: 'apr-drohnen',
      title: 'Drohnenrahmen einhängen (Varroa-Prophylaxe)',
      approxDate: 'Mitte April · Beginn Drohnenbrut',
      guide: `Varroa bevorzugt Drohnenbrut. Der Drohnenrahmen ist eine biologische Falle.

Schweizerkasten-Ablauf:
1. Hintertür öffnen, Drohnenrahmen an den Brutnestrand einhängen.
2. Nach Verdeckelung (ca. 7–12 Tage) Rahmen nach hinten herausziehen.
3. Verdeckelte Drohnenbrut ausschneiden oder einfrieren/entsorgen.
4. Rahmen wieder einhängen – Zyklus wiederholen.

Wichtig: Ausschneiden nicht vergessen.`,
      guideSteps: [
        step('Drohnenrahmen in Flugrichtung (vorne→hinten) einhängen – siehe Schema.'),
        step('Zum Ausschneiden den Rahmen nach hinten entnehmen (Achse vorne–hinten).')
      ]
    },
    {
      id: 'apr-schwarm',
      title: 'Schwarmkontrolle beginnen',
      approxDate: 'Ende April · alle 7–9 Tage',
      guide: `Beim Schweizerkasten ziehst du die Brutrahmen von hinten und prüfst besonders die Unterkanten auf Spielnäpfchen und Weiselzellen.

Kontrollpunkte:
• Weiselzellen an Rahmenunterkanten.
• Enge im Brutraum, viele Drohnen, Bärte am Flugloch.
• Honigraum voll / Brutraum verhonigt.

Massnahmen: Platz geben, Ableger bilden, Zellen nach Betriebsweise behandeln.
Intervall: alle 7–9 Tage.`,
      guideSteps: [
        step('Schwarmkontrolle: Rahmen von hinten ziehen und Wabenunterkanten prüfen.')
      ]
    }
  ],

  '5': [
    {
      id: 'mai-schwarm',
      title: 'Wöchentliche Schwarmkontrolle',
      approxDate: 'ganzer Mai · alle 7–9 Tage',
      guide: `Mai ist Hochsaison. Disziplin bei den Intervallen zählt.

Routine Schweizerkasten:
1. Letztes Kontrolldatum notieren (z. B. in Hively).
2. Hintertür öffnen, Brutrahmen auf Weiselzellen prüfen.
3. Platz und Tracht checken.
4. Bei Zellen: Ableger oder geplante Massnahme.
5. Nächstes Datum sofort einplanen.`,
      guideSteps: [
        step('Wöchentlich: Hintertür öffnen, Rahmen ziehen, Weiselzellen suchen.')
      ]
    },
    {
      id: 'mai-ableger',
      title: 'Erste Ableger bilden',
      approxDate: 'Mitte Mai · stabile Tracht & warm',
      guide: `Ableger entlasten das Wirtschaftsvolk.

Aus dem Schweizerkasten:
1. 2–3 Brutwaben mit Bienen (ohne alte Königin) nach hinten entnehmen.
2. 1–2 Futter-/Pollenwaben dazu in den Ablegerkasten.
3. Flugbienen/Standort beachten.
4. Nachziehen lassen oder Zuchtzelle zusetzen.
5. Eng halten, bei Bedarf füttern, vor Räuberei schützen.

Spendervolk muss stark genug bleiben.`,
      guideSteps: [
        step('Brut- und Futterwaben von hinten entnehmen und in den Ableger setzen.'),
        step('Jungvölker bei Bedarf eng und mit Futter schützen.')
      ]
    },
    {
      id: 'mai-honigraum',
      title: 'Honigräume kontrollieren und erweitern',
      approxDate: 'Mai · je nach Tracht alle paar Tage',
      guide: `In der Haupttracht füllt sich der Honigraum schnell.

Schweizerkasten:
• Von hinten Verdeckelung und Füllung prüfen.
• Rechtzeitig erweitern / weitere Honigrahmen geben.
• Mittelwände nur bei tragender Tracht.
• Bei Trachtstopp kein unnötiges Leervolumen.

Ziel: genug Platz, ohne auszukühlen.`,
      guideSteps: [
        step('Honigraum bei voller Tracht rechtzeitig erweitern.'),
        step('Füllung und Verdeckelung an den Honigrahmen prüfen.')
      ]
    }
  ],

  '6': [
    {
      id: 'jun-schwarm-ende',
      title: 'Letzte Schwarmkontrollen durchführen',
      approxDate: 'Anfang bis Mitte Juni',
      guide: `Die Schwarmneigung lässt oft nach – aber nicht abrupt.

So gehst du vor:
• Intervalle beibehalten, bis kaum noch Näpfchen angesetzt werden.
• Jungvölker und enge Kästen weiter von hinten kontrollieren.
• Danach Fokus auf Ernte und Gesundheit legen.`,
      guideSteps: [
        step('Letzte Schwarmkontrollen weiterhin über die Hintertür.')
      ]
    },
    {
      id: 'jun-ernte',
      title: 'Erste Honigernte (Frühtracht) schleudern',
      approxDate: 'ca. 10.–30. Juni · je nach Blüte',
      guide: `Ernte erst bei reifem Honig (verdeckelt / Spritzprobe).

Schweizerkasten-Ablauf:
1. Reife prüfen.
2. Honigrahmen von hinten entnehmen (abkehren oder Bienenflucht).
3. Schleudern, sieben, klären.
4. Leere Waben zurück oder lagern (Mottenchutz).
5. Ertrag in Hively verbuchen.

Lebensmittelhygiene beachten.`,
      guideSteps: [
        step('Honigrahmen von hinten entnehmen; lange Rahmenachse zeigt vorne→hinten.'),
        step('Honigraum: auch hier Waben von vorne nach hinten führen.')
      ]
    },
    {
      id: 'jun-trachtluecke',
      title: 'Trachtlücke beachten',
      approxDate: 'Ende Juni · nach Frühtracht',
      guide: `Zwischen Früh- und Sommertracht kann das Angebot einbrechen.

Massnahmen:
• Futter kontrollieren (Gewicht / kurze Sicht von hinten).
• Bei Bedarf abends füttern, Flugloch eng.
• Keine offenen Futterreste am Stand.
• Schwache Völker nicht unnötig öffnen.`,
      guideSteps: [
        step('In der Trachtlücke Gewicht und Futterlage im Blick behalten.'),
        step('Nur dosiert und abends füttern – Räuberei vermeiden.')
      ]
    }
  ],

  '7': [
    {
      id: 'jul-sommerernte',
      title: 'Sommertracht schleudern',
      approxDate: 'ca. 10.–25. Juli',
      guide: `Oft die Haupternte. Danach starten Varroa-Behandlung und Wintervorbereitung.

• Nur reifen Honig ernten (Rahmen von hinten).
• Reserven im Brutraum belassen.
• Ernte dokumentieren.
• Behandlungsplan sofort terminieren.

Keine offenen Honigreste am Stand stehen lassen.`,
      guideSteps: [
        step('Blick von hinten: Rahmen-Enden sichtbar, Waben gehen in die Tiefe nach vorne.'),
        step('Nach der Ernte: Brutraum prüfen – weiterhin Wabenrichtung vorne→hinten.')
      ]
    },
    {
      id: 'jul-varroa',
      title: '1. Varroa-Behandlung nach der Ernte',
      approxDate: 'Ende Juli · direkt nach letzter Ernte',
      guide: `Ohne rechtzeitige Behandlung brechen Völker oft im Winter ein.

Schweizerkasten:
• Nur nach letzter Honigernte behandeln.
• Mittel nach Packung – z. B. Verdunster von hinten einsetzen.
• Temperaturfenster beachten.
• Windel/Gemüll zur Erfolgskontrolle.
• Schutzausrüstung tragen.

Datum, Mittel und Völker dokumentieren.`,
      guideSteps: [
        step('Behandlungsmittel von hinten in den Schweizerkasten einsetzen (nach Packungsangabe).'),
        step('Platzierung und Volksruhe nach dem Einsetzen kontrollieren, dann schliessen.')
      ]
    },
    {
      id: 'jul-fuetterung',
      title: 'Erste Auffütterung starten',
      approxDate: 'Ende Juli · nach Behandlung/Ernte',
      guide: `Winterbienen brauchen rechtzeitig Futter.

Schweizerkasten:
1. Vorrat schätzen (Gewicht / Randwaben von hinten).
2. Fütterer von hinten bedienen – Zuckerwasser/Fertigfutter portionieren.
3. Flugloch eng, abends füttern.
4. Nach 3–5 Tagen Fortschritt prüfen.

Richtwert grob 15–20 kg – an Betriebsweise anpassen.`,
      guideSteps: [
        step('Auffütterung über die Hinterseite: Fütterer einsetzen und portionieren.'),
        step('Fortschritt am Gewicht und an den Randwaben kontrollieren.')
      ]
    }
  ],

  '8': [
    {
      id: 'aug-fuetterung',
      title: 'Auffütterung abschliessen',
      approxDate: 'Mitte August',
      guide: `Bis Mitte/Ende August sollte das Winterfutter weitgehend eingetragen und verdeckelt sein.

• Gewicht prüfen.
• Flüssiges Futter Zeit zum Verdeckeln geben.
• Wabenordnung von hinten korrigieren falls nötig.
• Ableger und Wirtschaftsvölker getrennt beurteilen.`,
      guideSteps: [
        step('Abschlusskontrolle: Kasten muss sich kräftig anfühlen.'),
        step('Nur noch kleine Korrekturen – keine grossen Gaben mehr.')
      ]
    },
    {
      id: 'aug-milben',
      title: 'Erfolgskontrolle der Varroa-Behandlung',
      approxDate: 'ca. 10.–25. August',
      guide: `Nach der Sommerbehandlung den Milbenfall auswerten.

• Windel 48–72 h (falls vorhanden).
• Hoher Restbefall → Nachbehandlung planen.
• Auffällige Völker markieren.
• Drohnenrahmen-Zyklen beenden, wenn nicht mehr nötig.`,
      guideSteps: [
        step('Nach der Behandlung den Erfolg kontrollieren – nicht nur «einmal behandeln und fertig».')
      ]
    },
    {
      id: 'aug-raeuberei',
      title: 'Räuberei vermeiden (Fluglöcher einengen)',
      approxDate: 'ganzer August',
      guide: `Ab Trachtende steigt die Räubereigefahr.

Massnahmen am Schweizerkasten:
• Flugloch auf wenige cm einengen.
• Hintertür immer dicht schliessen.
• Keine offenen Honig-/Futterreste.
• Durchsichten kurz halten.
• Schwache Völker besonders schützen.`,
      guideSteps: [
        step('Flugloch stark einengen – wichtigster Schutz gegen Räuberei.'),
        step('Stand ruhig halten, keine offenen Süssstoffe liegen lassen.')
      ]
    }
  ],

  '9': [
    {
      id: 'sep-varroa2',
      title: '2. Varroa-Behandlung (falls nötig)',
      approxDate: 'Anfang bis Mitte September',
      guide: `Bei zu hohen Restwerten oder auffälligen Völkern nachbehandeln.

• Befall und Volksstärke bewerten.
• Passendes Konzept wählen (nicht planlos dasselbe wiederholen).
• Von hinten einsetzen, Temperatur/Brutstatus beachten.
• Dokumentieren und nachkontrollieren.

Ziel: milbenarme Winterbienen.`,
      guideSteps: [
        step('Zweite Behandlung nur nach Kontrolle und mit klarem Konzept.')
      ]
    },
    {
      id: 'sep-staerke',
      title: 'Volksstärke kontrollieren (winterfeste Bienen)',
      approxDate: 'Mitte September',
      guide: `Kurze Kontrolle von hinten:

• Mehrere Wabengassen dicht besetzt?
• Junge Bienen / noch etwas Brut?
• Genug Futter, gesunder Eindruck?
• Brutbild der Königin in Ordnung?

Zu schwache Völker nicht allein lassen – siehe Vereinigung.`,
      guideSteps: [
        step('Volksstärke von hinten an Sitz und Wabengassen ablesen.')
      ]
    },
    {
      id: 'sep-vereinigen',
      title: 'Schwache Völker vereinigen',
      approxDate: 'Ende September',
      guide: `Lieber ein starkes Wintervolk als zwei Verluste.

Beim Schweizerkasten oft über Waben umhängen oder angepasste Zeitungsmethode:
1. Schwaches Volk entweiseln (falls geplant).
2. Waben/Bienen zum Starkvolk bringen bzw. Kästen kontrolliert vereinigen.
3. Flugloch eng, einige Tage Ruhe.
4. Futter und Sitz danach prüfen.

Früh genug, damit sich das Volk noch findet.`,
      guideSteps: [
        step('Waben von hinten umhängen bzw. Völker kontrolliert zusammenführen.'),
        step('Nach dem Vereinigen Flugloch eng halten.')
      ]
    }
  ],

  '10': [
    {
      id: 'okt-fuetterung-ende',
      title: 'Auffütterung muss beendet sein',
      approxDate: 'Anfang Oktober',
      guide: `Spätes Füttern stört die Winterruhe.

• Gewicht final prüfen.
• Flüssiges Futter sollte weitgehend verdeckelt sein.
• Notfalls nur noch kleiner Futterteig von hinten.
• Keine grossen offenen Gaben bei Kälte.`,
      guideSteps: [
        step('Finale Gewichtskontrolle vor dem Einwintern.')
      ]
    },
    {
      id: 'okt-maeuse',
      title: 'Mäusegitter anbringen',
      approxDate: 'Mitte Oktober · vor ersten Frösten',
      guide: `Mäuse suchen ab kühlen Nächten Unterschlupf.

So gehst du vor:
• Passendes Gitter fest am Flugloch montieren.
• Sicherstellen, dass Bienen noch passieren können.
• Umgebung auf Nagerhinweise prüfen.
• Liste führen: Welches Volk ist geschützt?`,
      guideSteps: [
        step('Mäusegitter vor dem Winter fest am Flugloch montieren.'),
        step('Kasten winterfest: Gitter drauf, Hintertür dicht, Stand ruhig.')
      ]
    },
    {
      id: 'okt-ruhe',
      title: 'Winterruhe einleiten',
      approxDate: 'Ende Oktober',
      guide: `Ab jetzt: Beobachten statt Manipulieren.

• Keine Durchsichten mehr.
• Deckel/Dach beschweren, windgeschützt ausrichten.
• Specht-/Sturmschäden im Blick behalten.
• Letzte Notizen in Hively setzen.`,
      guideSteps: [
        step('Winterruhe: Schweizerkasten geschlossen, Standort gesichert.'),
        step('Nur noch äussere Kontrollen – keine Hintertür mehr öffnen.')
      ]
    }
  ],

  '11': [
    {
      id: 'nov-windel',
      title: 'Letzte Varroa-Kontrolle (Windel)',
      approxDate: 'Anfang bis Mitte November',
      guide: `Kurzer Gemüll-Check zeigt, ob die Winterbehandlung nötig wird.

• Windel 2–3 Tage (falls System vorhanden).
• Milben zählen, Völker vergleichen.
• Termin für Oxalsäure (brutfrei) planen.

Ohne Windel: Diagnose nach deiner Betriebsweise.`,
      guideSteps: [
        step('Befallslage vor der Winterbehandlung nochmals einschätzen.')
      ]
    },
    {
      id: 'nov-wachs',
      title: 'Werkstatt: Rähmchen einschmelzen',
      approxDate: 'November · Werkstattwetter',
      guide: `Altwaben jetzt verarbeiten (Wachsmotte!).

• Ausschmelzen, Wachs klären.
• Rähmchen reinigen, drahten, Mittelwände vorbereiten.
• Ausschuss entsorgen.

Saubere Schweizer-/Kuntzschrähmchen sparen Zeit im März.`
    },
    {
      id: 'nov-ausruestung',
      title: 'Ausrüstung reinigen',
      approxDate: 'Mitte bis Ende November',
      guide: `Checkliste:
• Textilien, Smoker, Anzug reinigen.
• Reserve-Kästen und Hintertüren trocknen lagern.
• Behandlungsmittel-Haltbarkeit prüfen.
• Bestellliste fürs Frühjahr schreiben.`
    }
  ],

  '12': [
    {
      id: 'dez-oxal',
      title: 'Winterbehandlung (Oxalsäure) brutfrei',
      approxDate: 'ca. 10.–28. Dezember · brutfrei & kalt',
      guide: `Oxalsäure wirkt am besten brutfrei.

Schweizerkasten (Träufeln – Prinzip):
1. Mittel nach Anleitung anmischen, Schutzausrüstung anziehen.
2. Hintertür kurz öffnen, Gassen träufeln.
3. Sofort schliessen – nicht auskühlen lassen.
4. Datum/Menge dokumentieren.

Packungsbeilage und Vorschriften haben Vorrang. Sublimieren nur mit geeignetem Gerät/Schutz.`,
      guideSteps: [
        step('Winterbehandlung: Kasten nur kurz von hinten öffnen, rasch wieder schliessen.'),
        step('Danach absolute Ruhe – Beute geschlossen lassen.')
      ]
    },
    {
      id: 'dez-ruhe',
      title: 'Absolute Ruhe am Bienenstand',
      approxDate: 'ganzer Dezember',
      guide: `Do’s:
• Flugloch bei Schnee freilegen.
• Von aussen auf Specht-/Sturmschäden achten.
• Nur in echter Not mit Teig stützen.

Don’ts:
• Keine neugierigen Öffnungen der Hintertür.
• Kein Verschieben ohne Not.
• Keine lauten Arbeiten direkt am Stand.`,
      guideSteps: [
        step('Beste Dezember-Arbeit: nichts tun und von aussen beobachten.'),
        step('Nur Flugloch freilegen – sonst den Kasten in Ruhe lassen.')
      ]
    }
  ]
};
