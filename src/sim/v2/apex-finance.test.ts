import { describe, expect, it } from 'vitest';
import {
  BASE_COMMANDER_FORCE_V1,
  createCommanderProfileV1,
  resolveCommanderForceInitializationV1,
  resolveCountryLoadoutV1,
} from '../../meta/commanderProfile';
import { treasuryTopbarPresentationV2 } from '../../ui/WorldUIV2';
import {
  AI_EXCESS_TREASURY_WEEKLY_REVENUE_CAP,
  V2_RULES_VERSION,
  clamp,
  effectiveTreasuryReserveTargetV2,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  initializeCommanderForceV2,
  processCommanderForcesV2,
  selectCommanderEconomyProjectionV2,
  selectCommanderTreasuryReserveStatusV2,
} from './commanderForce';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2, processFinanceMilitaryV2 } from './economy';
import { nationalAiTreasuryPolicyV2 } from './nationalAi';
import {
  canonicalStateHashV2,
  createSaveV2,
  loadSaveV2,
} from './persistence';
import { synchronizeRunProgressionRosterV2 } from './runProgression';
import {
  selectNationalEconomyV2,
  selectNationalIqViewV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, type PlayerId, type WorldStateV2 } from './types';

const LEGACY_APEX_FINANCE_RULES = 'frontier-command-v2.72-run-progression';
const LEGACY_PRIVATE_RESERVE_RULES = 'frontier-command-v2.73-apex-finance';

function baseApexInitialization(countryId: PlayerId) {
  return resolveCommanderForceInitializationV1(resolveCountryLoadoutV1(
    createCommanderProfileV1(73, `finance-${countryId}`),
    countryId,
  ));
}

function makeHuman(state: WorldStateV2, playerIds: PlayerId[]): void {
  state.humanPlayerIds = [...playerIds].sort((left, right) => left.localeCompare(right));
  state.humanPlayerId = state.humanPlayerIds[0]!;
  synchronizeRunProgressionRosterV2(state);
}

function addBaseApex(state: WorldStateV2, playerId: PlayerId): void {
  expect(initializeCommanderForceV2(
    state,
    WORLD_CONTENT_V2,
    playerId,
    baseApexInitialization(playerId),
  )).toEqual({ accepted: true });
}

function recurringProgramEnvelope(state: WorldStateV2, playerId: PlayerId): number {
  const plan = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, playerId);
  return plan.military + plan.research + plan.development;
}

describe('lean shared EONSCAR and empire finance', () => {
  it('makes base EONSCAR free and transfers its full modest output to Greenland', () => {
    const state = createWorldStateV2(73_001, WORLD_CONTENT_V2);
    const greenland = nationIdV2('grl');
    makeHuman(state, [greenland]);
    addBaseApex(state, greenland);

    const force = state.commanderForces[greenland]!;
    const projection = selectCommanderEconomyProjectionV2(state, greenland)!;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, greenland);
    const transferShareOfTaxRevenue = projection.weeklyEmpireTransfer / finance.revenue;

    expect(force.economy.treasury).toBe(BASE_COMMANDER_FORCE_V1.treasury);
    expect(force.economy.annualOutput).toBe(BASE_COMMANDER_FORCE_V1.annualOutput);
    expect(projection.weeklyIncome * 52).toBeCloseTo(0.015, 6);
    expect(projection.weeklyUpkeepDue).toBe(0);
    expect(projection.weeklyInvestment).toBe(0);
    expect(projection.weeklyEmpireTransfer).toBe(projection.weeklyIncome);
    expect(finance.apexContribution).toBe(projection.weeklyIncome);
    expect(transferShareOfTaxRevenue).toBeGreaterThanOrEqual(0.02);
    expect(transferShareOfTaxRevenue).toBeLessThanOrEqual(0.03);
  });

  it('shows a reachable GDP-aware reserve for weak, median and major countries', () => {
    const state = createWorldStateV2(73_002, WORLD_CONTENT_V2);
    for (const country of ['grl', 'ury', 'usa'] as const) {
      const playerId = nationIdV2(country);
      const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, playerId);
      const economy = selectNationalEconomyV2(state, WORLD_CONTENT_V2, playerId);
      const coverage = state.players[playerId]!.treasury / finance.reserveTarget;
      const topbar = treasuryTopbarPresentationV2(
        state.players[playerId]!.treasury,
        finance.net,
        finance.reserveTarget,
      );

      expect(finance.reserveTarget).toBeGreaterThanOrEqual(economy.controlledOutput * 0.10 - 1e-9);
      expect(coverage).toBeGreaterThan(0);
      expect(coverage).toBeLessThan(2);
      expect(topbar.reserveFill).not.toBe('999%+');
    }
  });

  it('uses one combined target and books EONSCAR exactly once in net and closing cash', () => {
    const state = createWorldStateV2(73_003, WORLD_CONTENT_V2);
    const greenland = nationIdV2('grl');
    makeHuman(state, [greenland]);
    const withoutApex = selectWeeklyFinanceBreakdownV2(
      state,
      WORLD_CONTENT_V2,
      greenland,
    );
    addBaseApex(state, greenland);
    const force = state.commanderForces[greenland]!;
    const plan = selectWeeklyFinanceBreakdownV2(
      state,
      WORLD_CONTENT_V2,
      greenland,
    );
    const openingTreasury = state.players[greenland]!.treasury;
    expect(selectCommanderTreasuryReserveStatusV2(state, greenland)).toEqual({
      treasury: 0,
      reserveTarget: 0,
      reserveShortfall: 0,
      reserveSurplus: 0,
    });
    expect(plan.apexContribution).toBeCloseTo(force.economy.annualOutput / 52, 9);
    expect(plan.net).toBeCloseTo(
      plan.revenue + plan.apexContribution + plan.ceasefireIncome
        - plan.expenses,
      // Public ledger fields are independently canonicalized to six decimals.
      5,
    );
    expect(plan.net - withoutApex.net).toBeGreaterThan(0);
    expect(plan.net - withoutApex.net).toBeLessThanOrEqual(plan.apexContribution + 1e-9);
    expect(plan.closingTreasury).toBeCloseTo(openingTreasury + plan.net, 8);
    expect(plan.reserveTarget).toBeGreaterThanOrEqual(withoutApex.reserveTarget);
    const economy = selectNationalEconomyV2(state, WORLD_CONTENT_V2, greenland);
    const combinedWeekly = plan.revenue + plan.apexContribution;
    const policy = nationalAiTreasuryPolicyV2(
      selectNationalIqViewV2(state, WORLD_CONTENT_V2, greenland).score,
      0,
      clamp(Math.log10(combinedWeekly + 1) / 2, 0, 1),
    );
    expect(plan.reserveTarget).toBeCloseTo(effectiveTreasuryReserveTargetV2(
      combinedWeekly,
      policy.reserveWeeks,
      economy.controlledOutput + force.economy.annualOutput,
    ).effectiveTarget, 6);

    const plans = createFinancePlansV2(state, WORLD_CONTENT_V2);
    processFinanceMilitaryV2(state, WORLD_CONTENT_V2, plans);
    expect(state.players[greenland]!.treasury).toBeCloseTo(plan.closingTreasury, 8);
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(state.players[greenland]!.treasury).toBeCloseTo(plan.closingTreasury, 8);
    expect(force.economy.treasury).toBe(0);
  });

  it('keeps Front Projection Pulse-only while base EONSCAR income joins the shared target', () => {
    const state = createWorldStateV2(73_033, WORLD_CONTENT_V2);
    const greenland = nationIdV2('grl');
    makeHuman(state, [greenland]);
    const withoutApex = selectWeeklyFinanceBreakdownV2(
      state,
      WORLD_CONTENT_V2,
      greenland,
    );
    const loadout = resolveCountryLoadoutV1(
      createCommanderProfileV1(73_033, 'military-only-talents'),
      greenland,
    );
    const baseline = resolveCommanderForceInitializationV1(loadout);
    loadout.commanderTalents['treasury-reserve'] = 15;
    const initialization = resolveCommanderForceInitializationV1(loadout);
    expect(initialization.annualOutput).toBe(baseline.annualOutput);
    expect(initialization.treasury).toBe(baseline.treasury);
    expect(initialization.shield.pulseProjectionRetention)
      .toBeGreaterThan(baseline.shield.pulseProjectionRetention!);
    expect(initialization.shield.pulseAttack).toBe(baseline.shield.pulseAttack);
    expect(initialization.attackMultiplier).toBe(baseline.attackMultiplier);
    expect(initialization.defenseMultiplier).toBe(baseline.defenseMultiplier);
    expect(initialization.supplyStock).toBe(baseline.supplyStock);
    expect(initializeCommanderForceV2(
      state,
      WORLD_CONTENT_V2,
      greenland,
      initialization,
    )).toEqual({ accepted: true });

    const force = state.commanderForces[greenland]!;
    const plan = selectWeeklyFinanceBreakdownV2(
      state,
      WORLD_CONTENT_V2,
      greenland,
    );
    const economy = selectNationalEconomyV2(state, WORLD_CONTENT_V2, greenland);
    const combinedWeekly = plan.revenue + plan.apexContribution;
    const policy = nationalAiTreasuryPolicyV2(
      selectNationalIqViewV2(state, WORLD_CONTENT_V2, greenland).score,
      0,
      clamp(Math.log10(combinedWeekly + 1) / 2, 0, 1),
    );

    expect(force.economy.annualOutput).toBe(initialization.annualOutput);
    expect(plan.apexContribution * 52).toBeCloseTo(initialization.annualOutput, 6);
    expect(plan.reserveTarget).toBeGreaterThan(withoutApex.reserveTarget);
    expect(plan.reserveTarget).toBeCloseTo(effectiveTreasuryReserveTargetV2(
      combinedWeekly,
      policy.reserveWeeks,
      economy.controlledOutput + force.economy.annualOutput,
    ).effectiveTarget, 6);
    state.players[greenland]!.treasury = plan.reserveTarget + force.economy.annualOutput;
    const funded = selectWeeklyFinanceBreakdownV2(
      state,
      WORLD_CONTENT_V2,
      greenland,
    );
    expect(funded.excessCashInvestment).toBeGreaterThan(0);
    expect(funded.research + funded.development + funded.military).toBeGreaterThan(0);
  });

  it('spends no reserve cash at target and shares one bounded surplus envelope above it', () => {
    const state = createWorldStateV2(73_004, WORLD_CONTENT_V2);
    const netherlands = nationIdV2('nld');
    state.players[netherlands]!.research.activeProgram = 'advanced-weapons';
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === netherlands) {
        territory.army.manpower = territory.army.capacity * 0.45;
      }
    }
    state.players[netherlands]!.treasury = 0;
    const probe = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);
    const target = probe.reserveTarget;

    state.players[netherlands]!.treasury = target;
    const atTarget = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);
    const atTargetEnvelope = recurringProgramEnvelope(state, netherlands);
    expect(atTarget.excessCashInvestment).toBe(0);

    state.players[netherlands]!.treasury = target - 0.000001;
    expect(selectWeeklyFinanceBreakdownV2(
      state,
      WORLD_CONTENT_V2,
      netherlands,
    ).excessCashInvestment).toBe(0);

    const economy = selectNationalEconomyV2(state, WORLD_CONTENT_V2, netherlands);
    state.players[netherlands]!.treasury = target + economy.controlledOutput * 0.50;
    const invested = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);
    const investedEnvelope = recurringProgramEnvelope(state, netherlands);
    const trueSurplus = state.players[netherlands]!.treasury - target;

    expect(invested.excessCashInvestment).toBeGreaterThan(0);
    expect(invested.excessCashInvestment).toBeLessThanOrEqual(trueSurplus);
    expect(invested.excessCashInvestment).toBeLessThanOrEqual(
      invested.revenue * AI_EXCESS_TREASURY_WEEKLY_REVENUE_CAP + 1e-9,
    );
    expect(investedEnvelope - atTargetEnvelope)
      .toBeCloseTo(invested.excessCashInvestment, 5);
    expect(invested.fundedArmyUpkeep).toBeGreaterThan(atTarget.fundedArmyUpkeep);
  });

  it('authenticates v2.72/v2.73 multiplayer saves and merges private cash once', () => {
    const state = createWorldStateV2(73_005, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    makeHuman(state, [belgium, netherlands]);
    addBaseApex(state, belgium);
    addBaseApex(state, netherlands);
    state.commanderForces[belgium]!.economy.annualOutput = 1.5;
    state.commanderForces[belgium]!.economy.treasury = 0.008;
    state.commanderForces[netherlands]!.economy.annualOutput = 3;
    state.commanderForces[netherlands]!.economy.treasury = 1_000;
    const belgiumTreasury = state.players[belgium]!.treasury;
    const netherlandsTreasury = state.players[netherlands]!.treasury;

    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    legacy.rulesVersion = LEGACY_APEX_FINANCE_RULES;
    // Current serialization correctly strips private APEX cash. Reconstruct the
    // authenticated legacy payload whose bounded one-time merge is under test.
    legacy.commanderForces[belgium].economy.treasury = 0.008;
    legacy.commanderForces[netherlands].economy.treasury = 1_000;
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);
    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);

    expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
    expect(loaded.commanderForces[belgium]!.economy).toMatchObject({
      annualOutput: 0.015,
      treasury: 0,
    });
    expect(loaded.commanderForces[netherlands]!.economy.annualOutput).toBe(0.03);
    expect(loaded.commanderForces[netherlands]!.economy.treasury).toBe(0);
    expect(loaded.commanderForces[netherlands]!.economy.annualOutput)
      .toBe(loaded.commanderForces[belgium]!.economy.annualOutput * 2);
    expect(loaded.players[belgium]!.treasury).toBeCloseTo(belgiumTreasury + 0.008, 9);
    expect(loaded.players[netherlands]!.treasury).toBeCloseTo(netherlandsTreasury + 0.015, 9);

    const canonical = createSaveV2(loaded, WORLD_CONTENT_V2);
    const reloaded = loadSaveV2(canonical, WORLD_CONTENT_V2);
    const roundTripped = createSaveV2(reloaded, WORLD_CONTENT_V2);
    expect(roundTripped.canonicalStateHash).toBe(canonical.canonicalStateHash);
    expect(reloaded.commanderForces).toEqual(loaded.commanderForces);
    expect(reloaded.players[belgium]!.treasury).toBe(loaded.players[belgium]!.treasury);

    const tampered = structuredClone(legacy);
    tampered.commanderForces[belgium].economy.treasury += 1;
    expect(() => loadSaveV2(tampered as never, WORLD_CONTENT_V2)).toThrow(/hash mismatch/i);

    const privateReserve = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    privateReserve.rulesVersion = LEGACY_PRIVATE_RESERVE_RULES;
    privateReserve.commanderForces[belgium].economy.annualOutput = 0.10;
    privateReserve.commanderForces[belgium].economy.treasury = 0.015;
    privateReserve.canonicalStateHash = canonicalStateHashV2(privateReserve);
    const migrated73 = loadSaveV2(privateReserve as never, WORLD_CONTENT_V2);
    expect(migrated73.commanderForces[belgium].economy).toMatchObject({
      annualOutput: 0.015,
      treasury: 0,
    });
    expect(migrated73.players[belgium].treasury).toBeCloseTo(belgiumTreasury + 0.015, 9);
  });
});
