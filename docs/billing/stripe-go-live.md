# Hively Pro — Stripe Live Go-Live

Stripe Live ist vorbereitet. Dieser Guide schaltet Billing in Netlify + App frei.

## Live-Objekte (Account `uhlme` / `acct_1T5Q4y0S42cslpuh`)

| Objekt | ID / Wert |
|---|---|
| Product | `prod_V3cmVWytlMmmiH` — **Hively Pro** |
| Price monatlich | `price_1U3VXP0S42cslpuh5F6WpV4X` — CHF 1.99 / Monat |
| Price jährlich | `price_1U3VXQ0S42cslpuhykxIJ1uu` — CHF 10 / Jahr |
| Webhook | `we_1U3VXY0S42cslpuhAGeD5dxu` → `https://hivelyy.netlify.app/api/stripe/webhook` |
| Events | `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_failed` |
| API-Version (Webhook) | `2024-12-18.acacia` (wie App-Code) |
| Statement descriptor | `HIVELY PRO` / Account: `HIVELY APP` |
| Trial | 14 Tage — nur beim ersten Checkout (`subscription_data.trial_period_days`) |

Account-Status (geprüft): `charges_enabled=true`, `payouts_enabled=true`, `card_payments=active`, Währung `chf`, Land `CH`.

## Noch manuell (Dashboard / Netlify)

### 1. Live Secret Key holen

[API Keys (Live)](https://dashboard.stripe.com/apikeys) → **Secret key** (`sk_live_…`).

### 2. Webhook Signing Secret

Beim Anlegen des Live-Webhooks wurde ein Signing Secret erzeugt. Wenn du es nicht mehr hast:

1. [Webhooks (Live)](https://dashboard.stripe.com/webhooks) → Endpoint `Hively Pro billing (Netlify)`
2. **Reveal** / **Roll secret** → neuer `whsec_…`

### 3. Customer Portal aktivieren (Live)

Live hat noch **keine** Portal-Konfiguration (Sandbox schon).

1. Öffne [Customer Portal Settings](https://dashboard.stripe.com/settings/billing/portal) (**Live**, nicht Test)
2. Empfohlene Einstellungen (wie Sandbox):
   - Abo kündigen: **ja**, Modus **at period end**
   - Kündigungsgrund erfassen: ja
   - Zahlungsmittel aktualisieren: ja
   - Rechnungsverlauf: ja
   - Kundendaten: Name, E-Mail, Adresse, Telefon
   - Plan wechseln: aus (nur monatlich/jährlich über neuen Checkout nötig)
3. Links setzen:
   - Privacy: `https://hivelyy.netlify.app/privacy/`
   - AGB: `https://hivelyy.netlify.app/agb/`
4. Speichern / aktivieren

Ohne Portal schlägt «Abo verwalten» in der App fehl.

### 4. Netlify Environment Variables (Production)

Site → **Environment variables** (Production + optional Deploy Previews getrennt halten):

| Variable | Wert |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (Live-Endpoint) |
| `STRIPE_PRICE_MONTHLY` | `price_1U3VXP0S42cslpuh5F6WpV4X` |
| `STRIPE_PRICE_YEARLY` | `price_1U3VXQ0S42cslpuhykxIJ1uu` |
| `VITE_BILLING_ENABLED` | `true` |
| `BILLING_ENABLED` | `true` (Alias für Functions) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role (Webhook schreibt `operations`) |
| `APP_ORIGIN` | `https://hivelyy.netlify.app` |
| `VITE_STRIPE_API_ORIGIN` | `https://hivelyy.netlify.app` (Capacitor) |

Danach **Production neu deployen** (`VITE_*` werden zur Build-Zeit eingebettet).

Wichtig: Keine `sk_test_` / Test-Price-IDs in Production. Preview-Deploys ggf. weiter auf Sandbox lassen.

### 5. Supabase

Bereits erledigt:

- Billing-Migrationen angewandt (`billing_stripe_pro` … `api_rate_limits`)
- `app_settings.billing_gates_enabled = true`

Falls Gates je wieder aus: `supabase/migration_billing_gates_go_live.sql` ausführen.

### 6. Smoke-Test (Live, kleine echte Zahlung)

1. Eingeloggt als Betriebs-Owner → Settings → Pro monatl. oder jährl.
2. Checkout mit echter Karte (oder [CH Live-Test](https://docs.stripe.com/testing) nur in Testmode — Live braucht echte Karte)
3. Nach Success: `operations.plan=pro`, `plan_status=trialing`, Stripe-IDs gesetzt
4. Webhook-Log in Stripe: Events `200`
5. «Abo verwalten» → Portal öffnet, Kündigung zum Periodenende möglich
6. Optional: Trial abwarten / im Dashboard abbrechen und Status-Sync prüfen

Tipp für ersten Live-Test: eigenes Betrieb, danach Abo im Portal kündigen (Zugang bleibt bis Periodenende während Trial).

## Rollback

| Schritt | Aktion |
|---|---|
| Soft | `VITE_BILLING_ENABLED` / `BILLING_ENABLED` → `false`, Redeploy |
| DB-Gates | `update public.app_settings set value = 'false' where key = 'billing_gates_enabled';` |
| Stripe | Webhook deaktivieren; Prices `active=false` |

## Checklist

- [x] Live Product + Prices angelegt
- [x] Live Webhook auf `/api/stripe/webhook`
- [x] Account charges/payouts aktiv
- [x] Supabase Billing-Schema + Gates
- [ ] Customer Portal (Live) konfiguriert
- [ ] Netlify Live-Keys + Price-IDs + Flags gesetzt
- [ ] Production Redeploy
- [ ] Smoke-Test Checkout → Webhook → Portal
