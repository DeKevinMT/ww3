# Frontier Command — Rules V2.57

This document is the authoritative gameplay and simulation contract. If presentation copy, tests and code disagree, they must be reconciled in the same change.

## 1. Product promise

- Solo assigns one current country; Direct Connect assigns one distinct current country to each of 2–8 human players, never a starting alliance.
- Every living country, including the chosen country, uses the same deterministic national AI planner for finance, Development, recruitment, recovery and front execution.
- **APEX** is only the presentation name for a human country's autopilot. Choosing a country grants no AI-efficiency, planning-cadence or strategy advantage; that country's human seat alone chooses its war and peace actions.
- National IQ is the shared AI's only skill input. A higher bounded score provides a modest improvement in execution and allocation response, never a separate ruleset. The same published score also contributes transparently to live national combat-system quality alongside GDP per capita and research; it is not a hidden selection bonus.
- At normal speed the game advances continuously at one simulated week per real second. Combat is live and contains no dice interaction; only the room host may change multiplayer speed.
- The campaign continues until one owner controls the complete playable map.
- Every starting country must have a plausible route to victory. Catch-up improves development, recruitment and rebuilding; it never grants hidden raw combat damage.
- A strategically foolish player declaration remains legal when identity, access, treasury, duplicate-war and truce rules permit it.
- The presentation targets desktop. Mobile-specific layout and interaction support are outside this version's contract.

## 2. World content

The map contains 166 playable countries derived from Natural Earth geometry and recent World Bank/SIPRI baselines. Microstates and very small islands are filtered for readability and performance. Greenland is an explicit exception: it has its own owner, data, flag and strategic sea routes to Canada and Iceland.

The 2026 scenario begins with the Russia–Ukraine, Israel–Palestine and Afghanistan–Pakistan border fronts active. Ongoing internal conflicts in Sudan, Myanmar, Yemen, Somalia and eastern DR Congo begin as damaged national condition, output and army readiness, not fabricated interstate wars. Scenario instability does not count as aggression by the chosen player country.

These source features are absorbed before play:

| Source feature | Canonical country |
| --- | --- |
| Northern Cyprus | Cyprus |
| Somaliland | Somalia |
| Hong Kong | China |
| Macao | China |
| Western Sahara | Morocco |

Absorbed geometry remains visible but never creates a second owner, army, label or national account. Greenland is not absorbed into Denmark.

## 3. Canonical state

V2.57 uses schema version 21 and rules version `frontier-command-v2.57-performance-multiplayer`. Canonical state stores a sorted, unique `humanPlayerIds` roster of one to eight content nations and a `humanPlayerId` primary compatible with solo systems; a Direct Connect campaign uses two to eight of those seats. A client's current `viewerPlayerId` is local runtime state, not canonical state, and therefore never changes the save hash.

Authenticated schema-20 saves remain supported. V2.55 schema-20 saves expand safely from six to ten research programs. V2.56 schema-20 saves retire partial territorial control and territorial peace offers, convert the removed Control research level into Reinforcement Efficiency and receive a one-country human roster. Authenticated schema 13–19 migrations remain deterministic, incompatible rules versions are rejected, and every existing active integration endpoint remains immutable after load.

### Nation

```ts
type NationState = {
  empireName: string;
  treasury: number;
  trainedReserves: number; // finite national pool, capped at one live active army
  budget: { military: number; research: number; development: number };
  research: {
    allocations: Record<ResearchProgram, number>; // ten integers, exact sum 100
    progress: Record<ResearchProgram, number>;
    effectLevels: Record<ResearchEffect, number>;
    breakthroughs: Record<ResearchProgram, number>;
  };
  rapidRecruitmentAvailableTick: number;
  researchSurgeAvailableTick: number; // compatibility state; no active player UI control
  ceasefiresRequested: number;
  propagandaAvailableTick: number; // compatibility state; no active player UI control
  propagandaProgram: null | {
    startedTick: number;
    endsTick: number;
    totalSuspicionReduction: number;
    weeklySuspicionReduction: number;
  };
  warFatigue: number;
  capitalId: TerritoryId;
};
```

### Territory

```ts
type TerritoryState = {
  owner: NationId;
  coreOwner: NationId;       // permanent identity until full integration completes
  population: number;       // millions
  economy: number;          // billions USD-equivalent
  condition: number;        // 0.15–1
  integration: number;      // 0–1 integration under the current owner
  integrationProgram?: {
    fromOwnerId: NationId;   // sovereign owner displaced by this capture
    fromCoreOwnerId: NationId;
    toOwnerId: NationId;
    startedTick: number;
    completesTick: number;
  };
  army: {
    manpower: number;          // millions; complete deployed army
    capacity: number;          // millions; automatic population/integration/research ceiling
    baseAttack: number;        // manpower-weighted local army quality
    baseDefense: number;       // manpower-weighted local army quality
  };
};
```

There is one finite national trained-reserve pool in addition to deployed manpower. It is not combat HP or a hidden army: its current and maximum size are visible, it contributes no combat power until mobilised, and new training is capped at exactly `1 ×` live active army capacity. Every opening nation receives reservists: a reported real-world pool is discounted to a uniform 55% immediately-ready share, while a zero or missing observation receives a 2%-of-cap trained cadre; both paths obey the same 1× cap. A later capacity fall blocks growth but does not delete already trained excess. There is no other stored force HP/maxHP, readiness resource, special soldier subset, unit inventory, defence fund, research currency, influence, stability or doctrine profile. Temporary integration state is explicit and ends when the former core identity is permanently absorbed.

National population, economy, manpower, capacity, Combat Power, global score and rank are selectors over current territory state. There is no nation-level battle-XP or military-experience value.

## 4. Visible country information

The permanent desktop header presents compact primary values for Economy, APEX mode, Population, Food, Army and Research. Army is displayed as deployed manpower over live capacity (`x / x`), followed by trained reserve over its one-active-army cap and live Combat Power. World rank remains a badge, not a resource.

Manpower is the complete number of trained deployed soldiers. Capacity is only the current recruitment ceiling. Empty capacity adds no combat power and a partly filled army does not make each deployed soldier individually weaker.

Combat Power is derived from deployed manpower, effective ATK, effective DEF, condition and supply. AI target selection, forecasts and live combat use the same underlying selectors. Every opening army receives its country's calibrated base ATK and DEF. Movement and conquest-guard deployment preserve the source force's base quality; merging armies blends it by manpower; automatic recruitment adds the original profile of the territory where those soldiers are raised. Casualties preserve the surviving average, while an empty army resets to its local recruitment profile. Federation changes ownership without diluting any army. National ATK/DEF is a manpower-weighted display/outcome snapshot only; total Combat Power is the additive sum of local armies.

Opening ATK and DEF use one constant-time country calibration. `clamp(powerIndex / (100 × deployedOpeningManpower) × openingQuality, 0.35, 14)` sets the combined per-soldier rating, where opening GDP per capita and IQ give `openingQuality` its small 0.97×–1.03× range. SIPRI spending per deployed soldier adds a symmetric tilt: equipment-heavy forces lean toward ATK, manpower-heavy forces toward DEF, while `0.55 × ATK + 0.45 × DEF` remains unchanged.

Effective combat then applies one live owner-wide national-systems layer without rewriting those conserved local profiles. Let `income` be current integrated GDP per capita normalized logarithmically from `$500` to `$250,000`, and `iq` be national IQ normalized from 80 to 108:

```text
systemQuality = 1 + (0.60 × income + 0.40 × iq − 0.50)       // 0.50×–1.50×
researchConversion = 0.75 + 0.50 × iq                        // 0.75×–1.25×
convertedEconomyLevel = EconomyGrowthLevel × researchConversion
economyResearchMultiplier = 1
  + 0.30 × convertedEconomyLevel / (convertedEconomyLevel + 25)
```

`systemQuality × economyResearchMultiplier` modernises both ATK and DEF. Branch-specific effects then apply. Effective DEF above neutral is deliberately weaker and bounded:

```text
effectiveDEF = rawDEF                                      when rawDEF <= 1
effectiveDEF = 1 + 0.90 × (rawDEF − 1) / (1 + 0.05 × (rawDEF − 1)) otherwise
```

The resulting effective values—not hidden pre-IQ baselines—are shared by combat, forecasts, Nation power contribution and post-war reports.

There is one global ranking and no separate military or economic table:

```text
globalScore = sqrt(max(0, CombatPower) × max(0, controlledOutput))
```

The geometric mean gives military power and controlled economy equal relative weight: doubling either input changes the score identically. Living nations sort by descending global score, then stable country ID.

## 5. Tick order and determinism

At each weekly tick the engine performs, in order:

1. Apply queued player commands in action-sequence order.
2. Advance the canonical tick.
3. Synchronise every army capacity from live owned population, integration and Force Capacity research.
4. Snapshot and apply weekly finance, upkeep, recruitment and condition changes.
5. Apply passive Development progress and breakthroughs.
6. Apply population and economic development, then resynchronise capacity where needed.
7. Redistribute armies and resolve active wars.
8. Update expansion suspicion and permanent containment escalation.
9. Apply deterministic AI commands.
10. Derive victory and prune history.
11. Run the scheduled full-state integrity boundary.
12. Notify presentation listeners.

All randomness advances the saved seeded RNG. The same seed, globally ordered commands and tick count must produce the same canonical hash. Development and tests run the exhaustive invariant scan after every tick. Production runs the same scan every eight ticks and forces it immediately on game-over or other terminal tick paths.

V2.57 removes cross-border immigration/displacement and partial territorial occupation from the weekly hot path rather than caching obsolete results. National-IQ views are cached by state, country, content and live IQ-research level. Finance, research, AI, resistance, ranking and war consumers accept and reuse already-built military/power snapshots within their phase so downstream selectors do not rebuild the same world view repeatedly.

## 6. Simple tax and one treasury

The player does not manually allocate a budget. Every national AI runs the same planner, chooses an exact-100 policy and derives an adaptive active plan from treasury runway, food coverage and reserves, live population growth, army gaps, territory damage, technology gap and active fronts. APEX is only the chosen country's autopilot label; selection never changes the planner or its inputs.

National IQ is a bounded gameplay score in `[80, 108]`, not a scientific claim about real populations. It is the sole skill input to the shared planner. Its modest funded-output multiplier is exact and inspectable:

```text
aiEfficiency = 1 + (clamp(IQ, 80, 108) − 100) × 0.0025
```

This yields only `0.95×` to `1.02×`. Every country reviews budget policy and the ten research allocations on the same eight-week cadence. A review moves each exact-100 allocation toward its target by only this many percentage points in total:

```text
stepLimit = round(2 + 2 × clamp((IQ − 80) / 28, 0, 1))
```

The resulting limit is two to four points. Policies therefore transition gradually instead of jumping directly to a newly optimised mix. Mandatory costs may still change immediately when a real event changes the army, fronts, food need, debt or owned territory; the AI does not hide those costs behind smoothing.

Every country also follows the same liquid-reserve policy. The base target is eight ordinary tax-revenue weeks in peace, or six plus two for each active war. Bounded IQ scales that target from 0.90× to 1.10× and a large peacetime economy can reduce it by at most 15%. While below target, the planner retains 12–16% of otherwise discretionary peacetime cashflow or 14–18% in war, with the exact point set by IQ; after the reserve is funded, it still retains 5%. These are conserved treasury funds, not a separate resource. Positive reserves may bridge the exact remaining food request in a genuine food emergency, but AI command planning never spends them on one-off Rapid Recruitment, Research Surge or Propaganda purchases.

Weekly tax uses one automatic country rate between 10% and 20%. It is not a policy slider:

```text
productivePopulation = sum(live territory population × integration share)
referenceProductivePopulation = sum(opening territory population × integration share)
populationFactor = productivePopulation / referenceProductivePopulation
integratedOutput = sum(live territory GDP × integration share)
fiscalReferenceWealthPerPerson = integratedOutput / referenceProductivePopulation
countryTaxRate = 0.10
  + 0.10 × clamp(fiscalReferenceWealthPerPerson / 75, 0, 1)
taxableOutput = integratedOutput × (0.50 + 0.50 × populationFactor)
weeklyTax = taxableOutput × countryTaxRate / 52
```

Fiscal reference wealth is measured in thousands of dollars per immutable reference person, so `$75K` reaches the 20% end of the range. Using that reference for the rate prevents live population from algebraically cancelling its own contribution or lowering the rate when it grows. At baseline `populationFactor = 1`, so taxable output equals integrated GDP and opening income preserves the old calibration. With fixed GDP, tax then rises monotonically with more live productive people and falls with losses; even at zero live population the stable economy half retains 50% of the taxable-output base for a possible food and population recovery. This blend changes only tax: real integrated GDP remains the Economy value used by global ranking, strategic value, growth and conquest. The UI may still show live GDP per person, which falls when population grows against unchanged production. No condition or war modifier is hidden inside the rate, and integration applies equally to live population, its reference and GDP.

The final annual economy-growth rate is recalculated once per finance plan:

```text
annualEconomyGrowth = clamp(
  0.3% base
  + 0.22 × annual productive-investment share of live GDP (capped at 12%)
  + Economy Growth research
  + full-food bonus
  − food-shortage drag
  − war/post-war growth drag,
  −6%, +4.5%
)
```

One active war removes at least 1.2 percentage points of annual growth. Extra fronts and accumulated fatigue increase that drag, and a smaller recovery penalty remains briefly after peace.

The Economy drawer shows this final percentage and its five components next to treasury, tax, costs, net, population, wealth per person, and food. Recurring player-facing amounts are annualized while canonical settlement remains weekly. The trade card computes `foodExported − foodImported` and explicitly presents **Net Food Imports**, **Net Food Exports** or balanced trade; zero export income must never hide positive imports behind a misleading “none” message. It remains compact and does not expose branch-by-branch research arithmetic or obsolete movement costs.

One treasury first pays a universal Base Operations cost that starts at `0.20 × ordinary weekly tax revenue`; Public Administration research can gradually lower that share toward `0.15`, and the Economy ledger shows the live rate. Remaining tax revenue is available to food and normal programmes. It then pays food, army upkeep, recruitment and reserve training, research, national development, active-front operations, treaty obligations and any debt premium. Domestic food depends on land, terrain, condition, integration, research and live territory economic strength; India-origin agricultural territory receives a 1.30 yield multiplier. More expensive imports fill the remaining reachable demand. Food storage is finite: population demand supplies the base capacity, controlled landmass adds physical capacity, and wealth plus Food Systems research improve it. As stock falls below its target, every country's funded purchase request rises smoothly and may progressively use positive treasury reserves before weekly coverage fails. During a live shortage, extra reserve-starvation mortality starts below 10% of target stock and rises toward the empty-reserve maximum. The top bar reports current/max food and the projected annualized stock change. Treasury may become negative; new borrowing adds a premium and causes discretionary spending to contract until finances recover.

At peace, food shortage, less than two weeks of reserves, live population decline or debt activates survival recovery. Development is prioritised, food/logistics research gains weight and optional new wars are blocked. Any emergency transfer from Development into immediate food funding scales continuously with shortage and reserve stress, so crossing a threshold cannot create a sudden cost cliff. Territory damage, post-war fatigue, an ordinary deficit or a routine recovery plan never permits demobilisation. A solvent, fed country protects payroll and recruits toward 100% of live capacity. Only an extreme food or debt emergency that also makes payroll genuinely unaffordable may shrink the deployed force, and the AI rebuilds toward full capacity as soon as that emergency ends. During an active war, Armed Forces becomes the largest priority, but the AI keeps an essential development floor so victory does not automatically destroy the civilian system.

Armed Forces pays mandatory upkeep before mobilization. Capacity is never purchased and cannot be reduced by an underfunded week. Fully maintained forces receive a slow active training pipeline of 0.1% of live capacity per peaceful week, improved by Training research and limited by food. If readiness is low, recurring surplus military funding may purchase a peacetime fast-track at 2.5× normal unit cost. Only after projected deployed strength reaches full capacity within the one-millionth canonical rounding tolerance does paid training begin filling the separate reserve pool, up to exactly `1 ×` live active capacity. In war, the bounded passive and paid-emergency throughputs instead mobilise existing reserves into active gaps at `3 ×` the matching fresh-training throughput; ordinary weekly recruitment adds no second source of fresh active manpower. Paid reserve training continues at exactly 5% of the normal peace pipeline, so sustained losses ordinarily drain the pool much faster than it grows. A later capacity fall blocks new reserve growth but never deletes stored personnel. Base ATK/DEF quality raises unit cost on a bounded square-root curve; Reinforcement Efficiency and the same modest national-IQ efficiency used by every country reduce it. The sole extreme-crisis drawdown may remove at most `0.0005 × deployed manpower`, or 0.05%, per week. It has no instant or accelerated second path and never changes capacity.

Moving or redistributing troops costs exactly zero treasury. There is no per-hop, distance-based or hidden logistics charge for troop movement. This does not make a war declaration or an active front free: their explicit mobilisation and operations costs remain separate and visible.

## 7. Army capacity and recruitment

Every territory's capacity uses only that territory's current live population and the owner's Force Capacity research. National capacity is the sum across currently owned territories:

```text
territoryCapacity = territory live population
  × territory integration
  × 0.00145
  × (1 + ForceCapacityLevel × 0.01)

nationalCapacity = sum(territoryCapacity of every owned territory)
```

The universal population share is `0.00145`. Homeland integration is 1. A foreign conquest starts at 0.10 and therefore supplies 10% of its structural cap; integration then unlocks the remainder. Military quality, defence spending, starting army size, territory condition, treasury, war fatigue and budget funding do not modify capacity. Capacity automatically rises again when population, integration or research supports it; no permanent crisis penalty exists. The HUD's War Strain score is likewise explanatory: it combines active wars/fronts, fatigue, deployed readiness and reserve fill to label current push sustainability, while its consequence row reads the already canonical output, growth, research and operation-cost effects.

Recruitment spends recurring military funding to fill free national capacity and, after full active readiness in peace, to train the finite national reserve. Training, Recovery and the same bounded IQ efficiency may change automatic recruitment speed or price, but never the capacity formula. A conquered frontier begins with 10% of its native local cap and may station existing soldiers up to that local cap plus 1% of total empire Army cap. Full integration raises the support share to 2.5%. This creates neither troops nor national capacity. Existing trained personnel are not deleted if later population loss or recalculation leaves them above that ceiling; logistics gradually reroutes only real excess manpower.

Army redistribution moves manpower through owned routes while conserving total manpower and manpower-weighted base ATK/DEF. Redistribution has zero treasury cost.

## 8. Automatic Development portfolio

All ten programs are active at the same time. There is no exclusive focus, separate upgrade currency or manual quality/volume slider. Every national AI reassesses its target portfolio every eight weeks according to manpower fill, reserves, technology gap, food security, administration, live IQ, economy and current wars. The saved allocation then moves only two to four percentage points toward that target, using the same IQ-scaled transition limit as the budget. The Progress drawer shows the total completed level of every empire-wide effect, separate from progress toward the next breakthrough.

| Program | Seeded-random +1% result |
| --- | --- |
| Population & Recruitment | Population Growth or Training |
| Military Industry | Force Capacity or Reinforcement Efficiency |
| Advanced Weapons | Attack or Control |
| Defensive Systems | Defense or Casualty Reduction |
| Logistics & Medicine | Recovery or Supply |
| Economy & Science | Economy Growth, Research Speed or Research Efficiency |
| Food Systems | Food Production or Food Storage |
| Reserve Doctrine | Reserve Training or Reserve Mobilization |
| Public Administration | Tax Efficiency or Operating Efficiency |
| Education & Intelligence | Live IQ Increase |

Thirty percent of the Research pot is the equal passive baseline: 3% for each branch. The remaining 70% follows the exact-100 allocation. Every branch stores its own progress and breakthrough count. Education & Intelligence costs roughly six ordinary first-tier programs, raises live IQ with diminishing returns and cannot push the score above 112.

The requirement for a branch with `B` completed breakthroughs follows the deterministic mastery curve:

```text
branchBaseRP × 0.45 × (B + 1) × 1.18^B
  × bounded power catch-up
  × research-efficiency modifier
```

Research may improve indefinitely, while the exponential requirement slows extreme late-game growth. The active player UI contains no Research Surge request button or modal; Development advances only through the visible recurring portfolio in normal play. Compatibility fields and engine commands may remain canonical for deterministic loading and replay, but they are not a player purchase surface.

## 9. War declaration, access and costs

A declaration is legal only when:

- attacker and target are distinct living nations;
- the same pair is not already at war;
- no active truce or ceasefire obligation blocks it;
- a current owned land border or strategic sea connection exists.

Army size and fill ratio create visible risk warnings but do not block the player's Start War command. Every additional source-unique front uses its own local army and adds to the national war budget.

Declaring war itself is free. After declaration, both sides enter an eight-week mobilisation phase. No battle pulse occurs before week eight. Each live front then charges its explicit weekly operations cost. A naval front starts at 1.35× its equivalent land front for routes up to 1,500 km and rises smoothly toward 2.15× by 9,000 km; naval supply falls from 0.92× toward 0.62× over the same band. Troop redistribution itself remains free.

When a nation's final active war ends, post-war fatigue decays gradually instead of switching instantly to full peacetime efficiency.

## 10. Combat

Wars resolve battle pulses every two weeks. Each side builds a deterministic, source-unique operation for every viable owned source territory that can reach the enemy. All operations on the side with initiative resolve in stable source/target order during that round, so several countries of one empire can attack simultaneously and suffer their own losses. A source army can participate in at most one front per tick. Front scoring considers supply, supporting armies, target army fill, economy, capital value, power ratio and access penalty.

Supply remains bounded to `[0.25, 1]` and depends on route connectivity, distance from the capital, condition, access and Supply research. Naval attacks use the documented distance-scaled supply friction and operations cost. They have no separate assault-strength or casualty multiplier. Troop routing and supply limitations affect combat effectiveness but never charge treasury for movement.

The defender receives `1.25 × terrainModifier` position strength. Attacker pressure is opposed by defender DEF; defender counter-pressure is independently opposed by attacker DEF. Research may reduce casualties through its bounded selector.

```text
requestedDefenderLosses = defenderCombatManpower × 0.008
  × max(0, attackPressure / defenseShield)
  × variance × defenderCasualtyModifiers

requestedAttackerLosses = attackerCombatManpower × 0.008
  × max(0, counterPressure / attackerShield)
  × variance × accessCasualtyModifier × attackerCasualtyModifiers
```

Variance is seeded in `[0.94, 1.06]`; the linear power-ratio exponent is exactly `1`. Every deployed soldier in the local source and target armies contributes to front pressure through the formulas above. Damage is simultaneous, has no minimum-casualty floor and has no per-pulse rate, capacity or damage ceiling. Requested losses are applied directly and only the remaining local manpower is a natural upper bound. The `0.008` effectiveness is exactly half of the former `0.016` baseline. The separate 5% strength ratio remains solely a front-viability and initiative signal; it never caps casualties or adds route damage. Manpower casualties are continuous and battles create no XP resource.

The declaration forecast and live battle resolution use the same pulse projection. Battle damage may also cause bounded local civilian casualties, economic damage, condition loss and war fatigue. Civilian deaths remain in the affected territory; no migration, refugee or displacement transfer exists. Food-shortage mortality remains a separate local population loss.

## 11. Evolving borders and capture

A territory remains wholly owned by its defender until decisive capture. Capture occurs when local defending manpower reaches zero while the attacking source retains combat strength. A depleted formation may instead surrender only after the same front has existed for at least 26 weeks, its readiness is at most 12.5% of local capacity, that war has inflicted losses equal to at least 80% of local capacity, the attacking source outnumbers it at least four to one, and sustained momentum plus the current pulse remain positive. The remaining formation leaves active manpower without being recorded as battle deaths, then ownership transfers directly and completely. No partial-control or territorial peace-settlement state exists.

For a foreign capture, up to 10% of surviving source manpower moves into the captured territory as a real conquest guard, bounded by its local cap plus 1% of total empire Army cap. The same headcount is removed from the source, so enemy manpower is never inherited and conquest creates no troops or military quality. Full integration raises the scalable deployment allowance to 2.5% of empire cap. During the first 52 weeks after capture the guard may receive reinforcement but ordinary empire logistics cannot use it as an outbound donor.

On capture:

- owner changes directly and completely to the victor;
- surviving population, economy and condition remain as the territory's full potential after explicit battle damage;
- a foreign owner starts at exactly `integration = 0.10`; an original-owner recapture restores `integration = 1`;
- population capacity, taxable output, food production and army capacity all use that same visible integration share;
- the remaining 90% unlocks linearly over one fixed duration derived from immutable baseline population (50%), GDP (30%) and land area (20%); every new conquest calendar is exactly `1.02 ×` the original duration, so Luxembourg takes about 12.8 years, Belgium 26 and China 173;
- integration speed is calendar-based and is never changed by budget, AI efficiency, war or later growth;
- until completion, `coreOwner` preserves the territorial identity, `fromOwnerId` preserves the sovereign displaced by the latest capture, and the map shows a subtle border, former flag and progress treatment;
- on completion, `integration = 1`, `coreOwner` becomes the current owner and `integrationProgram` is deleted; population, economy, condition, manpower, force quality and routes are conserved while full owner-based capacity and output become available;
- the old flag, integration border and country label are no longer renderable once `coreOwner === owner`; after the last territory carrying that former owner/core identity completes, the vanished sovereign is fully removed from canonical `players` and selector caches;
- treasury, food and trained reserves transfer exactly once when the vanished identity has no owned territory, active war or unfinished integration reference; durable research transfers by maxima, so duplicate values never sum into free progress;
- there is no selected-country exception: full absorption also removes the chosen nation's canonical record, ends that campaign and renders defeat from immutable content plus the surviving absorber; save loading reconstructs this terminal state deterministically;
- a lost capital moves to the former owner's largest remaining economy.

The duration curve is immutable. Each population, GDP and area axis first uses the country's baseline logarithmic size normalized over the playable world. Let `s = 0.50 × population + 0.30 × GDP + 0.20 × area`, let `L` be Luxembourg's resulting score, and let `r = clamp((s − L) / (1 − L), 0, 1)`:

```text
baseWeeks = round(52 × (12.5 + 25r + 50r² + 100r⁴))
integrationWeeks = round(1.02 × baseWeeks)
```

Peaceful defensive federation uses the same visible integration state with `federationIntegrationWeeks = round(0.25 × integrationWeeks)`. Ownership changes at the start of the voluntary union, but each territory's population, economy, condition, deployed manpower and manpower-weighted base ATK/DEF are preserved exactly. The joining nation's treasury, food stock, trained reserves and strongest research remain on its backend identity until its final core completes, then transfer exactly once through the same retirement path. The old identity is removed afterward, so federation cannot leave a zombie nation or create free stats.

If one side's total deployed manpower reaches zero while the opponent retains combat strength, its remaining land capitulates with the same damage and zero inherited enemy army. Final elimination transfers 25% of the defeated treasury and sets that treasury to zero. If both armies reach zero together, the war ends without mutual absorption.

## 12. Peace

Only the objectively weaker side may request negotiated peace after at least 52 war weeks. Only one offer may be pending, but a declined or expired offer can be retried after a 26-week cooldown. An offer remains open for 26 weeks. Stale wars without a viable front end deterministically.

A paid unilateral ceasefire ends the war without transferring territory, pays 52 weekly instalments and blocks reattack during all payments plus another 52 weeks. Its weekly quote uses up to 45% of payer revenue, capped against 35% of recipient revenue, and every previously accepted paid exit multiplies the next quote by 1.10. If either sovereign disappears, its obligation is cancelled.

## 13. National AI and containment

Rival expansion is intentionally sparse and predictable enough for the map to remain readable:

- a normal AI war start may occur no earlier than week 52 and normal global starts have a 52-week cooldown;
- AI regional escalations have a separate 52-week global cooldown;
- defensive interventions have a 26-week global cooldown;
- the global active-war cap scales slowly from 2 in the early campaign to at most 4 later;
- an ordinary AI country may sustain at most one active war;
- only a major power after week 260 may sustain two active wars;
- normal expansion considers only peaceful ordinary targets, never a country already fighting another war;
- each eight-week review permits only one ordinary expansion commitment roll across all eligible AI countries;
- ordinary commitment probability is bounded to 10–42%, regional escalation to at most 48%, and an opportunistic non-regional dogpile is capped at 8%;
- defensive and containment reactions remain separate from ordinary expansion but still respect their explicit cooldown and global cap.

Strategic initiative rotates deterministically across living AI countries. Legal access, favourable force ratio, treasury runway, fatigue, target value and one modest seeded commitment roll decide whether a credible plan executes. IQ can improve forecast judgement and cash discipline but never declaration appetite. Every country uses the same planner, treasury, supply, defence bonus, casualty and conquest rules. Assigning a country to a human never changes its score or upgrades its AI. A human country's autonomous finance/research/recruitment planner is labelled APEX, while its war declarations remain controlled by that seat.

Capturing territory, rapid Combat Power growth and sustained offensive wars raise global suspicion; peaceful time lowers it. Coalition recruitment begins no earlier than week 156, may add only one member every 52 weeks, requires a higher join threshold and needs five members before containment activates. Nearby states and soft present-day affinity tags may later form permanent defensive federations. Federation cooldown ranges from at least 208 to 312 weeks. A voluntary union changes ownership immediately but integrates each joining core over `0.25 ×` its current conquest duration. Territories and armies retain their live statistics; national cash, food, reserves and strongest research are conserved until exact-once final absorption, after which the obsolete backend identity is removed. Coalition or federation status never multiplies combat, perceived force ratio, runway, declaration chance or target priority against the chosen country; the merged state relies only on its real combined stats and the same IQ-scaled AI.

The active player UI offers no manual Propaganda request button or modal. Compatibility state and engine commands may still load and replay deterministically, but neither the player surface nor shared AI treats Propaganda as a cash-burst purchase.

After the first conquest, that country's human seat may name its empire. The name becomes the single identity of all absorbed territory and persists in canonical saves.

## 14. Direct Connect multiplayer

- A multiplayer room requires 2–8 connected players. Each chooses a unique living country, marks ready and remains locked to that seat after the host starts. Solo canonical state continues to use a one-country roster.
- Signalling is manual per friend. The host creates an invite code, the guest pastes it and creates an answer code, and the host pastes that answer to complete the connection. Codes must match both protocol and V2.57 rules versions and the exact room/invitation pair.
- Direct Connect uses browser WebRTC data channels and the default public Cloudflare STUN endpoint only. It has no account, matchmaking service, dedicated game server or TURN relay. The host tab must remain open; restrictive NAT, school, office, carrier-grade and mobile networks may prevent a route.
- The host is the sole clock and simulation authority. It validates seat ownership, assigns one global command sequence and applies accepted commands at deterministic tick boundaries. Only the host may change shared speed. A guest cannot command another seat or send AI-only escalation actions.
- Guests replay host tick messages on local replicas. Canonical hash checkpoints are sent every eighth eligible tick; a mismatch requests a complete authenticated host snapshot for deterministic resynchronisation. Snapshots are deferred while an authoritative tick or queued command batch is incomplete.
- `humanPlayerIds` is shared canonical state. `viewerPlayerId`, locally read event IDs, open drawers, selected map state and pending local report presentation are per-client runtime state and excluded from saves and hashes.
- Every local UI is calculated from its own assigned viewer. Marking inbox events read in multiplayer never mutates canonical `event.unread` for the other players.
- A post-war report remains a blocking modal for the affected local interface, but it never sets shared speed to zero. The authoritative host clock and the other players continue while that report is open. Solo retains its pause-and-resume behaviour.
- A fully absorbed human country becomes a spectator seat. The shared campaign ends only when no human-controlled country remains alive or the ordinary world-victory condition completes.

## 15. Presentation contract

- All user-facing game copy is English.
- The game is desktop-first; no narrow/mobile breakpoint is required.
- Solo begins with the single global-ranking country picker. Military and economic strength are combined by the geometric-mean formula in section 4; there are no separate military/economic ranking modes. Its Army column shows deployed manpower over capacity as `x / x`. Choosing a country opens the live map directly; there is no preceding explainer or post-selection activation briefing. Choosing **Play With Friends** from that screen opens the Direct Connect lobby, where every connected seat chooses a unique country before the host starts.
- The map shows current ownership, the player's empire outline, active fronts and selected/important country labels. The current top ten powers remain strategically legible.
- Camera zoom reaches 24× with pointer-anchored wheel zoom and constrained panning, making compact countries such as Luxembourg practical to inspect and select.
- Flags use sharp scalable assets. Active integration retains a subtle former-core flag/border/progress treatment; only completed integration removes that identity from the map.
- War, Nation, Progress and Economy are the four primary drawers. Country detail replaces them instead of stacking.
- Economy is a compact read-only dashboard with Treasury, annualized Tax Income, Costs and Net, the dynamic annual growth rate and components, population, wealth, current/max food storage, annualized stock change and explicit net food imports/exports.
- Economy does not show long calculation chains, troop-movement charges or branch-by-branch research accounting.
- Nation is read-only and shows the current AI mode, paid spending, population, food, research and military state. The header and Nation/War surfaces show trained reserves against their one-active-army maximum.
- Progress is read-only for recurring Development; the active UI contains no Rapid Recruitment, Research Surge or Propaganda request controls, confirmations or queued handlers.
- War is the primary decision surface for live fronts, legal targets, forecasts, army upkeep, operations, suspicion and containment.
- Weekly refresh preserves scroll position in drawers and ranking lists.
- War recommendations and confirmation show target food coverage, storage trend, domestic production, GDP, population and the 10% initial integration contribution. War starts and conquests create subtle bottom notifications. Normal notices remain visible for 3.2 seconds, war notices for 4 seconds and conquest notices for 5 seconds; at most four stack at once. Every completed human war queues a perspective-local blocking post-war report containing result/reason, opponent, duration, battles, territory changes, military and civilian losses, economy, treasury, active army/capacity, manpower-weighted base quality and treaty effects. Reports render one at a time with `NEXT REPORT` or `CONTINUE`; duplicate outcomes are ignored. Solo pauses for this queue, while multiplayer leaves the shared clock running. Conquest metric-transfer animation remains visible behind this reporting flow, and country detail shows integration and remaining years.

## 16. Persistence and invariants

Canonical schema-21 saves include schema/rules/content/map versions, seed and RNG state, tick and action sequence, the sorted `humanPlayerIds` roster and compatible primary `humanPlayerId`, nations, territories, wars, truces, offers and AI escalation state. Transient listeners, local viewer identity, locally read inbox IDs, report queues, derived victory projection and visual state are excluded from canonical hashes.

Every completed tick must satisfy:

- all canonical numbers are finite;
- treasury is finite and may be negative;
- population, economy, manpower, capacity and research progress are non-negative;
- manpower is non-negative; recruitment cannot exceed free empire capacity, new local inflow respects the local-plus-empire-share deployment ceiling, and an existing overshoot is never deleted instantly;
- new reserve training stops at one live active-army capacity, while a stored overshoot caused by a later capacity fall is preserved until deployment or real attrition;
- capacity equals the live population/integration/research formula and never contains a budget or crisis penalty;
- condition and integration remain within their declared bounds;
- each territory has exactly one valid living owner;
- a living nation's capital belongs to that nation;
- the human roster contains 1–8 unique, sorted content nations and includes the canonical primary human ID; a Direct Connect lobby additionally enforces 2–8 connected, ready seats with distinct living countries before launch;
- budgets and Development allocations retain their exact sums;
- wars have distinct living participants and no duplicate nation pair;
- army movement and conquest-guard deployment conserve manpower and manpower-weighted base ATK/DEF except for explicit battle losses and documented decisive surrender;
- troop movement never mutates treasury;
- no player record may survive after it has no owned territory, active war or unfinished integration reference; retirement transfers national stores exactly once and invalidates living-nation caches. An absorbed multiplayer seat remains in `humanPlayerIds` as a spectator, the compatible primary moves deterministically to a living human when available, and defeat ends the room only after every human country is gone.

The full invariant set is enforced on every tick in development and automated tests. Production enforces it every eight ticks to avoid an unnecessary full-world rescan on each visible week, while game-over and other terminal paths always force an immediate full check. This changes validation cadence only, never canonical rules or hashes.

## 17. Required automated evidence

The V2.57 suite must cover at minimum:

1. schema-21 save/load deterministic continuation plus authenticated schema-13–20 migration, including the one-country roster fallback, V2.55 six-to-ten research expansion, V2.56 partial-control/territorial-offer retirement, Control-to-Reinforcement-Efficiency normalization, Greenland conservation, singular-to-plural fronts and removal of schema-19 military experience;
2. the exact 10–20% reference-wealth rate and 50/50 GDP/live-population tax identity;
3. the compact Economy presentation, explicit net food import/export direction and absence of obsolete calculation chains or misleading zero-export copy;
4. one treasury, debt, paid spending and explicit front costs;
5. army capacity using only `population × integration × 0.00145 × (1 + 0.01 × research)`;
6. automatic capacity recovery after population/integration/research changes and no budget-driven cap loss;
7. recruitment raising manpower without purchasing capacity;
8. free troop movement with exact treasury conservation;
9. complete absence of a live battle-XP resource, bonus, UI value or war-end award;
10. every deployed soldier in each local front army contributing to combat pressure;
11. direct combat damage using `0.008` effectiveness, exactly half of the former `0.016`, exponent `1`, no per-pulse casualty/damage ceiling and remaining manpower as the only upper bound;
12. movement, merging and conquest-guard deployment conserving manpower and manpower-weighted base quality, while live GDP per capita, IQ and Economy research apply the documented owner-wide 0.50×–1.50× systems layer and research conversion;
13. the global score equalling `sqrt(Combat Power × controlled output)`, with one stable global ordering and no military/economic ranking modes;
14. all four ATK/DEF directions changing the correct casualty stream;
15. equal-force defenders losing less because of the 25% position bonus;
16. direct decisive capture inheriting zero enemy army, preserving only the proportional conquest guard and never creating partial territorial control;
17. full capitulation absorbing every remaining territory and only 25% treasury, followed by exact-once national-store/research transfer and full backend retirement when the last identity reference disappears;
18. land/naval access, distance-scaled naval operations and supply, long-haul sea lanes and no naval assault/casualty multiplier;
19. normal/regional 52-week and defensive 26-week AI cooldowns, one ordinary expansion commitment roll per decision and the documented modest probability caps;
20. active AI war cap of 2–4, ordinary one-war limit and post-week-260 major two-war limit;
21. ordinary expansion filtering out targets already at war;
22. exact ten always-active Development programs and funding conservation;
23. the same national planner for every country, no selection-based superiority and only the bounded national-IQ efficiency/response scaling;
24. eight-week budget and research reviews moving at most the IQ-scaled two-to-four-point total step toward each target;
25. exhaustive per-tick invariants in development/tests, the exact every-eight-tick production cadence, forced terminal validation and multi-seed soak coverage;
26. every human-controlled country's finance/Development automation continuing without autonomous declarations on behalf of that seat;
27. expansion suspicion, containment and federation conservation, including `0.25 ×` peaceful integration, exact stat preservation and no zombie member record after final fusion;
28. first-conquest empire naming and persistence;
29. conquest starting at 10%, every new duration being exactly `1.02 ×` the original size curve (~12.8/~26/~173 years), and completion permanently replacing former core identity without changing population, economy, condition, manpower, force quality or routes;
30. two or more source armies resolving as real battles in the same front round;
31. healthy post-war AI recruiting toward 100%, with demobilisation only in an extreme crisis and never above 0.05% per week;
32. Greenland remaining separate from Denmark with valid flags, fiscal calibration and Arctic sea routes;
33. top-ten map labels, sharp flags, visible active integration, 24× zoom and country-picker-to-map flow without intro or briefing screens;
34. the picker showing one global rank and Army as deployed/capacity (`x / x`), the top bar showing reserve/one-active-army capacity, plus the documented 3.2/4/5-second notification timings;
35. recruitment and logistics using local cap plus 1% of empire cap for foreign conquests and 2.5% after full integration, with pre-existing overshoot preserved and only gradually rerouted;
36. a manpower-conserving foreign-capture guard staying protected from outbound logistics for exactly 52 weeks before normal redeployment;
37. cached map ownership, border, front, label, logistics and national-IQ derivations plus reused military/power snapshots preserving identical results while avoiding redundant weekly, phase and zoom work;
38. post-war outcomes queueing one deduplicated blocking report at a time with complete territorial, casualty, economic, treasury, army, capacity, force-quality and treaty summaries, pausing solo but never the shared multiplayer clock;
39. the active V2 player UI containing no Rapid Recruitment, Research Surge or Propaganda request card, modal, action or queued handler, while compatibility fields continue deterministic save/replay;
40. complete canonical and live-path absence of immigration/refugee displacement and partial territorial occupation while retaining local battle casualties, food mortality, direct decisive capture and authenticated legacy stripping;
41. a sorted schema-21 `humanPlayerIds` roster, distinct 2–8 multiplayer country seats, deterministic primary-human fallback after absorption and local viewer state excluded from saves and hashes;
42. manual invite/answer signalling, protocol/rules/room compatibility checks, unique lobby country claims, ready-state launch gating and the documented 2–8 capacity;
43. host-only clock/speed authority, host-side seat authorization, globally sequenced commands, deterministic tick broadcasts and rejection of cross-seat or AI-only actions;
44. guest replica convergence, every-eighth-eligible-tick hash checkpoints, mismatch-triggered resync and safe authoritative snapshot deferral while commands or ticks are incomplete;
45. the public STUN-only Direct Connect configuration and clear failure behaviour when WebRTC or a direct network route is unavailable;
46. per-client viewer perspective, locally read inbox state and local war-report queues never mutating another player's canonical state or pausing the host simulation.
