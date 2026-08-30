import { describe, expect, it } from 'vitest';
import { nextRandom } from '../../game/random';
import {
  battleDamageVarianceV2,
  COMBAT_DAMAGE_EFFECTIVENESS,
  COMBAT_POWER_RATIO_EXPONENT,
  combatDefenseEffectV2,
  AI_FIRST_WAR_TICK,
  AI_GLOBAL_WAR_COOLDOWN,
  AI_REGIONAL_ESCALATION_COOLDOWN,
  AI_REGIONAL_ESCALATION_EXTRA_WAR_CAP,
  aiActiveWarCapV2,
  CONQUEST_CAPTURE_GUARD_MAX_TRANSFER_SHARE,
  DEFENDER_POSITION_MULTIPLIER,
  STALE_WAR_TICKS,
  TERRAIN_DEFENSE_MODIFIER,
  round,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  stateTerritoryArmyCapacityTargetV2,
  stateTerritoryArmySupportCeilingV2,
  synchronizeArmyCapacityV2,
} from './capacity';
import { WORLD_CONTENT_V2, type NationContentV2, type TerritoryContentV2, type WorldContentV2 } from './content';
import { invariantErrorsV2 } from './invariants';
import { planAiCommandsV2 } from './ai';
import { selectEffectiveAttackV2, selectEffectiveDefenseV2 } from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
  type WarStateV2,
  type WorldStateV2,
} from './types';
import { resolveBattlePulseV2, supplyFactorV2 } from './war';
import { WorldEngineV2 } from './WorldEngineV2';

const A = nationIdV2('nation-a');
const B = nationIdV2('nation-b');
const A_HOME = territoryIdV2('a-home');
const B_FRONT = territoryIdV2('b-front');
const B_HOME = territoryIdV2('b-home');

function nation(id: PlayerId, capitalId: TerritoryId, name: string): NationContentV2 {
  return {
    id,
    iso3: String(id).slice(-3).toUpperCase(),
    initialCapitalId: capitalId,
    name,
    shortName: name,
    color: id === A ? 0x22aaff : 0xff5533,
    cssColor: id === A ? '#22aaff' : '#ff5533',
    darkColor: '#101820',
    sigil: id === A ? 'A' : 'B',
    profile: 'acceptance fixture',
    influenceTags: [],
    iqScore: 100,
    militaryQuality: 1,
    nuclearPowerLevel: 0,
    ambition: 0.5,
    continent: 'Fixture',
    subregion: 'Fixture',
    real: {
      population: 10,
      populationGrowthRate: 0,
      deathRatePerThousand: 8,
      foodInsecurityRate: 0,
      landArea: 10_000,
      gdp: 100,
      defenceSpending: 2,
      powerIndex: 50,
      researchCapacity: 2,
    },
    balance: { initialManpower: 1 },
  };
}

function territory(
  id: TerritoryId,
  initialOwnerId: PlayerId,
  name: string,
  connections: TerritoryContentV2['connections'],
): TerritoryContentV2 {
  return {
    id,
    initialOwnerId,
    name,
    regionId: 'fixture',
    terrain: 'plains',
    baseline: {
      population: 10,
      populationGrowthRate: 0,
      deathRatePerThousand: 8,
      foodInsecurityRate: 0,
      landArea: 10_000,
      gdp: 100,
      defenceSpending: 2,
      powerIndex: 50,
      researchCapacity: 2,
    },
    connections,
  };
}

const FIXTURE_CONTENT: WorldContentV2 = {
  nationIds: [A, B],
  territoryIds: [A_HOME, B_FRONT, B_HOME],
  nations: {
    [A]: nation(A, A_HOME, 'Alpha'),
    [B]: nation(B, B_HOME, 'Beta'),
  } as Record<PlayerId, NationContentV2>,
  territories: {
    [A_HOME]: territory(A_HOME, A, 'Alpha Home', [{ targetId: B_FRONT, kind: 'land' }]),
    [B_FRONT]: territory(B_FRONT, B, 'Beta Front', [
      { targetId: A_HOME, kind: 'land' },
      { targetId: B_HOME, kind: 'land' },
    ]),
    [B_HOME]: territory(B_HOME, B, 'Beta Home', [{ targetId: B_FRONT, kind: 'land' }]),
  } as Record<TerritoryId, TerritoryContentV2>,
};

function war(state: WorldStateV2): WarStateV2 {
  const value: WarStateV2 = {
    id: 'war-fixture',
    attackerId: A,
    defenderId: B,
    startedTick: 0,
    lastBattleTick: state.tick,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
  };
  state.wars = [value];
  return value;
}

function operation(state: WorldStateV2, sourceId = A_HOME, targetId = B_FRONT): FrontOperationV2 {
  return {
    commanderId: A,
    sourceId,
    targetId,
    doctrine: 'pressure',
    access: 'land',
    startedTick: state.tick,
    lastBattleTick: state.tick,
    holdUntilTick: state.tick + 8,
    momentum: 0,
  };
}

function pulseFixture(options: { sourceHp?: number; sourceMaxHp?: number; targetHp?: number; targetMaxHp?: number } = {}) {
  const state = createWorldStateV2(7, FIXTURE_CONTENT);
  state.tick = 2;
  const source = state.territories[A_HOME];
  const target = state.territories[B_FRONT];
  source.army = {
    ...source.army,
    manpower: options.sourceHp ?? 100,
    capacity: options.sourceMaxHp ?? 100,
  };
  target.army = {
    ...target.army,
    manpower: options.targetHp ?? 100,
    capacity: options.targetMaxHp ?? 100,
  };
  const currentWar = war(state);
  const currentOperation = operation(state);
  currentWar.attackerOperations = [currentOperation];
  return { state, source, target, currentWar, currentOperation };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

const configuredSoakSeeds = Number.parseInt(process.env.V2_SOAK_SEEDS ?? '0', 10);
const runWorldSoak = Number.isFinite(configuredSoakSeeds) && configuredSoakSeeds > 0 ? it : it.skip;

function runWorldSoakSeed(seed: number): number {
  const engine = new WorldEngineV2(seed, WORLD_CONTENT_V2);
  const seenWars = new Set<string>();
  const warStartTicks: number[] = [];
  let captures = 0;
  engine.subscribe((_state, change) => {
    if (change.battle?.conquered) captures += 1;
  });

  for (let expectedTick = 1; expectedTick <= 520 && !engine.state.gameOver; expectedTick += 1) {
    engine.step();
    const living = Object.keys(engine.state.players).filter((playerId) => (
      Object.values(engine.state.territories).some((territoryState) => territoryState.owner === playerId)
    )).length;
    const activeWarCap = aiActiveWarCapV2(living, engine.state.tick);
    expect(engine.state.wars.length, `active-war cap seed ${seed} tick ${engine.state.tick}`)
      .toBeLessThanOrEqual(activeWarCap + AI_REGIONAL_ESCALATION_EXTRA_WAR_CAP);

    const participantCounts = new Map<PlayerId, number>();
    const pairs = new Set<string>();
    const coalition = new Set(engine.globalResistance().memberIds);
    for (const activeWar of engine.state.wars) {
      const pair = [activeWar.attackerId, activeWar.defenderId].sort().join(':');
      expect(pairs.has(pair), `duplicate pair ${pair}, seed ${seed}`).toBe(false);
      pairs.add(pair);
      participantCounts.set(activeWar.attackerId, (participantCounts.get(activeWar.attackerId) ?? 0) + 1);
      participantCounts.set(activeWar.defenderId, (participantCounts.get(activeWar.defenderId) ?? 0) + 1);
      expect(engine.state.tick - activeWar.lastBattleTick, `stale war ${activeWar.id}, seed ${seed}`).toBeLessThan(STALE_WAR_TICKS);
      if (activeWar.battles === 0) {
        expect(engine.state.tick - activeWar.startedTick, `zero-battle war ${activeWar.id}, seed ${seed}`).toBeLessThan(STALE_WAR_TICKS);
      }
      if (!seenWars.has(activeWar.id)) {
        seenWars.add(activeWar.id);
        if (activeWar.startedTick > 0) {
          warStartTicks.push(activeWar.startedTick);
          expect(activeWar.startedTick, `early AI war ${activeWar.id}, seed ${seed}`).toBeGreaterThanOrEqual(AI_FIRST_WAR_TICK);
        }
      }
    }
    for (const [playerId, count] of participantCounts) {
      if (playerId === engine.state.humanPlayerId) continue;
      expect(count, `front limit for ${playerId}, seed ${seed}`).toBeLessThanOrEqual(3);
    }
    // WorldEngineV2.step() asserts the complete invariant set at every tick boundary.
  }

  for (let index = 1; index < warStartTicks.length; index += 1) {
    expect(warStartTicks[index]! - warStartTicks[index - 1]!, `global pacing seed ${seed}`)
      .toBeGreaterThanOrEqual(AI_REGIONAL_ESCALATION_COOLDOWN);
  }
  return captures;
}

describe('V2 combat and absorption acceptance', () => {
  it('uses terrain and supply without a hidden universal defender multiplier', () => {
    const { state, currentWar, currentOperation, source, target } = pulseFixture();
    const rng = { rngState: state.rngState };
    const varianceA = battleDamageVarianceV2(nextRandom(rng), 0);
    const attack = selectEffectiveAttackV2(state, FIXTURE_CONTENT, A, source.army);
    const defense = selectEffectiveDefenseV2(state, FIXTURE_CONTENT, B, target.army);
    const attackerSupply = supplyFactorV2(state, FIXTURE_CONTENT, A, A_HOME, false);
    const defenderSupply = supplyFactorV2(state, FIXTURE_CONTENT, B, B_FRONT, false);
    const attackPressure = source.army.manpower * attack * attackerSupply;
    const expectedShield = target.army.manpower * combatDefenseEffectV2(defense, attack)
      * DEFENDER_POSITION_MULTIPLIER
      * TERRAIN_DEFENSE_MODIFIER.plains * defenderSupply;
    const expectedRate = Math.max(0, COMBAT_DAMAGE_EFFECTIVENESS * Math.pow(
      attackPressure / expectedShield,
      COMBAT_POWER_RATIO_EXPONENT,
    ) * varianceA);
    const expectedDamage = Math.min(
      target.army.manpower,
      target.army.manpower * expectedRate,
    );

    const event = resolveBattlePulseV2(state, FIXTURE_CONTENT, currentWar, currentOperation)!;
    expect(DEFENDER_POSITION_MULTIPLIER).toBe(1);
    expect(event.defenderPower).toBe(round(expectedShield));
    expect(event.defenderLosses).toBe(round(expectedDamage, 9));
  });

  it('keeps ownership unchanged after a failed pressure pulse', () => {
    const { state, currentWar, currentOperation, target } = pulseFixture({ sourceHp: 5, sourceMaxHp: 100 });
    const event = resolveBattlePulseV2(state, FIXTURE_CONTENT, currentWar, currentOperation)!;
    expect(event.conquered).toBe(false);
    expect(target.owner).toBe(B);
  });

  it.each([
    ['living defender', { sourceHp: 50, sourceMaxHp: 100, targetHp: 100, targetMaxHp: 100 }, false],
    ['zero defender after a decisive pulse', { sourceHp: 50, sourceMaxHp: 100, targetHp: 0, targetMaxHp: 100 }, true],
    ['failed attacker survival', { sourceHp: 0, sourceMaxHp: 60, targetHp: 0, targetMaxHp: 100 }, false],
  ] as const)('enforces the manpower-only capture guards: %s', (_label, options, captured) => {
    const { state, currentWar, currentOperation, target } = pulseFixture(options);
    const event = resolveBattlePulseV2(state, FIXTURE_CONTENT, currentWar, currentOperation)!;
    expect(event.conquered).toBe(captured);
    expect(target.owner).toBe(captured ? A : B);
  });

  it('absorbs population/economy, transfers a conquest guard, and pays no spoils before elimination', () => {
    const { state, currentWar, currentOperation, source, target } = pulseFixture({
      sourceHp: 100,
      sourceMaxHp: 100,
      targetHp: 0,
      targetMaxHp: 200,
    });
    state.players[A].treasury = 10;
    state.players[B].treasury = 40;
    target.population = 8;
    target.economy = 80;
    const before = {
      sourceManpower: source.army.manpower,
      population: target.population,
      economy: target.economy,
      attackerTreasury: state.players[A].treasury,
      defenderTreasury: state.players[B].treasury,
    };

    const event = resolveBattlePulseV2(state, FIXTURE_CONTENT, currentWar, currentOperation)!;
    expect(event.conquered).toBe(true);
    expect(target.owner).toBe(A);
    expect(target.population).toBe(round(before.population - event.populationLoss));
    expect(target.economy).toBe(round(before.economy - event.economyLoss));
    expect(target.integration).toBe(0.10);
    expect(target.army.capacity).toBeCloseTo(
      stateTerritoryArmyCapacityTargetV2(state, FIXTURE_CONTENT, B_FRONT, A),
      8,
    );
    expect(source.army.manpower + target.army.manpower)
      .toBeCloseTo(before.sourceManpower - event.attackerLosses, 6);
    expect(target.army.manpower).toBeCloseTo(Math.min(
      before.sourceManpower * CONQUEST_CAPTURE_GUARD_MAX_TRANSFER_SHARE,
      stateTerritoryArmySupportCeilingV2(state, FIXTURE_CONTENT, B_FRONT, A),
    ), 8);
    expect(event.treasurySeized).toBe(0);
    expect(state.players[A].treasury).toBe(before.attackerTreasury);
    expect(state.players[B].treasury).toBe(before.defenderTreasury);
  });

  it('awards only exact final-elimination treasury spoils once', () => {
    const { state, currentWar, currentOperation, target } = pulseFixture({
      sourceHp: 50,
      sourceMaxHp: 100,
      targetHp: 0,
      targetMaxHp: 200,
    });
    state.territories[B_HOME].owner = A;
    state.territories[B_HOME].coreOwner = A;
    state.territories[B_HOME].integration = 1;
    state.players[B].capitalId = B_FRONT;
    state.players[A].treasury = 10;
    state.players[B].treasury = 40;

    const event = resolveBattlePulseV2(state, FIXTURE_CONTENT, currentWar, currentOperation)!;
    expect(event.conquered).toBe(true);
    expect(event.treasurySeized).toBe(10);
    expect(state.players[A].treasury).toBe(20);
    expect(state.players[B].treasury).toBe(0);
    expect(target.army.capacity).toBeCloseTo(
      stateTerritoryArmyCapacityTargetV2(state, FIXTURE_CONTENT, B_FRONT, A),
      8,
    );
  });
});

describe('V2 determinism, saves, and invariants acceptance', () => {
  it('produces the same canonical hash after every tick for identical seeds', () => {
    const left = new WorldEngineV2(91, FIXTURE_CONTENT);
    const right = new WorldEngineV2(91, FIXTURE_CONTENT);
    expect(left.canonicalHash()).toBe(right.canonicalHash());
    const initialHash = left.canonicalHash();
    for (let tick = 1; tick <= 120; tick += 1) {
      try {
        left.step();
      } catch (error) {
        throw new Error(`fixture failed at tick ${tick}: ${JSON.stringify(left.state.territories[B_FRONT])}\n${String(error)}`);
      }
      right.step();
      expect(left.canonicalHash(), `hash at tick ${tick}`).toBe(right.canonicalHash());
    }
    expect(left.canonicalHash()).not.toBe(initialHash);
  });

  it('round-trips an active war/research save and preserves the next 100 hashes', () => {
    const continuous = new WorldEngineV2(92, FIXTURE_CONTENT);
    continuous.state.tick = 51;
    synchronizeArmyCapacityV2(continuous.state, FIXTURE_CONTENT);
    continuous.state.players[A].research.progress['advanced-weapons'] = 3.25;
    const currentWar = war(continuous.state);
    currentWar.startedTick = 40;
    currentWar.lastBattleTick = 50;
    const serialized = continuous.save();
    const restored = WorldEngineV2.fromSave(serialized, FIXTURE_CONTENT);
    expect(restored.canonicalHash()).toBe(continuous.canonicalHash());
    for (let offset = 1; offset <= 100; offset += 1) {
      continuous.step();
      restored.step();
      expect(restored.canonicalHash(), `post-load hash +${offset}`).toBe(continuous.canonicalHash());
    }

    const tampered = JSON.parse(serialized) as Record<string, unknown>;
    tampered.tick = Number(tampered.tick) + 1;
    expect(() => WorldEngineV2.fromSave(tampered as never, FIXTURE_CONTENT)).toThrow(/hash mismatch/i);
  });

  it('reports canonical state bloat, retired control state, and invalid force state', () => {
    const state = createWorldStateV2(93, FIXTURE_CONTENT);
    (state.players[A] as unknown as Record<string, unknown>).stability = 0.8;
    (state.territories[A_HOME] as unknown as Record<string, unknown>).fortification = 3;
    state.territories[A_HOME].army.manpower = -1;
    (state.territories[B_FRONT] as unknown as Record<string, unknown>).control = { controller: B, share: 1 };
    const errors = invariantErrorsV2(state, FIXTURE_CONTENT);
    expect(errors).toContain(`Nation ${A} has non-canonical keys.`);
    expect(errors).toContain(`Territory ${A_HOME} has non-canonical keys.`);
    expect(errors).toContain(`Territory ${A_HOME} has invalid canonical values.`);
    expect(errors).toContain(`Territory ${B_FRONT} has non-canonical keys.`);
  });
});

describe('V2 AI pacing and world soak acceptance', () => {
  it('honors the first-war and global-cooldown hard gates before probability is considered', () => {
    const beforeFirstWar = createWorldStateV2(101, WORLD_CONTENT_V2);
    beforeFirstWar.tick = AI_FIRST_WAR_TICK - 4;
    expect(planAiCommandsV2(beforeFirstWar, WORLD_CONTENT_V2).filter((command) => command.type === 'declare-war')).toHaveLength(0);

    const coolingDown = createWorldStateV2(102, WORLD_CONTENT_V2);
    coolingDown.tick = 56;
    coolingDown.aiEscalation.lastWarStartTick = coolingDown.tick - AI_GLOBAL_WAR_COOLDOWN + 1;
    expect(planAiCommandsV2(coolingDown, WORLD_CONTENT_V2).filter((command) => command.type === 'declare-war')).toHaveLength(0);
  });

  it('plans at most one new start per decision and never exceeds the global active-war cap', () => {
    const state = createWorldStateV2(103, WORLD_CONTENT_V2);
    state.tick = 56;
    state.aiEscalation.lastWarStartTick = -1_000_000;
    const ids = WORLD_CONTENT_V2.nationIds.filter((id) => id !== state.humanPlayerId);
    const activeWarCap = aiActiveWarCapV2(ids.length + 1, state.tick);
    state.wars = Array.from({ length: activeWarCap }, (_, index) => ({
      id: `war-cap-${index}`,
      attackerId: ids[index * 2]!,
      defenderId: ids[index * 2 + 1]!,
      startedTick: 48,
      lastBattleTick: 54,
      warScore: 0,
      battles: 1,
      attackerLosses: 0,
      defenderLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [],
      defenderOperations: [],
    }));
    expect(planAiCommandsV2(state, WORLD_CONTENT_V2).filter((command) => command.type === 'declare-war')).toHaveLength(0);

    state.wars.pop();
    const declarations = planAiCommandsV2(state, WORLD_CONTENT_V2).filter((command) => command.type === 'declare-war');
    expect(declarations.length).toBeLessThanOrEqual(1);
    for (const declaration of declarations) {
      if (declaration.type !== 'declare-war') continue;
      expect(state.wars.some((war) => (
        (war.attackerId === declaration.attackerId && war.defenderId === declaration.defenderId)
        || (war.attackerId === declaration.defenderId && war.defenderId === declaration.attackerId)
      ))).toBe(false);
      expect(state.wars.filter((war) => war.attackerId === declaration.attackerId || war.defenderId === declaration.attackerId).length).toBeLessThan(2);
    }
  });

  const captureCounts: number[] = [];
  // Keep each seed in its own task so long soak runs continue reporting progress
  // and never hit Vitest's worker RPC heartbeat timeout.
  for (let seed = 1; seed <= configuredSoakSeeds; seed += 1) {
    runWorldSoak(`keeps invariants, pacing, and stale wars for seed ${seed} x 520`, () => {
      captureCounts.push(runWorldSoakSeed(seed));
    }, 300_000);
  }
  runWorldSoak('meets 200-seed capture incidence and median targets', () => {
    expect(captureCounts).toHaveLength(configuredSoakSeeds);
    if (configuredSoakSeeds !== 200) return;
    expect(captureCounts.filter((captures) => captures > 0).length / configuredSoakSeeds).toBeGreaterThanOrEqual(0.95);
    expect(median(captureCounts)).toBeGreaterThanOrEqual(8);
    expect(median(captureCounts)).toBeLessThanOrEqual(60);
  });
});
