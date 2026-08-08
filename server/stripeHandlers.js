/**
 * Shared HTTP helpers for Stripe Netlify functions + Vite middleware.
 */
import Stripe from 'stripe';
import {
  getBillingReturnUrls,
  isBillingEnforced,
  isProEntitlement,
  isTrialEligible,
  mapSubscriptionToBilling,
  pickOperationIdForSubscription,
  publicBillingError,
  resolvePriceId,
  TRIAL_DAYS
} from './billing.js';
import { getServiceSupabase } from './proGate.js';

export { assertUserOperationHasPro, getServiceSupabase } from './proGate.js';

export const STRIPE_JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  // Native App (capacitor://localhost) ruft Checkout/Portal über die absolute
  // Produktions-URL auf — ohne CORS schlägt der Preflight in WebKit mit
  // «Load failed» fehl. Auth bleibt über Bearer-Token Pflicht.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export function stripeJson(status, body) {
  return { status, body };
}

export function stripeLambdaResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...STRIPE_JSON_HEADERS, ...extraHeaders },
    body: body == null || body === '' ? '' : JSON.stringify(body)
  };
}

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers || {})) {
    normalized[String(key).toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return normalized;
}

export function getStripe(env = process.env) {
  const key = env.STRIPE_SECRET_KEY || '';
  if (!key) throw new Error('STRIPE_SECRET_KEY fehlt.');
  return new Stripe(key, { apiVersion: '2024-12-18.acacia' });
}

export async function authenticateBearer(headers = {}, env = process.env) {
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !anonKey) {
    return { error: stripeJson(503, { error: 'Auth ist nicht konfiguriert.' }) };
  }

  const normalized = normalizeHeaders(headers);
  const authHeader = normalized.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: stripeJson(401, { error: 'Login erforderlich.' }) };
  }

  let response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: authHeader
      }
    });
  } catch (err) {
    console.error('[stripe] auth failed', err);
    return { error: stripeJson(502, { error: 'Token-Prüfung fehlgeschlagen.' }) };
  }

  if (!response.ok) {
    return { error: stripeJson(401, { error: 'Ungültiger oder abgelaufener Login.' }) };
  }

  const user = await response.json();
  if (!user?.id) {
    return { error: stripeJson(401, { error: 'Ungültiger oder abgelaufener Login.' }) };
  }
  return { user, accessToken: authHeader.slice(7) };
}

async function assertOperationOwner(supabase, operationId, userId) {
  const { data, error } = await supabase
    .from('operation_members')
    .select('role')
    .eq('operation_id', operationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data?.role !== 'owner') {
    const err = new Error('Nur der Betriebsinhaber kann das Abo verwalten.');
    err.status = 403;
    throw err;
  }
}

async function loadOperation(supabase, operationId) {
  const { data, error } = await supabase
    .from('operations')
    .select(
      'id, name, created_by, plan, plan_status, plan_interval, plan_period_end, stripe_customer_id, stripe_subscription_id'
    )
    .eq('id', operationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error('Betrieb nicht gefunden.');
    err.status = 404;
    throw err;
  }
  return data;
}

async function ensureStripeCustomer(stripe, supabase, operation, user) {
  if (operation.stripe_customer_id) {
    return operation.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email: user.email || undefined,
    name: operation.name || undefined,
    metadata: {
      operation_id: operation.id,
      user_id: user.id
    }
  });

  const { error } = await supabase
    .from('operations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', operation.id);
  if (error) throw error;

  return customer.id;
}

/**
 * Create Stripe Checkout Session for Pro (14-day trial when eligible).
 */
export async function handleCreateCheckout(body, context = {}) {
  const env = context.env || process.env;
  if (!isBillingEnforced(env)) {
    return stripeJson(503, { error: 'Billing ist serverseitig nicht konfiguriert.' });
  }

  const auth = await authenticateBearer(context.headers || {}, env);
  if (auth.error) return auth.error;

  const operationId = String(body?.operationId || '').trim();
  const interval = body?.interval === 'year' ? 'year' : 'month';
  const returnNative = body?.returnTarget === 'native';
  if (!operationId) {
    return stripeJson(400, { error: 'operationId fehlt.' });
  }

  try {
    const supabase = getServiceSupabase(env);
    await assertOperationOwner(supabase, operationId, auth.user.id);
    const operation = await loadOperation(supabase, operationId);
    if (isProEntitlement(operation)) {
      return stripeJson(409, {
        error: 'Dieser Betrieb hat bereits Hively Pro. Bitte das Kundenportal nutzen.',
        code: 'already_pro'
      });
    }
    const stripe = getStripe(env);
    const customerId = await ensureStripeCustomer(stripe, supabase, operation, auth.user);
    const priceId = resolvePriceId(interval, env);
    const returns = getBillingReturnUrls(env, { native: returnNative });

    const subscriptionData = {
      metadata: {
        operation_id: operationId,
        user_id: auth.user.id,
        plan_interval: interval
      }
    };
    if (isTrialEligible(operation)) {
      subscriptionData.trial_period_days = TRIAL_DAYS;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: operationId,
      success_url: returns.success,
      cancel_url: returns.cancel,
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: subscriptionData,
      metadata: {
        operation_id: operationId,
        user_id: auth.user.id,
        plan_interval: interval
      }
    });

    return stripeJson(200, { url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[stripe checkout]', err);
    const status = err.status || 500;
    return stripeJson(status, {
      error: publicBillingError(err, 'Checkout konnte nicht gestartet werden.')
    });
  }
}

/**
 * Stripe Customer Portal for the active Betrieb owner.
 */
export async function handleCreatePortal(body, context = {}) {
  const env = context.env || process.env;
  if (!isBillingEnforced(env)) {
    return stripeJson(503, { error: 'Billing ist serverseitig nicht konfiguriert.' });
  }

  const auth = await authenticateBearer(context.headers || {}, env);
  if (auth.error) return auth.error;

  const operationId = String(body?.operationId || '').trim();
  const returnNative = body?.returnTarget === 'native';
  if (!operationId) {
    return stripeJson(400, { error: 'operationId fehlt.' });
  }

  try {
    const supabase = getServiceSupabase(env);
    await assertOperationOwner(supabase, operationId, auth.user.id);
    const operation = await loadOperation(supabase, operationId);
    if (!operation.stripe_customer_id) {
      return stripeJson(400, { error: 'Kein Stripe-Kunde für diesen Betrieb.' });
    }

    const stripe = getStripe(env);
    const returns = getBillingReturnUrls(env, { native: returnNative });
    const portal = await stripe.billingPortal.sessions.create({
      customer: operation.stripe_customer_id,
      return_url: returns.portalReturn
    });

    return stripeJson(200, { url: portal.url });
  } catch (err) {
    console.error('[stripe portal]', err);
    const status = err.status || 500;
    return stripeJson(status, {
      error: publicBillingError(err, 'Kundenportal konnte nicht geöffnet werden.')
    });
  }
}

async function applySubscriptionToOperation(supabase, operationId, subscription, extra = {}) {
  const billing = mapSubscriptionToBilling(subscription);
  const payload = {
    ...billing,
    ...extra
  };
  const { error } = await supabase.from('operations').update(payload).eq('id', operationId);
  if (error) throw error;
}

async function findOperationIdForSubscription(supabase, subscription) {
  let bySubscriptionId = null;
  if (subscription?.id) {
    const { data } = await supabase
      .from('operations')
      .select('id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();
    bySubscriptionId = data?.id || null;
  }

  const customerId =
    typeof subscription?.customer === 'string'
      ? subscription.customer
      : subscription?.customer?.id;
  let byCustomerId = null;
  if (customerId) {
    const { data } = await supabase
      .from('operations')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    byCustomerId = data?.id || null;
  }

  const picked = pickOperationIdForSubscription({
    metadataOperationId: subscription?.metadata?.operation_id || null,
    bySubscriptionId,
    byCustomerId
  });
  if (picked.conflict) {
    console.warn(
      '[stripe webhook] metadata operation_id disagrees with Stripe binding; using binding',
      subscription?.id,
      picked.operationId
    );
  }
  return picked.operationId;
}

/**
 * Process verified Stripe webhook event.
 * @param {import('stripe').Stripe.Event} event
 */
export async function handleStripeEvent(event, env = process.env) {
  const supabase = getServiceSupabase(env);
  const stripe = getStripe(env);
  const type = event.type;
  const obj = event.data?.object;

  if (type === 'checkout.session.completed') {
    const session = obj;
    const operationId = session?.metadata?.operation_id || session?.client_reference_id;
    if (!operationId) {
      console.warn('[stripe webhook] checkout without operation_id');
      return { ok: true, skipped: true };
    }

    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id;

    const { data: existingOp } = await supabase
      .from('operations')
      .select('id, stripe_customer_id')
      .eq('id', operationId)
      .maybeSingle();
    if (!existingOp?.id) {
      console.warn('[stripe webhook] checkout operation not found', operationId);
      return { ok: true, skipped: true, reason: 'unknown_operation' };
    }
    if (
      customerId &&
      existingOp.stripe_customer_id &&
      existingOp.stripe_customer_id !== customerId
    ) {
      console.warn(
        '[stripe webhook] checkout customer mismatch; refusing plan update',
        operationId
      );
      return { ok: true, skipped: true, reason: 'customer_mismatch' };
    }

    // Never map a missing subscription to Free — that can wipe an active Pro plan.
    if (!session.subscription) {
      console.warn('[stripe webhook] checkout without subscription; only linking customer', operationId);
      if (customerId && !existingOp.stripe_customer_id) {
        const { error } = await supabase
          .from('operations')
          .update({ stripe_customer_id: customerId })
          .eq('id', operationId);
        if (error) throw error;
      }
      return { ok: true, skipped: true, reason: 'no_subscription' };
    }

    const subId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;
    const subscription = await stripe.subscriptions.retrieve(subId);

    const extra = {};
    if (customerId) extra.stripe_customer_id = customerId;
    await applySubscriptionToOperation(supabase, operationId, subscription, extra);
    return { ok: true };
  }

  if (
    type === 'customer.subscription.updated' ||
    type === 'customer.subscription.created' ||
    type === 'customer.subscription.deleted'
  ) {
    const subscription = obj;
    const operationId = await findOperationIdForSubscription(supabase, subscription);
    if (!operationId) {
      console.warn('[stripe webhook] subscription without operation', subscription?.id);
      return { ok: true, skipped: true };
    }

    if (type === 'customer.subscription.deleted') {
      await applySubscriptionToOperation(supabase, operationId, {
        ...subscription,
        status: 'canceled'
      });
    } else {
      await applySubscriptionToOperation(supabase, operationId, subscription);
    }
    return { ok: true };
  }

  if (type === 'invoice.payment_failed') {
    const invoice = obj;
    const subId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id;
    if (!subId) return { ok: true, skipped: true };
    const subscription = await stripe.subscriptions.retrieve(subId);
    const operationId = await findOperationIdForSubscription(supabase, subscription);
    if (!operationId) return { ok: true, skipped: true };
    await applySubscriptionToOperation(supabase, operationId, subscription);
    return { ok: true };
  }

  return { ok: true, ignored: true };
}

/**
 * Verify signature and process webhook.
 */
export async function handleStripeWebhook(rawBody, signature, env = process.env) {
  if (!isBillingEnforced(env)) {
    return stripeJson(503, { error: 'Billing ist nicht konfiguriert.' });
  }
  const secret = env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret) {
    return stripeJson(503, { error: 'STRIPE_WEBHOOK_SECRET fehlt.' });
  }
  if (!signature) {
    return stripeJson(400, { error: 'Stripe-Signature fehlt.' });
  }

  try {
    const stripe = getStripe(env);
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    await handleStripeEvent(event, env);
    return stripeJson(200, { received: true });
  } catch (err) {
    console.error('[stripe webhook]', err);
    return stripeJson(400, { error: 'Webhook ungültig.' });
  }
}
