import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock, session } = vi.hoisted(() => {
  const session = {
    user: { id: 'user-1', email: 'imker@example.com' }
  };

  const supabaseMock = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session } }))
    },
    from: vi.fn(),
    rpc: vi.fn()
  };

  return { supabaseMock, session };
});

vi.mock('../src/supabase.js', () => ({
  supabase: supabaseMock
}));

const {
  createOperation,
  clearActiveOperation,
  getActiveOperationId,
  getActiveOperationRole
} = await import('../src/operations.js');

describe('createOperation', () => {
  beforeEach(() => {
    localStorage.clear();
    clearActiveOperation();
    vi.clearAllMocks();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session } });
  });

  it('legt den Betrieb per create_operation RPC an und setzt ihn aktiv', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        id: 'op-new-1',
        name: 'Hof Gunasiri',
        address_line: 'Dorfstrasse 1',
        postal_code: '4600',
        city: 'Olten',
        plan: 'free',
        plan_status: 'none',
        plan_interval: null,
        plan_period_end: null,
        stripe_customer_id: null
      },
      error: null
    });

    const created = await createOperation({
      name: '  Hof Gunasiri  ',
      addressLine: 'Dorfstrasse 1',
      postalCode: '4600',
      city: 'Olten'
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith('create_operation', {
      p_name: 'Hof Gunasiri',
      p_address_line: 'Dorfstrasse 1',
      p_postal_code: '4600',
      p_city: 'Olten'
    });
    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(created).toMatchObject({
      id: 'op-new-1',
      name: 'Hof Gunasiri',
      addressLine: 'Dorfstrasse 1',
      postalCode: '4600',
      city: 'Olten',
      role: 'owner',
      plan: 'free'
    });
    expect(getActiveOperationId()).toBe('op-new-1');
    expect(getActiveOperationRole()).toBe('owner');
  });

  it('wirft bei leerem Namen und ruft die RPC nicht auf', async () => {
    await expect(createOperation({ name: '   ' })).rejects.toThrow(
      'Betriebsname ist erforderlich.'
    );
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('reicht RPC-Fehler durch', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { message: 'create_operation failed' }
    });

    await expect(
      createOperation({ name: 'Hof Gunasiri' })
    ).rejects.toMatchObject({
      message: 'create_operation failed'
    });
  });
});
