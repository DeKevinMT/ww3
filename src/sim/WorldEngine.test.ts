import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  COUNTRY_BY_ID,
  STRATEGIC_SEA_ROUTE_PAIRS,
  TERRITORIES,
  TERRITORY_BY_ID,
  isSeaConnection,
  validateMap,
} from '../game/data/worldMap';
import { BUDGET_PRESETS, DEFENSIVE_POSITION_BONUS, WorldEngine, worldInvariantErrors } from './WorldEngine';

function deterministicSnapshot(engine: WorldEngine): string {
  return JSON.stringify(engine.state);
}

describe('strategic world simulation', () => {
  it('keeps every strategically relevant country as a connected map territory', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(165);
    expect(COUNTRIES.length).toBeLessThan(180);
    expect(TERRITORIES).toHaveLength(COUNTRIES.length);
    expect(COUNTRY_BY_ID.bel?.englishName).toBe('Belgium');
    expect(COUNTRY_BY_ID.usa?.englishName).toContain('United States');
    expect(COUNTRY_BY_ID.vat).toBeUndefined();
    expect(COUNTRY_BY_ID.vut).toBeUndefined();
    expect(COUNTRY_BY_ID.pyf).toBeUndefined();
    expect(validateMap()).toEqual([]);
  });

  it('geeft met dezelfde seed exact dezelfde wereldgeschiedenis', () => {
    const first = new WorldEngine(20260817);
    const second = new WorldEngine(20260817);

    first.step(16);
    second.step(16);

    expect(deterministicSnapshot(first)).toBe(deterministicSnapshot(second));
  });

  it('zet reële bevolking, economie en defensie om in geloofwaardige startkracht', () => {
    const engine = new WorldEngine(42);
    const unitedStates = engine.state.territories.usa!;
    const belgium = engine.state.territories.bel!;

    expect(COUNTRY_BY_ID.usa!.population).toBeGreaterThan(COUNTRY_BY_ID.bel!.population);
    expect(COUNTRY_BY_ID.usa!.gdp).toBeGreaterThan(COUNTRY_BY_ID.bel!.gdp);
    expect(COUNTRY_BY_ID.usa!.military).toBeGreaterThan(COUNTRY_BY_ID.bel!.military);
    expect(unitedStates.force.maxHp).toBeGreaterThan(belgium.force.maxHp);
    expect(unitedStates.force.attack).toBeGreaterThan(belgium.force.attack);
    expect(unitedStates.economy).toBeGreaterThan(belgium.economy);
  });

  it('laat de speler bij de start precies één land kiezen', () => {
    const engine = new WorldEngine(42);
    expect(engine.chooseCountry('jpn')).toBe(true);
    expect(engine.state.humanPlayerId).toBe('jpn');
    expect(engine.player('jpn')?.isHuman).toBe(true);
    expect(engine.state.players.filter((player) => player.isHuman)).toHaveLength(1);
  });

  it('geeft een gekozen land geen verborgen gevechts- of capaciteitsbonus', () => {
    const engine = new WorldEngine(43);
    const force = engine.state.territories.btn!.force;
    const before = {
      capacity: force.maxHp,
      attack: engine.effectiveAttack('btn', force),
      defense: engine.effectiveDefense('btn', force),
      recovery: engine.effectiveRecovery('btn', force),
    };
    expect(engine.chooseCountry('btn')).toBe(true);
    expect(engine.player('btn')?.perk).toMatchObject({
      id: 'standard-command',
      attackBonus: 0,
      defenseBonus: 0,
      recoveryBonus: 0,
      capacityBonus: 0,
    });
    expect(force.maxHp).toBe(before.capacity);
    expect(engine.effectiveAttack('btn', force)).toBe(before.attack);
    expect(engine.effectiveDefense('btn', force)).toBe(before.defense);
    expect(engine.effectiveRecovery('btn', force)).toBe(before.recovery);
  });

  it('laat oorlogen autonoom aan fronten vechten en land veroveren', () => {
    const engine = new WorldEngine(7);
    engine.chooseCountry('bel');
    engine.state.territories.bel!.force = { hp: 180, maxHp: 180, attack: 82, defense: 42, readiness: 1, recovery: 0.2 };
    engine.state.territories.nld!.force = { hp: 6, maxHp: 90, attack: 12, defense: 9, readiness: 0.5, recovery: 0.1 };
    engine.player('bel')!.treasury = 100;
    engine.setStance('bel', 'assertive');
    const populationBefore = engine.controlledPopulation('bel');
    const incomeBefore = engine.player('bel')!.annualIncome;
    expect(engine.declareWar('bel', 'nld')).toBe(true);

    for (let week = 0; week < 104 && engine.state.territories.nld!.ownerId !== 'bel'; week += 1) {
      engine.step(1);
    }

    const combatEvents = engine.state.events.filter((event) => event.kind === 'battle' || event.kind === 'conquest');
    expect(combatEvents.length).toBeGreaterThan(0);
    expect(engine.state.events.some((event) => event.kind === 'conquest')).toBe(true);
    expect(engine.state.territories.nld!.ownerId).toBe('bel');
    expect(engine.controlledPopulation('bel')).toBeGreaterThan(populationBefore);
    expect(engine.player('bel')!.annualIncome).toBeGreaterThan(incomeBefore);
    const occupationHealth = engine.state.territories.nld!.force.hp / engine.state.territories.nld!.force.maxHp;
    expect(occupationHealth).toBeGreaterThan(0.2);
    expect(occupationHealth).toBeLessThan(0.9);
    expect(engine.player('nld')?.eliminated).toBe(true);
    expect(engine.state.events.some((event) => event.message.includes('annexes'))).toBe(true);
    expect(engine.player('bel')!.recoverySurgeUntilTick).toBeGreaterThan(engine.state.tick);
    expect(worldInvariantErrors(engine.state)).toEqual([]);
  });

  it('neemt van een groot rijk eerst één regio over en zet de oorlog daarna voort', () => {
    const engine = new WorldEngine(2043);
    engine.chooseCountry('rus');
    engine.state.territories.pol!.ownerId = 'ukr';
    engine.state.territories.pol!.capital = false;
    engine.player('pol')!.eliminated = true;
    engine.state.territories.rus!.force = { hp: 340, maxHp: 340, attack: 112, defense: 58, readiness: 1, recovery: 0.1 };
    engine.state.territories.ukr!.force = { hp: 26, maxHp: 180, attack: 8, defense: 11, readiness: 0.55, recovery: 0.04 };
    engine.player('rus')!.treasury = 100;
    expect(engine.declareWar('rus', 'ukr')).toBe(true);
    for (let week = 0; week < 150 && engine.state.territories.ukr!.ownerId === 'ukr'; week += 1) engine.stepOneTick();
    expect(engine.state.territories.ukr!.ownerId).toBe('rus');
    expect(engine.state.territories.pol!.ownerId).toBe('ukr');
    expect(engine.player('ukr')!.eliminated).toBe(false);
    expect(engine.player('ukr')!.capitalId).toBe('pol');
    expect(engine.activeWarBetween('rus', 'ukr')).toBeDefined();
    expect(engine.territoriesOf('rus')).toHaveLength(2);
    expect(worldInvariantErrors(engine.state)).toEqual([]);
  });

  it('maakt oorlog een langdurige strijd waarin beide kanten HP verliezen', () => {
    const engine = new WorldEngine(8);
    engine.chooseCountry('bel');
    engine.state.territories.bel!.force = { hp: 220, maxHp: 220, attack: 30, defense: 30, readiness: 0.9, recovery: 0.05 };
    engine.state.territories.nld!.force = { hp: 220, maxHp: 220, attack: 30, defense: 30, readiness: 0.9, recovery: 0.05 };
    engine.player('bel')!.treasury = 100;
    expect(engine.declareWar('bel', 'nld')).toBe(true);
    engine.step(20);
    expect(engine.state.territories.bel!.force.hp).toBeLessThan(220);
    expect(engine.state.territories.nld!.force.hp).toBeLessThan(220);
    expect(engine.state.territories.nld!.ownerId).toBe('nld');
    expect(engine.state.wars[0]?.battles).toBeGreaterThan(4);
    expect(DEFENSIVE_POSITION_BONUS).toBe(1.25);
  });

  it('rekent een onmiddellijke mobilisatiekost aan bij een oorlogsverklaring', () => {
    const engine = new WorldEngine(800);
    engine.chooseCountry('bel');
    const belgium = engine.player('bel')!;
    belgium.treasury = 100;
    const cost = engine.warMobilizationCost('bel', 'nld');
    const accountBefore = belgium.treasury;
    expect(cost).toBeGreaterThan(0);
    expect(engine.declareWar('bel', 'nld')).toBe(true);
    expect(belgium.treasury).toBeCloseTo(accountBefore - cost, 6);
  });

  it('geeft elk land een bescheiden startreserve voor minstens één haalbare openingsoorlog', () => {
    const engine = new WorldEngine(2042);
    for (const player of engine.state.players) {
      const cheapestTarget = TERRITORY_BY_ID[player.id]!.neighbors
        .map((targetId) => engine.warMobilizationCost(player.id, targetId))
        .filter(Number.isFinite)
        .sort((left, right) => left - right)[0];
      expect(cheapestTarget).toBeDefined();
      expect(player.treasury).toBeGreaterThanOrEqual(cheapestTarget!);
      expect(player.treasury).toBeLessThanOrEqual(18);
    }
  });

  it('trekt militaire slachtoffers af van getrainde manpower aan beide zijden', () => {
    const engine = new WorldEngine(801);
    engine.chooseCountry('bel');
    const belgium = engine.player('bel')!;
    const netherlands = engine.player('nld')!;
    belgium.treasury = 100;
    const belgianManpower = belgium.manpower;
    const dutchManpower = netherlands.manpower;
    expect(engine.declareWar('bel', 'nld')).toBe(true);
    engine.step(2);
    const war = engine.state.wars[0]!;
    expect(war.attackerMilitaryLoss).toBeGreaterThan(0);
    expect(war.defenderMilitaryLoss).toBeGreaterThan(0);
    expect(belgium.manpower).toBeLessThan(belgianManpower);
    expect(netherlands.manpower).toBeLessThan(dutchManpower);
  });

  it('leidt verloren manpower langzaam op via de nationale rekening', () => {
    const engine = new WorldEngine(802);
    engine.chooseCountry('bel');
    const belgium = engine.player('bel')!;
    belgium.manpower = 0;
    belgium.treasury = 10;
    const growthRate = engine.manpowerTrainingRate('bel');
    engine.setBudgetPreset('bel', 'defense');
    const warFootingRate = engine.manpowerTrainingRate('bel');
    expect(warFootingRate).toBeGreaterThan(growthRate);
    engine.step(4);
    expect(belgium.manpower).toBeGreaterThan(0);
    expect(belgium.manpower).toBeLessThan(0.01);
    expect(belgium.manpower).toBeLessThan(engine.manpowerCapacity('bel'));
  });

  it('betaalt iedere week loon, onderhoud en passief onderzoek', () => {
    const engine = new WorldEngine(803);
    engine.chooseCountry('bel');
    const belgium = engine.player('bel')!;
    belgium.manpower = engine.manpowerCapacity('bel') + 0.01;
    belgium.annualIncome = 0;
    belgium.treasury = 10;
    const upkeep = engine.weeklyMilitaryUpkeep('bel');
    const research = engine.weeklyResearchInvestment('bel');
    expect(upkeep).toBeGreaterThan(0);
    engine.step(1);
    expect(belgium.treasury).toBeCloseTo(10 - upkeep - research, 5);
  });

  it('herstelt beschadigde kracht langzaam en niet onmiddellijk', () => {
    const engine = new WorldEngine(9);
    engine.player('bel')!.treasury = 10;
    const force = engine.state.territories.bel!.force;
    force.hp = force.maxHp * 0.25;
    const before = force.hp;
    engine.step(1);
    expect(force.hp).toBeGreaterThan(before);
    expect(force.hp).toBeLessThan(force.maxHp * 0.3);
  });

  it('stores only relevant relations and creates distant relations lazily', () => {
    const engine = new WorldEngine(91);
    const initialCount = Object.keys(engine.state.relations).length;
    expect(initialCount).toBeLessThan(COUNTRIES.length * 8);
    expect(engine.relation('bel', 'jpn')).toBeDefined();
    expect(Object.keys(engine.state.relations)).toHaveLength(initialCount + 1);
  });

  it('moves reserves through an empire toward its most hostile border', () => {
    const engine = new WorldEngine(92);
    engine.state.territories.nld!.ownerId = 'bel';
    engine.state.territories.bel!.force = { hp: 240, maxHp: 240, attack: 70, defense: 65, readiness: 0.9, recovery: 0.5 };
    engine.state.territories.nld!.force = { hp: 22, maxHp: 40, attack: 6, defense: 6, readiness: 0.7, recovery: 0.1 };
    engine.state.territories.deu!.force = { hp: 50, maxHp: 50, attack: 12, defense: 11, readiness: 0.8, recovery: 0.2 };
    const hostile = engine.relation('bel', 'deu')!;
    hostile.status = 'tension';
    hostile.score = -80;
    engine.step(2);
    expect(engine.state.territories.nld!.force.maxHp).toBeGreaterThan(40);
    expect(engine.state.territories.bel!.force.maxHp).toBeLessThan(240);
  });

  it('versterkt een pas veroverd zwak grensgebied onmiddellijk wanneer de vijand tegenaanvalt', () => {
    const engine = new WorldEngine(930);
    engine.chooseCountry('bel');
    const netherlands = engine.state.territories.nld!;
    netherlands.ownerId = 'bel';
    netherlands.capital = false;
    netherlands.annexedAtTick = engine.state.tick;
    netherlands.force = { hp: 4, maxHp: 10, attack: 3, defense: 4, readiness: 0.62, recovery: 0.08 };
    engine.player('nld')!.eliminated = true;
    engine.state.territories.bel!.force = { hp: 270, maxHp: 280, attack: 82, defense: 90, readiness: 0.94, recovery: 0.5 };
    engine.player('bel')!.treasury = 100;
    const beforeCapacity = netherlands.force.maxHp;
    expect(engine.declareWar('bel', 'deu')).toBe(true);
    engine.step(2);
    expect(netherlands.force.maxHp).toBeGreaterThan(beforeCapacity);
    expect(engine.warOperation(engine.state.wars[0]!.id, 'deu')?.targetId).toBe('nld');
  });

  it('laat een afgeslagen offensief geen gratis terreinwinst opleveren', () => {
    const engine = new WorldEngine(931);
    engine.chooseCountry('bel');
    engine.player('bel')!.treasury = 100;
    engine.state.territories.bel!.force = { hp: 95, maxHp: 100, attack: 15, defense: 20, readiness: 0.82, recovery: 0.1 };
    engine.state.territories.nld!.force = { hp: 180, maxHp: 180, attack: 48, defense: 68, readiness: 0.96, recovery: 0.2 };
    expect(engine.declareWar('bel', 'nld')).toBe(true);
    engine.state.wars[0]!.warScore = 70;
    engine.step(2);
    expect(engine.state.wars[0]!.battles).toBe(1);
    expect(engine.state.territories.nld!.foreignControl).toBeUndefined();
  });

  it('bundelt meerdere aangrenzende legers als steun rond één operationeel doel', () => {
    const engine = new WorldEngine(932);
    engine.chooseCountry('bel');
    engine.state.territories.lux!.ownerId = 'bel';
    engine.state.territories.lux!.capital = false;
    engine.player('lux')!.eliminated = true;
    engine.player('bel')!.treasury = 100;
    expect(engine.declareWar('bel', 'deu')).toBe(true);
    engine.step(2);
    const operation = engine.warOperation(engine.state.wars[0]!.id, 'bel');
    expect(operation?.targetId).toBe('deu');
    expect(operation?.supportingForces).toBeGreaterThanOrEqual(1);
    expect(operation?.supply).toBeGreaterThan(0.5);
  });

  it('herbekijkt een vastgelopen doel en verschuift naar een ander front', () => {
    const engine = new WorldEngine(933);
    engine.chooseCountry('bel');
    engine.state.territories.nld!.ownerId = 'deu';
    engine.state.territories.nld!.capital = false;
    engine.player('nld')!.eliminated = true;
    engine.player('bel')!.treasury = 100;
    expect(engine.declareWar('bel', 'deu')).toBe(true);
    const war = engine.state.wars[0]!;
    war.attackerOperation = {
      commanderId: 'bel', sourceId: 'bel', targetId: 'nld', doctrine: 'pressure',
      startedTick: 0, expiresTick: 0, momentum: -12, supply: 0.8, supportingForces: 0,
    };
    engine.step(2);
    expect(engine.warOperation(war.id, 'bel')?.targetId).toBe('deu');
  });

  it('bevat geen permanente bilaterale pacten meer', () => {
    const engine = new WorldEngine(77);
    expect(engine.relation('bel', 'nld')!.treaties).toEqual([]);
    expect(engine.proposeTreaty('bel', 'nld', 'ceasefire')).toBe(false);
    expect(engine.canDeclareWar('bel', 'nld')).toBe(true);
  });

  it('beëindigt de campaign niet op een vaste tijdslimiet', () => {
    const engine = new WorldEngine(78);
    engine.state.tick = 52 * 10 - 1;
    engine.step(2);
    expect(engine.state.tick).toBeGreaterThan(52 * 10);
    expect(engine.state.gameOver).toBe(false);
    expect(engine.state.winnerId).toBeUndefined();
  });

  it('laat AI-landen niet willekeurig meteen oorlog beginnen', () => {
    const engine = new WorldEngine(79);
    engine.step(51);
    expect(engine.state.wars).toHaveLength(0);
    expect(engine.state.events.some((event) => event.kind === 'war')).toBe(false);
  });

  it('laat AI-oorlogen op langere termijn aanwezig maar gecontroleerd blijven', () => {
    let totalDeclarations = 0;
    for (const seed of [80, 81, 82]) {
      const engine = new WorldEngine(seed);
      engine.step(260);
      const declarations = engine.state.nextWarId - 1;
      totalDeclarations += declarations;
      expect(declarations, `seed ${seed}`).toBeLessThan(8);
    }
    expect(totalDeclarations).toBeGreaterThanOrEqual(2);
    expect(totalDeclarations).toBeLessThan(18);
  }, 60_000);

  it('pauzeert de simulatie nooit automatisch voor oorlog of gevechten', () => {
    const engine = new WorldEngine(101);
    engine.player('bel')!.treasury = 100;
    engine.setSpeed(2);
    expect(engine.declareWar('bel', 'nld')).toBe(true);
    expect(engine.state.speed).toBe(2);
    engine.step(4);
    expect(engine.state.speed).toBe(2);
  });

  it('verbindt België via een echte zeeroute met het VK', () => {
    const engine = new WorldEngine(2026);
    expect(isSeaConnection('bel', 'gbr')).toBe(true);
    expect(TERRITORIES.find((territory) => territory.id === 'bel')?.neighbors).toContain('gbr');
    expect(engine.canDeclareWar('bel', 'gbr')).toBe(true);
  });

  it('geeft kustlanden meerdere regionale zeeroutes maar houdt landlocked landen op land', () => {
    expect(STRATEGIC_SEA_ROUTE_PAIRS.length).toBeGreaterThan(120);
    expect(TERRITORY_BY_ID.bel!.seaNeighbors.length).toBeGreaterThanOrEqual(3);
    expect(TERRITORY_BY_ID.gbr!.seaNeighbors.length).toBeGreaterThanOrEqual(5);
    for (const landlockedId of ['lux', 'che', 'npl', 'kaz']) {
      expect(TERRITORY_BY_ID[landlockedId]!.seaNeighbors, landlockedId).toEqual([]);
    }
  });

  it('maakt een maritieme oorlog aantoonbaar duurder dan een landoorlog', () => {
    const engine = new WorldEngine(2033);
    expect(engine.warAccessType('bel', 'nld')).toBe('land');
    expect(engine.warAccessType('bel', 'gbr')).toBe('naval');
    expect(engine.warMobilizationCost('bel', 'gbr')).toBeGreaterThan(engine.warMobilizationCost('bel', 'nld') * 1.65);
  });

  it('maakt een oorlog tegen een grootmacht veel duurder dan tegen een klein eiland', () => {
    const engine = new WorldEngine(2036);
    const icelandCost = engine.warMobilizationCost('gbr', 'isl');
    const unitedStatesCost = engine.warMobilizationCost('gbr', 'usa');
    expect(Number.isFinite(icelandCost)).toBe(true);
    expect(Number.isFinite(unitedStatesCost)).toBe(true);
    expect(unitedStatesCost).toBeGreaterThan(icelandCost * 2);
  });

  it('laat een verklaarde maritieme oorlog werkelijk vechten in plaats van eindeloos mobiliseren', () => {
    const engine = new WorldEngine(2035);
    engine.chooseCountry('bel');
    engine.player('bel')!.treasury = 100;
    expect(engine.declareWar('bel', 'gbr')).toBe(true);
    engine.step(8);
    const war = engine.activeWarBetween('bel', 'gbr');
    expect(war?.battles).toBeGreaterThan(0);
    expect(war?.lastBattleTick).toBeGreaterThan(war?.startedTick ?? 0);
    expect(worldInvariantErrors(engine.state)).toEqual([]);
  });

  it('bevat geen militaire allianties of collectieve defensiehulp', () => {
    const engine = new WorldEngine(2027);
    engine.chooseCountry('rus');
    engine.player('rus')!.treasury = 100;
    expect('militaryPacts' in engine.state).toBe(false);
    expect(engine.declareWar('rus', 'nor')).toBe(true);
    const war = engine.activeWarBetween('rus', 'nor')!;
    expect('pactSupport' in war).toBe(false);
    expect('activatedPactIds' in war).toBe(false);
    expect(worldInvariantErrors(engine.state)).toEqual([]);
  });

  it('laat een frontlijn gedeeltelijke territoriale controle en bevolking opleveren', () => {
    const engine = new WorldEngine(2028);
    engine.chooseCountry('rus');
    engine.state.territories.rus!.force = { hp: 260, maxHp: 260, attack: 50, defense: 38, readiness: 1, recovery: 0.1 };
    engine.state.territories.ukr!.force = { hp: 220, maxHp: 220, attack: 28, defense: 30, readiness: 0.9, recovery: 0.1 };
    const beforeControlledPopulation = engine.controlledPopulation('rus');
    engine.player('rus')!.treasury = 100;
    expect(engine.declareWar('rus', 'ukr')).toBe(true);
    engine.step(2);
    const control = engine.state.territories.ukr!.foreignControl;
    expect(control?.controllerId).toBe('rus');
    expect(control!.share).toBeGreaterThan(0);
    expect(control!.share).toBeLessThan(1);
    expect(engine.state.territories.ukr!.ownerId).toBe('ukr');
    expect(engine.controlledPopulation('rus')).toBeGreaterThan(beforeControlledPopulation);
    expect(engine.state.wars[0]!.attackerPopulationLoss + engine.state.wars[0]!.defenderPopulationLoss).toBeGreaterThan(0);
  });

  it('houdt grenzen gedeeltelijk zolang het leger vecht en verovert direct bij 0 HP', () => {
    const engine = new WorldEngine(2040);
    engine.chooseCountry('rus');
    engine.player('rus')!.treasury = 100;
    engine.state.territories.rus!.force = { hp: 320, maxHp: 320, attack: 105, defense: 55, readiness: 1, recovery: 0.1 };
    engine.state.territories.ukr!.force = { hp: 180, maxHp: 180, attack: 20, defense: 26, readiness: 0.75, recovery: 0.05 };
    expect(engine.declareWar('rus', 'ukr')).toBe(true);
    engine.step(2);
    expect(engine.state.territories.ukr!.ownerId).toBe('ukr');
    expect(engine.state.territories.ukr!.force.hp).toBeGreaterThan(0);
    expect(engine.state.territories.ukr!.foreignControl?.share ?? 0).toBeLessThan(0.16);
    expect(engine.activeWarBetween('rus', 'ukr')).toBeDefined();

    engine.state.territories.ukr!.force.hp = 0;
    engine.state.wars[0]!.warScore = 100;
    engine.step(2);
    expect(engine.state.territories.ukr!.ownerId).toBe('rus');
    expect(engine.player('ukr')!.eliminated).toBe(true);
    expect(engine.activeWarBetween('rus', 'ukr')).toBeUndefined();
  });

  it('laat alleen de duidelijk verliezende partij halverwege vrede kopen met geld of land', () => {
    const engine = new WorldEngine(2041);
    engine.chooseCountry('rus');
    engine.player('rus')!.treasury = 100;
    expect(engine.declareWar('rus', 'ukr')).toBe(true);
    const war = engine.activeWarBetween('rus', 'ukr')!;
    war.startedTick = engine.state.tick - 30;
    war.battles = 18;
    war.warScore = 36;
    engine.state.territories.ukr!.force.hp = engine.state.territories.ukr!.force.maxHp * 0.28;
    engine.player('ukr')!.warExhaustion = 62;
    const loserTerms = engine.peaceProposalTerms(war.id, 'ukr');
    const winnerTerms = engine.peaceProposalTerms(war.id, 'rus');
    expect(loserTerms.eligible).toBe(true);
    expect(loserTerms.weakerId).toBe('ukr');
    expect(winnerTerms.eligible).toBe(false);
    expect(engine.proposePeaceSettlement('rus', 'ukr', 'territory')).toBe(false);
    expect(engine.proposePeaceSettlement('ukr', 'rus', 'territory')).toBe(true);
    const offer = engine.state.offers.find((candidate) => candidate.status === 'pending')!;
    expect(offer.fromId).toBe('ukr');
    expect(offer.settlement).toBe('territory');
    expect(engine.respondToOffer(offer.id, true)).toBe(true);
    expect(engine.activeWarBetween('rus', 'ukr')).toBeUndefined();
    expect(engine.state.territories.ukr!.foreignControl?.controllerId).toBe('rus');
    expect(engine.relation('rus', 'ukr')?.status).toBe('truce');
    expect(worldInvariantErrors(engine.state)).toEqual([]);
  });

  it('past de echte nationale bevolkingsgroeitrend toe', () => {
    const engine = new WorldEngine(2029);
    const belgiumBefore = engine.state.territories.bel!.population;
    const chinaBefore = engine.state.territories.chn!.population;
    expect(COUNTRY_BY_ID.bel!.populationGrowthRate).toBeCloseTo(0.701, 3);
    expect(COUNTRY_BY_ID.chn!.populationGrowthRate).toBeLessThan(0);
    engine.step(52);
    expect(engine.state.territories.bel!.population).toBeGreaterThan(belgiumBefore);
    expect(engine.state.territories.chn!.population).toBeLessThan(chinaBefore);
  });

  it('houdt population-growth research bewust klein bovenop de echte nationale trend', () => {
    const baseline = new WorldEngine(2034);
    const upgraded = new WorldEngine(2034);
    upgraded.player('bel')!.upgrades.demographics = 4;
    baseline.step(52);
    upgraded.step(52);
    const uplift = upgraded.state.territories.bel!.population / baseline.state.territories.bel!.population - 1;
    expect(uplift).toBeGreaterThan(0.0008);
    expect(uplift).toBeLessThan(0.0012);
  });

  it('gebruikt één nationale rekening met inkomsten en werkelijke wekelijkse kosten', () => {
    const engine = new WorldEngine(2035);
    engine.chooseCountry('bel');
    const belgium = engine.player('bel')!;
    const startingTreasury = belgium.treasury;
    const weeklyRevenue = engine.weeklyPublicRevenue('bel');
    expect(startingTreasury).toBeGreaterThan(0);
    expect(engine.weeklyNetCashflow('bel')).toBeLessThan(weeklyRevenue);
    engine.step(51);
    expect(belgium.treasury).toBeGreaterThanOrEqual(0);
    expect(belgium.treasury).toBeLessThan(startingTreasury + weeklyRevenue * 51);
    expect(Object.values(belgium.funds).every((value) => value === 0)).toBe(true);
  });

  it('laat Rusland als speler met een duurzame strategie en positieve cashflow starten', () => {
    const engine = new WorldEngine(2037);
    expect(engine.chooseCountry('rus')).toBe(true);
    const russia = engine.player('rus')!;
    expect(russia.budget).toEqual(BUDGET_PRESETS.balanced!.policy);
    expect(engine.weeklyNetCashflow('rus')).toBeGreaterThan(0);
    engine.step(52);
    expect(russia.treasury).toBeGreaterThan(0);
  });

  it('laat onderzoek autonoom en traag doorlopen met een vaste wekelijkse kost', () => {
    const engine = new WorldEngine(2038);
    engine.chooseCountry('bel');
    const player = engine.player('bel')!;
    const activeId = player.research.activeId;
    const weeklyCost = engine.weeklyResearchInvestment('bel');
    expect(weeklyCost).toBeGreaterThan(0);
    engine.step(12);
    expect(player.research.activeId).toBe(activeId);
    expect(player.research.progress).toBeGreaterThan(0);
    expect(player.research.progress).toBeLessThan(engine.researchProjectCost('bel', activeId)! * 0.1);
  });

  it('maakt onderzoek goedkoper voor kleine landen en exponentieel duurder per doorbraak', () => {
    const engine = new WorldEngine(2039);
    const projectId = engine.player('usa')!.research.activeId;
    const smallCountryCost = engine.researchProjectCost('btn', projectId)!;
    const superpowerCost = engine.researchProjectCost('usa', projectId)!;
    expect(smallCountryCost).toBeLessThan(superpowerCost * 0.55);
    const firstCost = engine.researchProjectCost('btn', projectId)!;
    engine.player('btn')!.research.discoveries['resilient-grids'] = 1;
    engine.player('btn')!.research.discoveries['integrated-logistics'] = 1;
    const thirdStageCost = engine.researchProjectCost('btn', projectId)!;
    expect(thirdStageCost).toBeGreaterThan(firstCost * 1.3);
    expect(thirdStageCost).toBeLessThan(firstCost * 1.4);
  });

  it('ontwikkelt dure management-upgrades via voortgang in plaats van onmiddellijk', () => {
    const engine = new WorldEngine(2040);
    engine.chooseCountry('bel');
    const player = engine.player('bel')!;
    player.treasury = 100;
    const before = engine.effectiveAttack('bel', engine.state.territories.bel!.force);
    expect(engine.startManagementUpgrade('bel', 'offensive-command')).toBe(true);
    expect(player.managementLevels['offensive-command']).toBe(0);
    expect(player.management.war.activeId).toBe('offensive-command');
    player.management.war.progress = player.management.war.target - 0.5;
    engine.step(1);
    expect(player.management.war.activeId).toBeUndefined();
    expect(player.managementLevels['offensive-command']).toBe(1);
    expect(player.improvements.attack).toBe(1);
    expect(engine.effectiveAttack('bel', engine.state.territories.bel!.force) / before).toBeGreaterThan(1.007);
  });

  it('geeft brancheonderzoek exact één kleine willekeurige verbetering', () => {
    const engine = new WorldEngine(2041);
    engine.chooseCountry('bel');
    const player = engine.player('bel')!;
    player.treasury = 100;
    expect(engine.startManagementUpgrade('bel', 'military-research')).toBe(true);
    player.management.research.progress = player.management.research.target - 0.5;
    engine.step(1);
    expect(player.managementLevels['military-research']).toBe(1);
    expect(player.improvements.attack + player.improvements.training).toBe(1);
  });

  it('maakt negatieve bevolkingsgroei door onderzoek minder negatief zonder tekenfout', () => {
    const engine = new WorldEngine(2042);
    const baseline = engine.weeklyPopulationTrend('chn');
    engine.player('chn')!.improvements['population-growth'] = 10;
    const improved = engine.weeklyPopulationTrend('chn');
    expect(baseline).toBeLessThan(0);
    expect(improved).toBeLessThan(0);
    expect(improved).toBeGreaterThan(baseline);
  });

  it('toont één sluitende wekelijkse finance breakdown', () => {
    const engine = new WorldEngine(2043);
    engine.chooseCountry('bel');
    const finance = engine.weeklyFinanceBreakdown('bel');
    expect(finance.expenses).toBeCloseTo(finance.payroll + finance.maintenance + finance.warOperations + finance.research + finance.training + finance.recovery + finance.forceExpansion, 8);
    expect(finance.net).toBeCloseTo(finance.revenue - finance.expenses, 8);
    expect(finance.requestedExpenses).toBeGreaterThanOrEqual(finance.expenses);
  });

  it('optimaliseert vredesuitgaven rond $5B zonder research of herstel gratis te maken', () => {
    const peaceEngine = new WorldEngine(2044);
    peaceEngine.chooseCountry('bel');
    const peacetimeBelgium = peaceEngine.player('bel')!;
    peacetimeBelgium.annualIncome = 0;
    peacetimeBelgium.treasury = 5.1;
    peaceEngine.state.territories.bel!.force.hp *= 0.4;
    const optimized = peaceEngine.weeklyFinanceBreakdown('bel');
    expect(optimized.mode).toBe('conserving');
    expect(optimized.savings).toBeGreaterThan(0);
    expect(optimized.maintenance).toBeGreaterThan(0);
    expect(optimized.maintenance).toBeLessThan(optimized.requestedMaintenance);
    expect(optimized.research).toBeGreaterThan(0);
    expect(optimized.research).toBeLessThan(optimized.requestedResearch);
    expect(optimized.recovery).toBeGreaterThan(0);
    expect(optimized.recovery).toBeLessThan(optimized.requestedRecovery);
    peaceEngine.step(4);
    expect(peacetimeBelgium.treasury).toBeGreaterThanOrEqual(5);

    const warEngine = new WorldEngine(2045);
    warEngine.chooseCountry('bel');
    const wartimeBelgium = warEngine.player('bel')!;
    wartimeBelgium.treasury = 100;
    expect(warEngine.declareWar('bel', 'nld')).toBe(true);
    wartimeBelgium.annualIncome = 0;
    wartimeBelgium.treasury = 4;
    warEngine.state.territories.bel!.force.hp *= 0.4;
    expect(warEngine.weeklyFinanceBreakdown('bel').mode).toBe('war');
    warEngine.step(1);
    expect(wartimeBelgium.treasury).toBeLessThan(4);
  });

  it('bouwt een te kleine reserve opnieuw op met werkelijk lagere resultaten', () => {
    const engine = new WorldEngine(2047);
    engine.chooseCountry('bel');
    const player = engine.player('bel')!;
    player.treasury = 4;
    engine.state.territories.bel!.force.hp *= 0.45;
    const hpBefore = engine.state.territories.bel!.force.hp;
    const finance = engine.weeklyFinanceBreakdown('bel');
    expect(finance.mode).toBe('rebuilding');
    expect(finance.net).toBeGreaterThan(0);
    expect(finance.recovery).toBeGreaterThan(0);
    const fullRecovery = finance.requestedRecovery / 0.12;
    engine.step(1);
    expect(player.treasury).toBeCloseTo(4 + finance.net, 6);
    expect(engine.state.territories.bel!.force.hp - hpBefore).toBeGreaterThan(0);
    expect(engine.state.territories.bel!.force.hp - hpBefore).toBeLessThan(fullRecovery);
  });

  it('laat bewuste spelersprojecten wel onder de vredesvloer betalen', () => {
    const engine = new WorldEngine(2046);
    engine.chooseCountry('bel');
    const player = engine.player('bel')!;
    const cost = engine.managementUpgradeCost('bel', 'tax-modernization')!;
    player.treasury = cost;
    expect(engine.startManagementUpgrade('bel', 'tax-modernization')).toBe(true);
    expect(player.treasury).toBeCloseTo(0, 8);
  });

  it('laat treasury-research nationale gevechtskracht permanent verbeteren', () => {
    const engine = new WorldEngine(2030);
    engine.chooseCountry('bel');
    const player = engine.player('bel')!;
    expect(player.treasury).toBeGreaterThan(0);
    player.treasury = 100;
    const beforeTreasury = player.treasury;
    const beforeAttack = engine.effectiveAttack('bel', engine.state.territories.bel!.force);
    expect(engine.purchaseStrategicUpgrade('bel', 'weapons')).toBe(true);
    expect(player.treasury).toBeLessThan(beforeTreasury);
    expect(player.upgrades.weapons).toBe(1);
    const attackIncrease = engine.effectiveAttack('bel', engine.state.territories.bel!.force) / beforeAttack;
    expect(attackIncrease).toBeCloseTo(1.03, 8);
  });

  it('houdt een live globale machtsranking bij', () => {
    const engine = new WorldEngine(2032);
    const ranking = engine.globalRanking();
    expect(ranking).toHaveLength(COUNTRIES.length);
    expect(ranking[0]!.score).toBeGreaterThanOrEqual(ranking[1]!.score);
    expect(ranking.some((entry) => entry.player.id === 'bel')).toBe(true);
    expect(engine.state.players.every((player) => player.treasury >= 0.8)).toBe(true);
  });

  it('blijft geldig met honderden gelijktijdige landen-AI’s', () => {
    for (const seed of [1, 2026]) {
      const engine = new WorldEngine(seed);
      engine.step(26);
      expect(worldInvariantErrors(engine.state), `seed ${seed}`).toEqual([]);
      expect(engine.state.events.length, `seed ${seed}`).toBeLessThanOrEqual(220);
    }
  });

  it('blijft ook na tien campagnejaren invariant-schoon met verschuivende grenzen', () => {
    const engine = new WorldEngine(3031);
    engine.step(520);
    expect(worldInvariantErrors(engine.state)).toEqual([]);
    expect(engine.state.events.length).toBeLessThanOrEqual(220);
    expect(engine.state.tick).toBe(520);
  }, 30_000);
});
