import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import { territoryIdV2 } from '../sim/v2/types';
import { enterPostBlackoutCampaignForTestV2 } from '../sim/v2/testSupport';
import { serializeSaveV2 } from '../sim/v2/persistence';
import {
  createMapEngineAdapter,
  mapPolarEndgameSnapshotV2,
  mapWorldContentProjectionV2,
} from './WorldUIV2';

describe('viewer-local map knowledge', () => {
  it('projects account-selected flags for human empires without mutating simulation state', () => {
    const engine = new WorldEngineV2(96_409);
    const playerId = engine.state.humanPlayerId;
    const adapter = createMapEngineAdapter(
      engine,
      () => engine.globalRanking(),
      new Map(),
      {},
      new Map([[playerId, 'jpn']]),
    );
    adapter.refreshSnapshot?.();
    expect(adapter.player(playerId)?.flagCountryId).toBe('jpn');
    expect(engine.state.players[playerId]).not.toHaveProperty('flagCountryId');
  });

  it('projects only scenario identity and strategic connection targets', () => {
    const engine = new WorldEngineV2(96_410);
    const projection = mapWorldContentProjectionV2(engine.content);

    expect(projection.metadata?.scenarioId).toBe('standard-2026');
    expect(projection.territories?.chl?.connections.map((entry) => entry.targetId))
      .toContain('drake-entry');
    expect(projection.territories?.zaf?.connections.map((entry) => entry.targetId))
      .toContain('maud-entry');
    expect(projection.territories?.nzl?.connections.map((entry) => entry.targetId))
      .toContain('ross-entry');
    expect(Object.keys(projection.territories!.chl!).sort()).toEqual(['connections']);
    expect(Object.keys(projection.territories!.chl!.connections[0]!).sort())
      .toEqual(['targetId']);
    expect(JSON.stringify(projection)).not.toContain('baseline');
    expect(JSON.stringify(projection)).not.toContain('initialOwnerId');
    expect(JSON.stringify(projection)).not.toContain('militaryQuality');
  });

  it('reads account dossiers lazily per client without changing canonical state', () => {
    const engine = new WorldEngineV2(96_411);
    const firstAccount = new Set<string>(['usa']);
    const secondAccount = new Set<string>(['jpn']);
    const first = createMapEngineAdapter(
      engine,
      () => engine.globalRanking(),
      new Map(),
      { chartedTerritoryIds: () => firstAccount },
    );
    const second = createMapEngineAdapter(
      engine,
      () => engine.globalRanking(),
      new Map(),
      { chartedTerritoryIds: () => secondAccount },
    );
    first.refreshSnapshot?.();
    second.refreshSnapshot?.();

    expect(first.viewerKnowledge?.chartedTerritoryIds).toEqual(['usa']);
    expect(second.viewerKnowledge?.chartedTerritoryIds).toEqual(['jpn']);
    expect(first.state.humanPlayerIds).toEqual(second.state.humanPlayerIds);
    expect(JSON.stringify(first.state)).not.toContain('chartedTerritoryIds');
    expect(JSON.stringify(engine.state)).not.toContain('chartedTerritoryIds');

    firstAccount.add('jpn');
    expect(first.viewerKnowledge?.chartedTerritoryIds).toEqual(['jpn', 'usa']);
  });

  it('keeps Campaign clear until acknowledgement, then activates the relevance veil once', () => {
    const engine = new WorldEngineV2(96_412);
    const playerId = engine.state.humanPlayerId;
    const adapter = createMapEngineAdapter(engine, () => engine.globalRanking());
    adapter.refreshSnapshot?.();
    expect(adapter.viewerKnowledge?.communicationsBlackoutActive).toBe(false);
    expect(adapter.viewerKnowledge?.communicationsBlackoutTick).toBeNull();

    (engine.state.polarEndgame as typeof engine.state.polarEndgame & {
      communicationsBlackoutTick: number | null;
    }).communicationsBlackoutTick = 104;
    engine.state.tick = 104;
    engine.state.polarEndgame.apexNarrative.players[playerId] = {
      investigationAuthorized: true,
      transmissions: [{
        id: 'campaign-communications-blackout',
        playerId,
        sentTick: 104,
        title: 'The world is going dark',
        body: 'Test blackout briefing.',
        action: null,
        targetId: null,
        choice: null,
        resolvedTick: null,
      }],
    };
    expect(adapter.viewerKnowledge?.communicationsBlackoutActive).toBe(false);
    expect(adapter.viewerKnowledge?.communicationsBlackoutTick).toBe(104);
    expect(adapter.viewerKnowledge?.communicationsBlackoutAnimateActivation).toBe(false);

    const briefing = engine.state.polarEndgame.apexNarrative.players[playerId]!.transmissions[0]!;
    briefing.choice = 'acknowledge';
    briefing.resolvedTick = 104;
    expect(adapter.viewerKnowledge?.communicationsBlackoutActive).toBe(true);
    expect(adapter.viewerKnowledge?.communicationsBlackoutAnimateActivation).toBe(true);

    const settledAdapter = createMapEngineAdapter(engine, () => engine.globalRanking());
    settledAdapter.refreshSnapshot?.();
    expect(settledAdapter.viewerKnowledge?.communicationsBlackoutActive).toBe(true);
    expect(settledAdapter.viewerKnowledge?.communicationsBlackoutAnimateActivation).toBe(false);
  });

  it('projects the resolved first-strike shield gate per viewer and preserves it on load', () => {
    const engine = new WorldEngineV2(96_414);
    const adapter = createMapEngineAdapter(engine, () => engine.globalRanking());
    adapter.refreshSnapshot?.();
    expect(adapter.viewerKnowledge?.apexFieldActivated).toBe(false);

    enterPostBlackoutCampaignForTestV2(engine.state);
    expect(adapter.viewerKnowledge?.apexFieldActivated).toBe(true);

    const loaded = WorldEngineV2.fromSave(serializeSaveV2(engine.state, engine.content));
    const loadedAdapter = createMapEngineAdapter(loaded, () => loaded.globalRanking());
    loadedAdapter.refreshSnapshot?.();
    expect(loadedAdapter.viewerKnowledge?.apexFieldActivated).toBe(true);
  });

  it('keeps an authenticated legacy Campaign with human war history visible', () => {
    const engine = new WorldEngineV2(96_415);
    const playerId = engine.state.humanPlayerId;
    delete engine.state.polarEndgame.apexNarrative.players[playerId];
    engine.state.events.push({
      id: engine.state.nextEventId++,
      tick: engine.state.tick,
      kind: 'war',
      severity: 'critical',
      message: 'Legacy human war declaration.',
      playerId,
      unread: false,
    });
    const adapter = createMapEngineAdapter(engine, () => engine.globalRanking());
    adapter.refreshSnapshot?.();
    expect(adapter.viewerKnowledge?.apexFieldActivated).toBe(true);
  });

  it('preserves canonical Antarctic visibility until a human actually owns the sector', () => {
    const engine = new WorldEngineV2(96_413);
    const sectorId = 'drake-entry';
    const sector = engine.state.polarEndgame.sectors[sectorId]!;
    const territory = engine.state.territories[territoryIdV2(sectorId)]!;
    sector.status = 'hidden';
    territory.owner = 'rai';
    expect(mapPolarEndgameSnapshotV2(engine.state).sectors[sectorId]?.status).toBe('hidden');

    sector.status = 'available';
    expect(mapPolarEndgameSnapshotV2(engine.state).sectors[sectorId]?.status).toBe('available');

    territory.owner = engine.state.humanPlayerId;
    expect(mapPolarEndgameSnapshotV2(engine.state).sectors[sectorId]).toMatchObject({
      status: 'secured',
      securedBy: engine.state.humanPlayerId,
    });
  });
});
