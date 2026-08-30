import { describe, expect, it } from 'vitest';
import { integrationCompletionToastMessageV2 } from './WorldUIV2';

describe('AI conquest copy', () => {
  it('reserves Signal Purge and liberation language for an APEX-controlled victor', () => {
    const apex = integrationCompletionToastMessageV2('Iceland', 'Greenland', true);
    const autonomous = integrationCompletionToastMessageV2('Ukraine', 'Russia', false);

    expect(apex).toContain('signal purged');
    expect(apex).toContain('liberated');
    expect(autonomous).toBe('Ukraine command network absorbed by Russia · consolidation complete');
    expect(autonomous).not.toMatch(/purge|liberat/i);
  });
});
