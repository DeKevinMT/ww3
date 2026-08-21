import { describe, expect, it } from 'vitest';
import { projectMapArmyV2 } from '../../ui/mapArmyProjection';
import { WorldEngineV2 } from './WorldEngineV2';
import { nationIdV2, territoryIdV2 } from './types';

describe('map military projection', () => {
  it('shows higher local quality but unchanged headcount when the empire gains combat experience', () => {
    const engine = new WorldEngineV2(8_801);
    const belgium = nationIdV2('bel');
    const territoryId = territoryIdV2('bel');
    const territory = engine.territoriesOf(belgium)[0]!;
    const before = projectMapArmyV2(engine, territoryId, territory);

    engine.state.players[belgium].combatExperience = 25;
    const after = projectMapArmyV2(engine, territoryId, territory);

    expect(after.power).toBe(engine.territoryPower(territoryId));
    expect(after.power).toBeGreaterThan(before.power);
    expect(after.combatStrength).toBeCloseTo(before.combatStrength, 8);
    expect(after.attack).toBeGreaterThan(before.attack);
    expect(after.defense).toBeGreaterThan(before.defense);
  });
});
