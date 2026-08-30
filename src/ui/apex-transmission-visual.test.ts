import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const theme = readFileSync(new URL('./ApexReclamationTheme.css', import.meta.url), 'utf8');

describe('APEX transmission visual isolation', () => {
  it('keeps home/loading key art out of in-world messages', () => {
    const start = theme.indexOf('.world-ui-v2 .apex-transmission-backdrop {');
    const end = theme.indexOf('}', start);
    const backdropRule = theme.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(backdropRule).toContain('background: rgba(1, 7, 13, .66);');
    expect(backdropRule).not.toContain('apex-reclamation-bg');
    expect(backdropRule).not.toContain('url(');
  });
});
