import { describe, expect, it } from 'vitest';
import { terminalResearchSurgeRequestReasonV2 } from './manualRequests';

describe('manual Research Surge request lifecycle', () => {
  it('releases a queued request when its selected program can no longer advance', () => {
    expect(terminalResearchSurgeRequestReasonV2('Selected research program cannot advance.'))
      .toBe('Selected research program cannot advance.');
    expect(terminalResearchSurgeRequestReasonV2('Research program is unavailable.'))
      .toBe('Research program is unavailable.');
  });

  it('keeps temporary cash and cooldown waits queued', () => {
    expect(terminalResearchSurgeRequestReasonV2('Requires $12.00B in cash.')).toBeUndefined();
    expect(terminalResearchSurgeRequestReasonV2('Research Surge returns in 12 weeks.')).toBeUndefined();
  });
});
