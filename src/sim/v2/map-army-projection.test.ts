import { describe, expect, it, vi } from 'vitest';
import { projectMapArmyV2 } from '../../ui/mapArmyProjection';
import { createMapEngineAdapter, createMapSnapshot } from '../../ui/WorldUIV2';
import { WorldEngineV2 } from './WorldEngineV2';
import { nationIdV2, territoryIdV2 } from './types';

describe('map military projection', () => {
  it('shows higher local quality without changing headcount', () => {
    const engine = new WorldEngineV2(8_801);
    const belgium = nationIdV2('bel');
    const territoryId = territoryIdV2('bel');
    const territory = engine.territoriesOf(belgium)[0]!;
    const before = projectMapArmyV2(engine, territoryId, territory);

    engine.state.territories[territoryId].army.baseAttack *= 1.05;
    engine.state.territories[territoryId].army.baseDefense *= 1.05;
    const after = projectMapArmyV2(engine, territoryId, territory);

    expect(after.power).toBe(engine.territoryPower(territoryId));
    expect(after.power).toBeGreaterThan(before.power);
    expect(after.combatStrength).toBeCloseTo(before.combatStrength, 8);
    expect(after.attack).toBeGreaterThan(before.attack);
    expect(after.defense).toBeGreaterThan(before.defense);
  });

  it('builds a whole map from one shared military-quality snapshot', () => {
    const engine = new WorldEngineV2(8_802);
    const snapshot = vi.spyOn(engine, 'militaryBaseSnapshot');
    const attack = vi.spyOn(engine, 'effectiveAttack');
    const defense = vi.spyOn(engine, 'effectiveDefense');
    const projected = createMapSnapshot(engine);
    const territoryCount = Object.keys(engine.state.territories).length;

    expect(Object.keys(projected.territories)).toHaveLength(territoryCount);
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(attack).toHaveBeenCalledTimes(territoryCount);
    expect(defense).toHaveBeenCalledTimes(territoryCount);
    expect(attack.mock.calls.every((call) => call[2] === snapshot.mock.results[0]?.value)).toBe(true);
    expect(defense.mock.calls.every((call) => call[2] === snapshot.mock.results[0]?.value)).toBe(true);
  });

  it('highlights the local viewer without changing the canonical multiplayer host', () => {
    const engine = new WorldEngineV2(8_803);
    const usa = nationIdV2('usa');
    const belgium = nationIdV2('bel');

    expect(engine.chooseCountry(usa).accepted).toBe(true);
    expect(engine.configureHumanPlayers([usa, belgium], usa).accepted).toBe(true);
    expect(engine.setViewerPlayerId(belgium).accepted).toBe(true);

    const projected = createMapSnapshot(engine);
    expect(engine.state.humanPlayerId).toBe(usa);
    expect(projected.humanPlayerId).toBe(belgium);
    expect(projected.humanPlayerIds).toEqual([belgium, usa].sort());

    const adapter = createMapEngineAdapter(
      engine,
      () => engine.globalRanking(),
      new Map([[usa, 'Alice'], [belgium, 'Bob']]),
    );
    adapter.refreshSnapshot?.();
    expect(adapter.player(usa)).toMatchObject({ isHuman: true, controllerName: 'Alice' });
    expect(adapter.player(belgium)).toMatchObject({ isHuman: true, controllerName: 'Bob' });
    expect(adapter.player(nationIdV2('can'))).toMatchObject({ isHuman: false, controllerName: undefined });
  });
});
