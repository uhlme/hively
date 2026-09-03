# Marketing – Schweiz 2026

Materialien für lokale Imker-Vereine, Social Media und App-Store-Screenshots.

## Mini-Landing

- **URL:** https://hivelyy.netlify.app/start/
- **Datei:** `public/start/index.html`
- Speichert UTM-Parameter und leitet zur PWA mit gleichen Parametern weiter.
- PostHog-Events (wenn `VITE_POSTHOG_KEY` gesetzt): `marketing_landing_view`, `marketing_cta_click`, `marketing_attribution`

## UTM-Link-Vorlagen

Ersetze `SOURCE` durch die Quelle (`flyer`, `facebook`, `verein`, `instagram`, …).

| Kanal | Link |
|-------|------|
| Flyer (QR) | `https://hivelyy.netlify.app/start/?utm_source=flyer&utm_medium=print&utm_campaign=ch-2026` |
| Facebook | `https://hivelyy.netlify.app/start/?utm_source=facebook&utm_medium=social&utm_campaign=ch-2026` |
| Verein / Newsletter | `https://hivelyy.netlify.app/start/?utm_source=verein&utm_medium=email&utm_campaign=ch-2026` |
| Direkt zur App | `https://hivelyy.netlify.app/?utm_source=SOURCE&utm_medium=web&utm_campaign=ch-2026` |

Optional: `utm_content` für Anzeigen-Varianten, `utm_term` für Keywords.

## Store-Kampagnen (UTM)

Für Store-getriebene Kampagnen `utm_campaign=ch-2026-store` verwenden und die
Plattform über `utm_content` unterscheiden.

| Kanal | UTM-Beispiel |
| ----- | ------------ |
| App Store Badge (Flyer) | `utm_source=flyer&utm_medium=print&utm_campaign=ch-2026-store&utm_content=ios` |
| Play Store Badge (Flyer) | `utm_source=flyer&utm_medium=print&utm_campaign=ch-2026-store&utm_content=android` |
| Instagram Bio | `utm_source=instagram&utm_medium=social&utm_campaign=ch-2026-store` |

Die Store-Badges auf `/start/` hängen die aktiven UTM-Parameter automatisch an
die Store-Links an und tracken den Klick als `marketing_cta_click`
(`cta: app_store` / `play_store`).

## Store-Marketing / ASO

Vollständiger App-Store- und Play-Store-Plan (ASO, Screenshots, Release-Kadenz,
Fastlane-Befehle, KPIs): [`store-marketing-plan.md`](./store-marketing-plan.md).

## Flyer

- **Vorschau / Druck:** https://hivelyy.netlify.app/marketing/flyer.html
- **Format:** A6 (105 × 148 mm), im Browser «Drucken» → «Als PDF speichern»
- QR zeigt auf `/start/` mit Flyer-UTM

## ASO-Screenshot-Texte

Siehe [`aso-screenshot-texts.md`](./aso-screenshot-texts.md) – Overlay-Headlines für App Store und Play Store.

## PostHog-Auswertung

In PostHog filtern nach:

- Event `marketing_landing_view` → Landing-Besuche (nach Klick aus der App)
- Event `marketing_cta_click` → CTA `open_app` / `install_hint`
- Personen-Eigenschaften / Event-Properties: `utm_source`, `utm_campaign`, …

Test-Traffic (`localhost`, `is_test_traffic`) in Produktions-Dashboards ausblenden.
