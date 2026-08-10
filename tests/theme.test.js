import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styleCss = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');
const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('system light / dark theme', () => {
  it('defaults to dark color-scheme on :root', () => {
    expect(styleCss).toMatch(/:root\s*\{[^}]*color-scheme:\s*dark/s);
  });

  it('defines light tokens under prefers-color-scheme: light', () => {
    expect(styleCss).toContain('@media (prefers-color-scheme: light)');
    const lightBlock = styleCss.split('@media (prefers-color-scheme: light)')[1] || '';
    expect(lightBlock).toMatch(/color-scheme:\s*light/);
    expect(lightBlock).toContain('--bg-secondary:');
    expect(lightBlock).toContain('--text-primary:');
    expect(lightBlock).toContain('--border-color:');
  });

  it('exposes muted surface tokens used by UI chrome', () => {
    expect(styleCss).toContain('--bg-muted:');
    expect(styleCss).toContain('--bg-muted-badge:');
    expect(styleCss).toContain('--overlay-scrim:');
  });

  it('ships theme-color metas for light and dark', () => {
    expect(indexHtml).toContain('media="(prefers-color-scheme: light)"');
    expect(indexHtml).toContain('media="(prefers-color-scheme: dark)"');
    expect(indexHtml).toContain('content="#e8eaed"');
    expect(indexHtml).toContain('content="#08090a"');
    // Media-scoped metas must come before the unscoped fallback so browsers
    // that honor media= can pick light without the first match locking dark.
    const themeMetas = [...indexHtml.matchAll(/<meta name="theme-color"[^>]*>/g)].map((m) => m[0]);
    expect(themeMetas.length).toBeGreaterThanOrEqual(2);
    expect(themeMetas[0]).toContain('prefers-color-scheme: light');
    expect(themeMetas[1]).toContain('prefers-color-scheme: dark');
  });
});

