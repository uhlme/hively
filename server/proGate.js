/**
 * Server-side Pro entitlement checks without importing Stripe
 * (keeps Gemini cold start free of the Stripe SDK).
 */
import { createClient } from '@supabase/supabase-js';
import { isBillingEnforced, isProEntitlement } from './billing.js';

export function getServiceSupabase(env = process.env) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_URL fehlen.');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/**
 * Server-side Pro check for an operation the user belongs to.
 */
export async function assertUserOperationHasPro(userId, operationId, env = process.env) {
  if (!isBillingEnforced(env)) {
    return { ok: true, enforced: false };
  }
  if (!operationId) {
    return { ok: false, status: 402, error: 'Hively Pro erforderlich (kein Betrieb aktiv).' };
  }

  try {
    const supabase = getServiceSupabase(env);
    const { data: membership, error: memErr } = await supabase
      .from('operation_members')
      .select('role')
      .eq('operation_id', operationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (memErr) throw memErr;
    if (!membership) {
      return { ok: false, status: 403, error: 'Kein Zugriff auf diesen Betrieb.' };
    }

    const { data: op, error } = await supabase
      .from('operations')
      .select('plan, plan_status, plan_period_end')
      .eq('id', operationId)
      .maybeSingle();
    if (error) throw error;

    if (!isProEntitlement(op || {})) {
      return {
        ok: false,
        status: 402,
        error: 'Hively Pro erforderlich für KI-Funktionen.',
        code: 'pro_required'
      };
    }
    return { ok: true, enforced: true };
  } catch (err) {
    console.error('[billing assert]', err);
    return { ok: false, status: 502, error: 'Abo-Status konnte nicht geprüft werden.' };
  }
}
