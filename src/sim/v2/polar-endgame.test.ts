import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  ARCTIC_PROJECTS_V2,
  clonePolarEndgameV2,
  deployAntarcticExpeditionV2,
  processArcticResearchV2,
  selectAntarcticExpeditionTermsV2,
  selectArcticProjectTermsV2,
  startArcticProjectV2,
} from './polarEndgame';
import { nationIdV2 } from './types';

describe('V2 Arctic research gateway', () => {
  it('closes inserted prerequisites for legacy completed and active project IDs without rewriting the run', () => {
    const state = createWorldStateV2(400);
    const canada = nationIdV2('can');
    state.polarEndgame.arcticPrograms[canada] = {
      playerId: canada,
      completedProjects: ['polar-demography'],
      activeProject: {
        projectId: 'cryogenic-logistics',
        playerId: canada,
        startedTick: 2,
        completesTick: 80,
        costPaid: 5,
      },
    };

    const cloned = clonePolarEndgameV2(state.polarEndgame);
    expect(cloned.arcticPrograms[canada]?.completedProjects)
      .toEqual(ARCTIC_PROJECTS_V2
        .slice(0, ARCTIC_PROJECTS_V2.findIndex((project) => project.id === 'cryogenic-logistics'))
        .map((project) => project.id));
    expect(cloned.arcticPrograms[canada]?.activeProject).toEqual({
      projectId: 'cryogenic-logistics',
      playerId: canada,
      startedTick: 2,
      completesTick: 80,
      costPaid: 5,
    });
  });

  it('keeps fourteen authored projects sequential and paid through the normal nation treasury', () => {
    const state = createWorldStateV2(401);
    const canada = nationIdV2('can');
    state.humanPlayerId = canada;
    state.humanPlayerIds = [canada];
    state.players[canada]!.treasury = 100_000;
    state.polarEndgame.apexNarrative.players[canada] = {
      investigationAuthorized: true,
      transmissions: [],
    };

    expect(ARCTIC_PROJECTS_V2.map((project) => project.baseCost))
      .toEqual([0.01, 0.04, 0.12, 0.3, 0.7, 1.5, 3, 5, 12, 25, 50, 110, 240, 500]);
    expect(ARCTIC_PROJECTS_V2.map((project) => project.durationTicks))
      .toEqual([13, 18, 22, 26, 30, 34, 38, 42, 48, 55, 62, 72, 84, 96]);
    for (const project of ARCTIC_PROJECTS_V2) {
      const quote = selectArcticProjectTermsV2(state, WORLD_CONTENT_V2, canada, project.id);
      expect(quote.allowed).toBe(true);
      const treasuryBefore = state.players[canada]!.treasury;
      expect(startArcticProjectV2(state, WORLD_CONTENT_V2, canada, project.id)).toEqual({ accepted: true });
      expect(state.players[canada]!.treasury).toBeCloseTo(treasuryBefore - quote.cost, 6);
      state.tick = state.polarEndgame.arcticPrograms[canada]!.activeProject!.completesTick;
      processArcticResearchV2(state, WORLD_CONTENT_V2);
    }

    expect(state.polarEndgame.arcticPrograms[canada]!.completedProjects)
      .toEqual(ARCTIC_PROJECTS_V2.map((project) => project.id));
    expect(state.polarEndgame.phase).toBe('warning');
    expect(state.polarEndgame.revealedBy).toBe(canada);
    expect(state.polarEndgame.contactTick).toBeNull();
    expect(state.polarEndgame.rogueAttention.stage).toBe('dormant');
  });

  it('quotes early million-scale requirements without rounding them down to $0.0B', () => {
    const state = createWorldStateV2(405);
    const canada = nationIdV2('can');
    state.humanPlayerId = canada;
    state.humanPlayerIds = [canada];
    state.players[canada]!.treasury = 0;
    state.polarEndgame.arcticPrograms[canada] = {
      playerId: canada,
      activeProject: null,
      completedProjects: ['polar-demography'],
    };
    state.polarEndgame.apexNarrative.players[canada] = {
      investigationAuthorized: true,
      transmissions: [],
    };

    expect(selectArcticProjectTermsV2(
      state,
      WORLD_CONTENT_V2,
      canada,
      'baseline-calibration',
    )).toMatchObject({ allowed: false, reason: 'Treasury requires $40M.' });
  });

  it('reveals the Antarctic origin only after the final stage without awakening the Rogue empire', () => {
    const state = createWorldStateV2(402);
    const canada = nationIdV2('can');
    state.humanPlayerId = canada;
    state.humanPlayerIds = [canada];
    state.polarEndgame.phase = 'arctic-research';
    state.polarEndgame.arcticPrograms[canada] = {
      playerId: canada,
      completedProjects: ARCTIC_PROJECTS_V2.slice(0, -1).map((project) => project.id),
      activeProject: {
        projectId: 'deep-ice-signals',
        playerId: canada,
        startedTick: 0,
        completesTick: 1,
        costPaid: 1,
      },
    };
    state.tick = 1;

    expect(processArcticResearchV2(state, WORLD_CONTENT_V2)).toEqual([
      expect.objectContaining({ kind: 'project-complete', playerId: canada, projectId: 'deep-ice-signals' }),
    ]);
    expect(state.polarEndgame.phase).toBe('warning');
    expect(state.polarEndgame.contactTick).toBeNull();
    expect(state.polarEndgame.rogueAttention.stage).toBe('dormant');
    expect(Object.values(state.polarEndgame.gatewayBreaches)
      .every((gateway) => gateway?.status === 'sealed')).toBe(true);
    expect(state.wars).toEqual([]);
  });

  it('quotes the same universal stage costs and base timing for weak, strong, Arctic and non-Arctic countries', () => {
    const state = createWorldStateV2(404);
    const countries = ['gnb', 'usa', 'grl', 'can'].map(nationIdV2);
    state.humanPlayerId = countries[0]!;
    state.humanPlayerIds = countries;
    for (const countryId of countries) {
      state.players[countryId]!.treasury = 100_000;
      state.polarEndgame.apexNarrative.players[countryId] = {
        investigationAuthorized: true,
        transmissions: [],
      };
    }
    for (const project of ARCTIC_PROJECTS_V2) {
      const terms = countries.map((countryId) => selectArcticProjectTermsV2(
        state,
        WORLD_CONTENT_V2,
        countryId,
        project.id,
      ));
      expect(new Set(terms.map((entry) => entry.quotedCost))).toEqual(new Set([project.baseCost]));
      expect(new Set(terms.map((entry) => entry.baseDurationTicks)))
        .toEqual(new Set([project.durationTicks]));
      expect(terms.every((entry) => entry.reason !== 'Own an Arctic country first.')).toBe(true);
    }
  });

  it('keeps the retired expedition API read-compatible but permanently disabled', () => {
    const state = createWorldStateV2(403);
    const canada = nationIdV2('can');
    state.humanPlayerId = canada;
    state.humanPlayerIds = [canada];
    state.polarEndgame.phase = 'contact';
    state.polarEndgame.warningTick = 0;
    state.polarEndgame.contactTick = 0;
    const reservesBefore = state.players[canada]!.trainedReserves;

    expect(selectAntarcticExpeditionTermsV2(
      state, WORLD_CONTENT_V2, canada, 'drake-entry',
    )).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('Capture Antarctic territories'),
    });
    expect(deployAntarcticExpeditionV2(
      state, WORLD_CONTENT_V2, canada, 'drake-entry', 1,
    )).toMatchObject({ accepted: false });
    expect(state.polarEndgame.expeditions).toEqual([]);
    expect(state.players[canada]!.trainedReserves).toBe(reservesBefore);
  });
});
