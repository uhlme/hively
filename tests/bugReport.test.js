import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('bugReport', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('prepares a mailto report with diagnostics', async () => {
    const {
      SUPPORT_EMAIL,
      APP_VERSION,
      prepareBugReport,
      buildMailtoBody,
      rememberError,
      clearLastCapturedError
    } = await import('../src/bugReport.js');

    clearLastCapturedError();
    rememberError(new Error('Speichern fehlgeschlagen'));

    const prepared = prepareBugReport({
      message: 'Beim Speichern einer Durchsicht knallt es.',
      replyEmail: 'imker@example.com',
      view: 'hive-detail'
    });

    expect(prepared.ok).toBe(true);
    expect(prepared.mailtoUrl).toMatch(new RegExp(`^mailto:${SUPPORT_EMAIL}\\?`));
    expect(prepared.context.appVersion).toBe(APP_VERSION);
    expect(prepared.context.view).toBe('hive-detail');
    expect(prepared.analyticsProps.has_reply_email).toBe(true);
    expect(prepared.analyticsProps.has_last_error).toBe(true);

    const body = buildMailtoBody({
      message: prepared.message,
      replyEmail: prepared.replyEmail,
      context: prepared.context
    });
    expect(body).toContain('Beim Speichern einer Durchsicht knallt es.');
    expect(body).toContain('Antwort an: imker@example.com');
    expect(body).toContain('Speichern fehlgeschlagen');
    expect(body).toContain(`Version: ${APP_VERSION}`);
  });

  it('rejects empty or too-short messages', async () => {
    const { prepareBugReport } = await import('../src/bugReport.js');
    expect(prepareBugReport({ message: '' }).ok).toBe(false);
    expect(prepareBugReport({ message: 'kurz' }).ok).toBe(false);
  });

  it('rejects invalid optional reply email', async () => {
    const { prepareBugReport } = await import('../src/bugReport.js');
    const result = prepareBugReport({
      message: 'Ein längerer Fehlerbericht mit Details.',
      replyEmail: 'nicht-gültig'
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/E-Mail/i);
  });
});
