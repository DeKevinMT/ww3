import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { WorldContentV2 } from '../sim/v2/content';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import { resolveScenarioV2 } from '../sim/v2/scenarios';
import type { WorldStateV2 } from '../sim/v2/types';
import {
  SURVIVAL_CONTACT_FAST_FORWARD_SPEED_V2,
  hasRealSurvivalRogueHumanContactV2,
  shouldStopSurvivalContactFastForwardV2,
  survivalContactFastForwardPresentationV2,
} from './survivalContactFastForward';
import worldUiSource from './WorldUIV2.ts?raw';

const stylesSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

const survivalContent = {
  metadata: { scenarioId: 'survival' },
} as Pick<WorldContentV2, 'metadata'>;

function state(speed: 0 | 1 | 2 | 3 = 1): Pick<
  WorldStateV2,
  'gameOver' | 'humanPlayerIds' | 'speed' | 'wars'
> {
  return {
    gameOver: false,
    humanPlayerIds: ['grl'] as WorldStateV2['humanPlayerIds'],
    speed,
    wars: [],
  };
}

function rogueWar(withFront: boolean, battles = 0): WorldStateV2['wars'][number] {
  return {
    id: 'war-contact',
    attackerId: 'rai',
    defenderId: 'grl',
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    revenge: null,
    attackerOperations: withFront ? [{
      commanderId: 'rai',
      sourceId: 'drake-entry',
      targetId: 'grl',
      doctrine: 'pressure',
      access: 'naval',
      startedTick: 0,
      lastBattleTick: 0,
      holdUntilTick: 8,
      momentum: 0,
    }] : [],
    defenderOperations: [],
  } as WorldStateV2['wars'][number];
}

describe('Survival contact fast-forward', () => {
  it('reserves authoritative 3× simulation speed for Survival', () => {
    const survival = resolveScenarioV2({ mode: 'survival', seed: 97_001 });
    const survivalEngine = new WorldEngineV2(97_001, survival.content);
    expect(survivalEngine.setSpeed(3)).toEqual({ accepted: true });
    expect(survivalEngine.state.speed).toBe(3);
    survivalEngine.stopClock();

    const campaign = new WorldEngineV2(97_002);
    expect(campaign.setSpeed(3)).toMatchObject({ accepted: false });
    expect(campaign.state.speed).not.toBe(3);
  });

  it('stays available through declarations and distant operations, then stops on battle contact', () => {
    const approaching = state();
    approaching.wars = [rogueWar(false)];
    expect(hasRealSurvivalRogueHumanContactV2(approaching)).toBe(false);
    expect(survivalContactFastForwardPresentationV2(
      approaching,
      survivalContent,
      { dismissed: false, clockAuthority: true },
    )).toMatchObject({
      visible: true,
      active: false,
      authorized: true,
      label: 'FAST-FORWARD TO CONTACT',
    });

    approaching.wars = [rogueWar(true)];
    expect(hasRealSurvivalRogueHumanContactV2(approaching)).toBe(false);
    expect(survivalContactFastForwardPresentationV2(
      approaching,
      survivalContent,
      { dismissed: false, clockAuthority: true },
    ).visible).toBe(true);

    approaching.wars = [rogueWar(true, 1)];
    expect(hasRealSurvivalRogueHumanContactV2(approaching)).toBe(true);
    expect(survivalContactFastForwardPresentationV2(
      approaching,
      survivalContent,
      { dismissed: false, clockAuthority: true },
    ).visible).toBe(false);
  });

  it('presents one shared 3× state while keeping control host-authoritative', () => {
    const accelerated = state(SURVIVAL_CONTACT_FAST_FORWARD_SPEED_V2);
    expect(survivalContactFastForwardPresentationV2(
      accelerated,
      survivalContent,
      { dismissed: false, clockAuthority: true },
    )).toMatchObject({ visible: true, active: true, authorized: true, label: 'SEEKING CONTACT · 3×' });
    expect(survivalContactFastForwardPresentationV2(
      accelerated,
      survivalContent,
      { dismissed: false, clockAuthority: false },
    )).toMatchObject({ visible: true, active: true, authorized: false, label: 'HOST SEEKING CONTACT · 3×' });

    const waitingClient = survivalContactFastForwardPresentationV2(
      state(),
      survivalContent,
      { dismissed: false, clockAuthority: false },
    );
    expect(waitingClient).toMatchObject({
      visible: true,
      active: false,
      authorized: false,
      label: 'WAITING FOR HOST',
    });
    expect(waitingClient.detail).toContain('room host');
  });

  it('returns to normal on contact, game end or view dismissal boundaries', () => {
    const accelerated = state(SURVIVAL_CONTACT_FAST_FORWARD_SPEED_V2);
    expect(shouldStopSurvivalContactFastForwardV2(accelerated, survivalContent)).toBe(false);
    accelerated.wars = [rogueWar(true, 1)];
    expect(shouldStopSurvivalContactFastForwardV2(accelerated, survivalContent)).toBe(true);
    accelerated.wars = [];
    accelerated.gameOver = true;
    expect(shouldStopSurvivalContactFastForwardV2(accelerated, survivalContent)).toBe(true);
    expect(survivalContactFastForwardPresentationV2(
      state(),
      survivalContent,
      { dismissed: true, clockAuthority: true },
    ).visible).toBe(false);
  });

  it('keeps the control compact, live-route-aware and explicit at contact', () => {
    expect(worldUiSource).toContain('CONTACT ESTABLISHED');
    expect(worldUiSource).toContain('MACHINE OFFENSIVE · WAVE');
    expect(worldUiSource).toContain('data-polar-region="antarctica"');
    expect(worldUiSource).toContain('recentLogisticsMovements()');
    expect(worldUiSource).toContain('cancel-contact-fast-forward');
    expect(worldUiSource).toContain('stopSurvivalContactFastForwardWhenResolved()');
    expect(stylesSource).toContain('right: 12px');
  });
});
