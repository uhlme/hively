import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('auth-return.html bridge', () => {
  const html = readFileSync(join(process.cwd(), 'public/auth-return.html'), 'utf8');

  it('uses Android Intent bounce (same pattern as join.html)', () => {
    expect(html).toContain("'intent://auth'");
    expect(html).toContain("scheme=' + scheme");
    expect(html).toContain('package=ch.hively.app');
    expect(html).toContain('id="open-app"');
  });

  it('keeps iOS custom-scheme bounce', () => {
    expect(html).toContain("scheme + '://auth'");
  });

  it('stashes OAuth code via handoff API for Custom Tabs close path', () => {
    expect(html).toContain('/api/oauth-handoff');
    expect(html).toContain('stashHandoff');
  });

  it('does not leak OAuth codes via browser_fallback_url', () => {
    expect(html).not.toContain('browser_fallback_url');
  });
});
