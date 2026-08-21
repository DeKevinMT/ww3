import { describe, expect, it } from 'vitest';
import { projectMapArmyV2 } from '../../ui/mapArmyProjection';
import { WorldEngineV2 } from './WorldEngineV2';
import { nationIdV2, territoryIdV2 } from './types';

describe('map military projection', () => {
  it('shows the same higher local power when an identical army gains veterans', () => {
    const engine = new WorldEngineV2(8_801);
    const belgium = nationIdV2('bel');
    const territoryId = territoryIdV2('bel');
    const territory = engine.territoriesOf(belgium)[0]!;
    const before = projectMapArmyV2(engine, territoryId, territory);

    territory.army.veteranManpower = territory.army.manpower;
    territory.army.veteranExperience = 25;
    const after = projectMapArmyV2(engine, territoryId, territory);

    expect(after.power).toBe(engine.territoryPower(territoryId));
    expect(after.power).toBeGreaterThan(before.power);
    expect(after.combatStrength).toBeGreaterThan(before.combatStrength);
  });
});
