/**
 * Bienenbetrieb (operations) – multi-user workspace helpers.
 */
import { supabase } from './supabase.js';
import { safeJsonParse } from './utils.js';

const ACTIVE_OP_KEY = 'hively_active_operation_id';
const ACTIVE_ROLE_KEY = 'hively_active_operation_role';
const ACTIVE_OP_META_KEY = 'hively_active_operation_meta';

function requireSupabase() {
  if (!supabase) throw new Error('Supabase ist nicht konfiguriert.');
  return supabase;
}

async function requireSession() {
  const client = requireSupabase();
  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error('Nicht angemeldet.');
  return session;
}

export function getActiveOperationId() {
  return localStorage.getItem(ACTIVE_OP_KEY) || null;
}

export function getActiveOperationRole() {
  return localStorage.getItem(ACTIVE_ROLE_KEY) || null;
}

export function getActiveOperationMeta() {
  return safeJsonParse(localStorage.getItem(ACTIVE_OP_META_KEY), null);
}

export function isOperationOwner() {
  return getActiveOperationRole() === 'owner';
}

/** Owner or editor may create/edit operational data. */
export function canEditOperation() {
  const role = getActiveOperationRole();
  return role === 'owner' || role === 'editor';
}

export function isOperationViewer() {
  return getActiveOperationRole() === 'viewer';
}

export function roleLabel(role) {
  if (role === 'owner') return 'Inhaber';
  if (role === 'editor') return 'Mitarbeiter';
  if (role === 'viewer') return 'Betrachter';
  return role || 'Unbekannt';
}

export function setActiveOperation(operation, role) {
  if (!operation?.id) {
    clearActiveOperation();
    return;
  }
  localStorage.setItem(ACTIVE_OP_KEY, operation.id);
  localStorage.setItem(ACTIVE_ROLE_KEY, role || 'editor');
  localStorage.setItem(ACTIVE_OP_META_KEY, JSON.stringify({
    id: operation.id,
    name: operation.name,
    addressLine: operation.address_line ?? operation.addressLine ?? '',
    postalCode: operation.postal_code ?? operation.postalCode ?? '',
    city: operation.city ?? '',
    role: role || 'editor'
  }));
}

export function clearActiveOperation() {
  localStorage.removeItem(ACTIVE_OP_KEY);
  localStorage.removeItem(ACTIVE_ROLE_KEY);
  localStorage.removeItem(ACTIVE_OP_META_KEY);
}

export async function ensureProfile() {
  const session = await requireSession();
  const client = requireSupabase();
  const displayName =
    session.user.user_metadata?.display_name ||
    (session.user.email ? session.user.email.split('@')[0] : 'Imker');

  const { error } = await client.from('profiles').upsert({
    id: session.user.id,
    display_name: displayName,
    email: session.user.email || null
  });
  if (error) console.warn('Profile upsert failed:', error);
  return { id: session.user.id, display_name: displayName, email: session.user.email };
}

export async function listMyOperations() {
  const session = await requireSession();
  const client = requireSupabase();

  const { data: memberships, error: memErr } = await client
    .from('operation_members')
    .select('role, operation_id, operations ( id, name, address_line, postal_code, city, created_at, updated_at )')
    .eq('user_id', session.user.id);

  if (memErr) throw memErr;

  return (memberships || [])
    .filter((m) => m.operations)
    .map((m) => ({
      id: m.operations.id,
      name: m.operations.name,
      addressLine: m.operations.address_line || '',
      postalCode: m.operations.postal_code || '',
      city: m.operations.city || '',
      createdAt: m.operations.created_at,
      updatedAt: m.operations.updated_at,
      role: m.role
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export async function createOperation({ name, addressLine, postalCode, city }) {
  const session = await requireSession();
  const client = requireSupabase();
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('Betriebsname ist erforderlich.');

  const { data: operation, error } = await client
    .from('operations')
    .insert({
      name: trimmedName,
      address_line: (addressLine || '').trim(),
      postal_code: (postalCode || '').trim(),
      city: (city || '').trim(),
      created_by: session.user.id
    })
    .select('*')
    .single();

  if (error) throw error;

  const { error: memErr } = await client.from('operation_members').insert({
    operation_id: operation.id,
    user_id: session.user.id,
    role: 'owner'
  });
  if (memErr) throw memErr;

  const mapped = {
    id: operation.id,
    name: operation.name,
    addressLine: operation.address_line || '',
    postalCode: operation.postal_code || '',
    city: operation.city || '',
    role: 'owner'
  };
  setActiveOperation(mapped, 'owner');
  return mapped;
}

export async function updateOperation(operationId, { name, addressLine, postalCode, city }) {
  const client = requireSupabase();
  const payload = {};
  if (name !== undefined) payload.name = String(name).trim();
  if (addressLine !== undefined) payload.address_line = String(addressLine).trim();
  if (postalCode !== undefined) payload.postal_code = String(postalCode).trim();
  if (city !== undefined) payload.city = String(city).trim();

  const { data, error } = await client
    .from('operations')
    .update(payload)
    .eq('id', operationId)
    .select('*')
    .single();
  if (error) throw error;

  const role = getActiveOperationRole() || 'owner';
  const mapped = {
    id: data.id,
    name: data.name,
    addressLine: data.address_line || '',
    postalCode: data.postal_code || '',
    city: data.city || '',
    role
  };
  if (getActiveOperationId() === operationId) {
    setActiveOperation(mapped, role);
  }
  return mapped;
}

export async function listOperationMembers(operationId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('operation_members')
    .select('user_id, role, joined_at')
    .eq('operation_id', operationId)
    .order('joined_at', { ascending: true });
  if (error) throw error;

  const ids = (data || []).map((m) => m.user_id);
  const profiles = await getProfileDetailsMap(ids);

  return (data || []).map((m) => {
    const profile = profiles[m.user_id] || {};
    return {
      userId: m.user_id,
      role: m.role,
      joinedAt: m.joined_at,
      displayName: profile.displayName || 'Unbekannt',
      email: profile.email || ''
    };
  });
}

function generateInviteCode(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export async function createInvite(operationId, { role = 'editor', daysValid = 30 } = {}) {
  const session = await requireSession();
  const client = requireSupabase();
  if (role !== 'editor' && role !== 'viewer') {
    throw new Error('Einladungen sind nur für Mitarbeiter oder Betrachter erlaubt.');
  }

  const expiresAt = daysValid
    ? new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data, error } = await client
    .from('operation_invites')
    .insert({
      operation_id: operationId,
      code: generateInviteCode(),
      role,
      created_by: session.user.id,
      expires_at: expiresAt,
      max_uses: null
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export function buildInviteLink(code) {
  const url = new URL(window.location.href);
  url.searchParams.set('join', code);
  // Keep path clean for SPA
  url.hash = '';
  return url.toString();
}

export async function previewInvite(code) {
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_invite_by_code', { invite_code: code });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Einladungscode ungültig');
  return row;
}

export async function joinWithCode(code) {
  const client = requireSupabase();
  const { data: operationId, error } = await client.rpc('join_operation_with_code', {
    invite_code: String(code || '').trim()
  });
  if (error) throw error;

  const ops = await listMyOperations();
  const joined = ops.find((o) => o.id === operationId);
  if (!joined) throw new Error('Beitritt fehlgeschlagen.');
  setActiveOperation(joined, joined.role);
  return joined;
}

/**
 * Ensure user has an active operation. Creates "Mein Betrieb" if none exist.
 * Returns { operation, role, created }.
 */
export async function ensureActiveOperation() {
  await ensureProfile();
  const ops = await listMyOperations();

  if (ops.length === 0) {
    const created = await createOperation({
      name: 'Mein Betrieb',
      addressLine: '',
      postalCode: '',
      city: ''
    });
    return { operation: created, role: 'owner', created: true, operations: [created] };
  }

  const activeId = getActiveOperationId();
  const match = ops.find((o) => o.id === activeId) || ops[0];
  setActiveOperation(match, match.role);
  return { operation: match, role: match.role, created: false, operations: ops };
}

export async function getProfileMap(userIds = []) {
  const details = await getProfileDetailsMap(userIds);
  const map = {};
  for (const [id, profile] of Object.entries(details)) {
    map[id] = profile.displayName;
  }
  return map;
}

async function getProfileDetailsMap(userIds = []) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};
  const client = requireSupabase();
  const { data, error } = await client
    .from('profiles')
    .select('id, display_name, email')
    .in('id', unique);
  if (error) {
    console.warn('Failed to load profiles:', error);
    return {};
  }
  const map = {};
  for (const p of data || []) {
    map[p.id] = {
      displayName: p.display_name || p.email || 'Unbekannt',
      email: p.email || ''
    };
  }
  return map;
}
