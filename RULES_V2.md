# Frontier Command — Rules V2.60

This document is the authoritative gameplay and simulation contract. If presentation copy, tests and code disagree, they must be reconciled in the same change.

## 1. Product promise

- Solo assigns one current country; Direct Connect assigns one distinct current country to each of 2–8 human players, never a starting alliance.
- Every living country, including the chosen country, uses the same deterministic national AI planner for finance, Development, recruitment, recovery and front execution.
- **APEX** is only the presentation name for a human country's autopilot. Choosing a country grants no AI-efficiency, planning-cadence or strategy advantage; that country's human seat alone chooses its war and peace actions. Human control amplifies only that country's one published trait as specified in section 4.
- National IQ is the shared AI's only skill input. A higher bounded score provides a modest improvement in execution and allocation response, never a separate ruleset. The same published score also contributes transparently to live national combat-system quality alongside GDP per capita and research; it is not a hidden selection bonus.
- At normal speed the game advances continuously at one simulated week per real second. Combat is live and contains no dice interaction; only the room host may change multiplayer speed.
- The campaign continues until one owner controls the complete playable map.
- Every starting country must have a plausible route to victory. Catch-up improves development, recruitment and rebuilding; it never grants hidden raw combat damage.
- A strategically foolish player declaration remains legal when identity, access, treasury, duplicate-war and truce rules permit it.
- The presentation is desktop-first. Narrow layouts must still preserve a usable map and the primary Economy/Treasury header information.

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

V2.60 uses schema version 22 and rules version `frontier-command-v2.60-revolutions-debt`. Canonical state stores a sorted, unique `humanPlayerIds` roster of one to eight content nations and a `humanPlayerId` primary compatible with solo systems; a Direct Connect campaign uses two to eight of those seats. A client's current `viewerPlayerId` is local runtime state, not canonical state, and therefore never changes the save hash.

Authenticated same-schema V2.59 saves are accepted only after their exact original payload hash is verified, then normalize to V2.60. Authenticated schema 13–21 migrations remain deterministic, incompatible rules versions are rejected, and every existing active integration endpoint remains immutable after load.

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

The permanent header presents compact primary values for Economy, Treasury, APEX mode, Population, Food, Army and Research, with Treasury immediately beside Economy and a distinct debt state. Army is displayed as deployed manpower over live capacity (`x / x`), followed by trained reserve over its one-active-army cap and live Combat Power. Military rank remains a badge, not a resource.

Manpower is the complete number of trained deployed soldiers. Capacity is only the current recruitment ceiling. Empty capacity adds no combat power and a partly filled army does not make each deployed soldier individually weaker.

Combat Power is derived from deployed manpower, effective ATK, effective DEF, condition and supply. AI target selection, forecasts and live combat use the same underlying selectors. Every opening army receives its country's calibrated base ATK and DEF. Movement and conquest-guard deployment preserve the source force's base quality; merging armies blends it by manpower; automatic recruitment adds the original profile of the territory where those soldiers are raised. Casualties preserve the surviving average, while an empty army resets to its local recruitment profile. Federation changes ownership without diluting any army. National ATK/DEF is a manpower-weighted display/outcome snapshot only; total Combat Power is the additive sum of local armies.

Opening ATK and DEF use one constant-time country calibration. `clamp(powerIndex / (100 × deployedOpeningManpower) × openingQuality, 0.35, 14)` sets the combined per-soldier rating, where opening GDP per capita and IQ use 65%/35% weights inside the small conserved 0.97×–1.03× `openingQuality` range. SIPRI spending per deployed soldier adds a symmetric tilt: equipment-heavy forces lean toward ATK, manpower-heavy forces toward DEF, while `0.55 × ATK + 0.45 × DEF` remains unchanged. This small local imprint is carried by soldiers and is deliberately separate from the stronger live owner-wide system below.

Effective combat then applies one live owner-wide national-systems layer without rewriting those conserved local profiles. Let `income` be current integrated GDP per capita normalized logarithmically from `$500` to `$250,000`, and `iq` be national IQ normalized from 80 to 108:

```text
systemQuality = 1 + 1.30 × (0.65 × income + 0.35 × iq − 0.50)
  // 0.35×–1.65× across opening IQ bounds; 1.715× at researched IQ 112
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

There is one global military ranking and no blended or economic table:

```text
globalScore = max(0, CombatPower)
```

Living nations sort by descending live Combat Power, then stable country ID. Controlled economy remains visible and affects combat only through the explicitly documented GDP-per-capita system layer; it is never multiplied into rank a second time. The country picker, header badge and ranking drawer all use this same order.

Every content nation has exactly one immutable country trait keyed by its original 2026 nation ID. Trait names, mechanical effects, conditions and identity copy are English. Every trait declares an audited opening weakness and at least one modifier directly improves that weakness; bonuses grow materially toward the bottom of the immutable opening military order. Greenland is the extreme case: +1,200% Army capacity, +150% recruitment throughput and −80% upkeep give the smallest opening army room to become playable. Human amplification may never reduce its final upkeep factor below the hard 0.10 floor, so the force remains paid rather than free.

Conquest, integration, revolution, capitulation and defensive federation never copy, donate or combine catalog entries: an empire always evaluates only its leader's original trait, while a restored 2026 nation resumes only its own. Human control multiplies each signed modifier's distance from neutral, and each fixed replacement's distance from its source, without adding another trait:

```text
r = (openingMilitaryRank − 1) / 165
smoothRank = r² × (3 − 2r)
humanTraitMultiplier = 1.08 + 0.72 × smoothRank
```

The strongest opening country therefore receives 1.08× of its published signed percentages and the weakest receives 1.80×. Greenland's +1,200% capacity becomes +2,160% when human-controlled. Internal IDs and modifier mechanics remain unchanged.

## 5. Tick order and determinism

At each weekly tick the engine performs, in order:

1. Apply queued player commands in action-sequence order.
2. Advance the canonical tick.
3. Resolve any keyed integration revolution scheduled for this tick, before finance is projected.
4. Synchronise every army capacity from live owned population, integration and Force Capacity research.
5. Snapshot and apply weekly finance, upkeep, recruitment and condition changes.
6. Apply passive Development progress and breakthroughs.
7. Apply population and economic development, then resynchronise capacity where needed.
8. Redistribute armies and resolve active wars.
9. Update expansion suspicion and permanent containment escalation.
10. Apply deterministic AI commands.
11. Derive victory and prune history.
12. Run the scheduled full-state integrity boundary.
13. Notify presentation listeners.

All ordinary randomness advances the saved seeded RNG. Integration revolutions use a separate immutable hash of seed, territory and frozen program fields, so their one roll never perturbs another future result. The same seed, globally ordered commands and tick count must produce the same canonical hash. Development and tests run the exhaustive invariant scan after every tick. Production runs the same scan every eight ticks and forces it immediately on game-over or other terminal tick paths.

Cross-border immigration/displacement and partial territorial occupation remain absent from the weekly hot path. National-IQ views are cached by state, country, content and live IQ-research level. Finance, research, AI, resistance, ranking and war consumers accept and reuse already-built military/power snapshots within their phase so downstream selectors do not rebuild the same world view repeatedly.

## 6. Simple tax and one treasury

The player does not manually allocate a budget. Every national AI runs the same planner, chooses an exact-100 policy and derives an adaptive active plan from treasury runway, food coverage and reserves, live population growth, army gaps, territory damage, technology gap and active fronts. APEX is only the chosen country's autopilot label; selection never changes the planner or its inputs. Its only selection-specific mechanical change is the published amplification of that country's existing trait in section 4.

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

Cash above `0.10 × live controlled GDP` becomes a gradual recurring investment source. Activation follows `smoothstep(0, 0.05 × GDP, excess)`, and the weekly draw is the minimum of the actual excess, `0.02 × excess`, and `0.25 × weekly revenue × activation`. Real unmet upkeep, recruitment and reserve-training needs are filled first; any remainder splits 35–65% to Research according to the live non-military budget and sends the balance to Development. This uses existing stats and creates no purchasable burst, hidden resource or sudden cash deletion.

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

Fiscal reference wealth is measured in thousands of dollars per immutable reference person, so `$75K` reaches the 20% end of the range. Using that reference for the rate prevents live population from algebraically cancelling its own contribution or lowering the rate when it grows. At baseline `populationFactor = 1`, so taxable output equals integrated GDP and opening income preserves the old calibration. With fixed GDP, tax then rises monotonically with more live productive people and falls with losses; even at zero live population the stable economy half retains 50% of the taxable-output base for a possible food and population recovery. This blend changes only tax: real integrated GDP remains the Economy value used by strategic systems, growth and conquest, while rank remains pure Combat Power. The UI may still show live GDP per person, which falls when population grows against unchanged production. No condition or war modifier is hidden inside the rate, and integration applies equally to live population, its reference and GDP.

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

The Economy drawer shows this final percentage and its five components next to treasury, tax, costs, net, population, wealth per person, and food. Treasury also appears directly beside Economy in the permanent header, with negative values visibly marked. Recurring player-facing amounts are annualized while canonical settlement remains weekly. The trade card computes `foodExported − foodImported` and explicitly presents **Net Food Imports**, **Net Food Exports** or balanced trade; zero export income must never hide positive imports behind a misleading “none” message. It remains compact and does not expose branch-by-branch research arithmetic or obsolete movement costs.

One treasury first pays a universal Base Operations cost that starts at `0.20 × ordinary weekly tax revenue`; Public Administration research can gradually lower that share toward `0.15`, and the Economy ledger shows the live rate. Remaining tax revenue is available to food and normal programmes. It then pays food, army upkeep, recruitment and reserve training, research, national development, active-front operations, treaty obligations and any debt premium. Domestic food depends on land, terrain, condition, integration, research and live territory economic strength; India-origin agricultural territory receives a 1.30 yield multiplier. More expensive imports fill the remaining reachable demand. Food storage is finite: population demand supplies the base capacity, controlled landmass adds physical capacity, and wealth plus Food Systems research improve it. As stock falls below its target, every country's funded purchase request rises smoothly and may progressively use positive treasury reserves before weekly coverage fails. During a live shortage, extra reserve-starvation mortality starts below 10% of target stock and rises toward the empty-reserve maximum. The top bar reports current/max food and the projected annualized stock change.

Treasury may become negative. Each increase in principal pays a 10% origination premium. Let `debtWeeks = max(0, −treasury / weeklyRevenue)`: the first week is a liquidity grace band; recovery pressure rises by smoothstep from 1 to 26 weeks and critical pressure from 26 to 52. Those pressures progressively contract existing programme envelopes and raise food-import costs by up to 30% plus 20%. Opening debt that remains after the weekly result begins a carrying premium after two debt-weeks, reaches full activation at eight, and uses `0.05% + 0.15% × recovery + 0.20% × critical` per week, capped at 25% of weekly revenue. Mandatory survival costs remain real and peace/war programme floors stay at 35%/45%, so shallow debt is recoverable while sustained debt becomes dangerous.

At peace, food shortage, less than two weeks of reserves, live population decline or debt activates survival recovery. Development is prioritised, food/logistics research gains weight and optional new wars are blocked. Any emergency transfer from Development into immediate food funding scales continuously with shortage and reserve stress, so crossing a threshold cannot create a sudden cost cliff. Territory damage, post-war fatigue, an ordinary deficit or a routine recovery plan never permits demobilisation. A solvent, fed country protects payroll and recruits toward 100% of live capacity. Only an extreme food or debt emergency that also makes payroll genuinely unaffordable may shrink the deployed force, and never below 25% of live Army capacity; the AI rebuilds toward full capacity as soon as that emergency ends. During an active war, Armed Forces becomes the largest priority, but the AI keeps an essential development floor so victory does not automatically destroy the civilian system.

Armed Forces pays mandatory upkeep before mobilization. Capacity is never purchased and cannot be reduced by an underfunded week. Fully maintained forces receive a slow active training pipeline of 0.1% of live capacity per peaceful week, improved by Training research and limited by food. If readiness is low, recurring surplus military funding may purchase a peacetime fast-track at 2.5× normal unit cost. Only after projected deployed strength reaches full capacity within the one-millionth canonical rounding tolerance does paid training begin filling the separate reserve pool, up to exactly `1 ×` live active capacity. In war, the bounded passive and paid-emergency throughputs instead mobilise existing reserves into active gaps at `3 ×` the matching fresh-training throughput; ordinary weekly recruitment adds no second source of fresh active manpower. Paid reserve training continues at exactly 5% of the normal peace pipeline, so sustained losses ordinarily drain the pool much faster than it grows. A later capacity fall blocks new reserve growth but never deletes stored personnel. Base ATK/DEF quality raises unit cost on a bounded square-root curve; Reinforcement Efficiency and the same modest national-IQ efficiency used by every country reduce it. The sole extreme-crisis drawdown may remove at most `0.0005 × deployed manpower`, or 0.05%, per week and stops at a 25%-of-live-capacity home guard. It has no instant or accelerated second path and never changes capacity.

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

The universal population share is `0.00145`. Homeland integration is 1. A foreign conquest starts at 0.10 and therefore supplies 10% of its structural cap; integration then unlocks the remainder. Military quality, defence spending, starting army size, territory condition, treasury, war fatigue and budget funding do not modify capacity. Capacity automatically rises again when population, integration or research supports it; no permanent crisis penalty exists.

War Strain is one canonical derived score shared by AI and HUD. With `effectiveFronts = landFronts + 0.35 × navalFronts`, `baseFrontStrain = 8 + 6 × min(1, effectiveFronts)`, `extraWars = max(0, activeWars − 1)`, `extraFronts = max(0, effectiveFronts − 1)`, and army/reserve fill clamped to `[0,1]`:

```text
at war: round(clamp(
  baseFrontStrain + 6 × log2(1 + extraWars) + 5 × log2(1 + extraFronts)
  + 0.48 × fatigue + 18 × (1 − armyFill) + 12 × (1 − reserveFill),
  0, 100))
at peace: round(0.65 × fatigue)
```

The labels change at 30 (Stretched), 55 (Overextended) and 75 (Critical Overreach). One fully supplied fresh land front therefore remains 14, while one fresh naval front rounds to 10. Logarithmic war/front terms make additional simultaneous fronts matter much less than the old additive load. Fatigue gained from each naval battle pulse is multiplied by 0.65 for both sides; capture, treaty and post-war transition fatigue keep their ordinary values. The consequence row reads already-canonical output, growth, research and operation-cost effects; the score's additional mechanical consumer is the high-strain human-target opportunity in section 13.

Recruitment spends recurring military funding to fill free national capacity and, after full active readiness in peace, to train the finite national reserve. Training, Recovery and the same bounded IQ efficiency may change automatic recruitment speed or price, but never the capacity formula. A conquered frontier begins with 10% of its native local cap and may station existing soldiers up to that local cap plus 10% of total empire Army cap. The foreign support share then declines linearly with integration from 10% at `integration = 0.10` to 5% at `integration = 1`; original homeland uses its separate 3% support share. This is a deployment allowance, not a required troop count, and creates neither troops nor national capacity. Existing trained personnel are not deleted if later population loss or recalculation leaves them above that ceiling; logistics gradually reroutes only real excess manpower.

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

For a foreign capture, up to 10% of surviving source manpower moves into the captured territory as a real conquest guard, bounded by its local cap plus 10% of total empire Army cap. The same headcount is removed from the source, so enemy manpower is never inherited and conquest creates no troops or military quality. The scalable deployment allowance declines linearly to 5% of empire cap at full integration. During the first 52 weeks after capture the guard may receive reinforcement but ordinary empire logistics cannot use it as an outbound donor.

On capture:

- owner changes directly and completely to the victor;
- surviving population, economy and condition remain as the territory's full potential after explicit battle damage;
- a foreign owner starts at exactly `integration = 0.10`; an original-owner recapture restores `integration = 1`;
- population capacity, taxable output, food production and army capacity all use that same visible integration share;
- the remaining 90% unlocks linearly over one fixed duration derived from immutable baseline population (50%), GDP (30%) and land area (20%); every new conquest calendar is exactly `1.02 ×` the original duration, so Luxembourg takes about 12.8 years, Belgium 26 and China 173;
- the base annual administration quote is `0.03 × live territory GDP at capture`; the active owner's one integration-cost trait applies once and the resulting annual amount is frozen in the program. Weekly finance pays one fifty-second of it until completion, sovereign recapture or revolution deletes that program;
- integration speed is calendar-based and is never changed by budget, AI efficiency, war or later growth;
- every frozen program makes exactly one seed-stable revolution roll with 2% probability; a destined event is placed from 20% through 80% of that program's frozen duration and consumes no campaign RNG;
- a revolution restores ownership, `coreOwner` and full integration to `content.territories[id].initialOwnerId`, the immutable 2026 start nation—not the latest owner, mutable core or federation leader. If absorbed, that identity is revived with zero treasury, food, reserves and inherited research so already-transferred national stores cannot duplicate; territory population, economy, condition and deployed army quality are preserved;
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

- every new declaration is rejected centrally while the attacking country's treasury is below zero; existing wars continue and the gate reopens at zero;
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

For a human-controlled target only, `pressure = smoothstep(65, 85, WarStrain)`. Candidate priority gains up to 36 points, declaration commitment gains up to 16 percentage points, and caution toward existing rival invaders is multiplied by `1 − 0.65 × pressure`. A strained human target may have at most one attacker below score 75, two at 75–84, or three at 85+. At score 75+, those AI pressure wars remain independent instead of generating extra rival-invader wars, so every attacker still respects its ordinary concurrent-war allowance and each new target war counts normally against the global cap. Legal access, truces, survival/food/treasury gates, force ratio and forecast requirements still apply, and the planner still uses one ordinary seeded expansion roll.

Strategic initiative rotates deterministically across living AI countries. Legal access, favourable force ratio, treasury runway, fatigue, target value and one modest seeded commitment roll decide whether a credible plan executes. IQ can improve forecast judgement and cash discipline but never declaration appetite. Every country uses the same planner, treasury, supply, defence bonus, casualty and conquest rules. Assigning a country to a human never upgrades its AI; it only amplifies that one original trait by the published military-rank curve. A human country's autonomous finance/research/recruitment planner is labelled APEX, while its war declarations remain controlled by that seat.

Capturing territory, rapid Combat Power growth and sustained offensive wars raise global suspicion; peaceful time lowers it. Coalition recruitment begins no earlier than week 156, may add only one member every 52 weeks, requires a higher join threshold and needs five members before containment activates. Nearby states and soft present-day affinity tags may later form permanent defensive federations. Federation formation is evaluated only when `tick % 104 = 0`. The adaptive human-threat policy uses threshold 75–86 and a 312–416-week cooldown; the ordinary baseline is 86 and 416. AI-expansion reactions cannot begin before tick 832, also use the 104-week window, and share the 416-week global cooldown. A new federation begins as one founding pair and can absorb at most one country on each later eligible wave. The sorted founder pair permanently determines a stable identity word and a visible name ending in **Defense Federation**. A voluntary union changes ownership immediately but integrates each joining core over `0.25 ×` its current conquest duration. Territories and armies retain their live statistics; national cash, food, reserves and strongest research are conserved until exact-once final absorption, after which the obsolete backend identity is removed. Coalition or federation status never multiplies combat, perceived force ratio, runway, declaration chance, target priority or any other stat; the merged state relies only on its real combined stats and the same IQ-scaled AI.

The active player UI offers no manual Propaganda request button or modal. Compatibility state and engine commands may still load and replay deterministically, but neither the player surface nor shared AI treats Propaganda as a cash-burst purchase.

After the first conquest, that country's human seat may name its empire. The name becomes the single identity of all absorbed territory and persists in canonical saves.

## 14. Direct Connect multiplayer

- A multiplayer room requires 2–8 connected players. Each chooses a unique living country, marks ready and remains locked to that seat after the host starts. Solo canonical state continues to use a one-country roster.
- Signalling is manual per friend. The host creates an invite code, the guest pastes it and creates an answer code, and the host pastes that answer to complete the connection. Codes must match both protocol and V2.60 rules versions and the exact room/invitation pair.
- Direct Connect uses browser WebRTC data channels and the default public Cloudflare STUN endpoint only. It has no account, matchmaking service, dedicated game server or TURN relay. The host tab must remain open; restrictive NAT, school, office, carrier-grade and mobile networks may prevent a route.
- The host is the sole clock and simulation authority. It validates seat ownership, assigns one global command sequence and applies accepted commands at deterministic tick boundaries. Only the host may change shared speed. A guest cannot command another seat or send AI-only escalation actions.
- Guests replay host tick messages on local replicas. Canonical hash checkpoints are sent every eighth eligible tick; a mismatch requests a complete authenticated host snapshot for deterministic resynchronisation. Snapshots are deferred while an authoritative tick or queued command batch is incomplete.
- `humanPlayerIds` is shared canonical state. `viewerPlayerId`, locally read event IDs, open drawers, selected map state and pending local report presentation are per-client runtime state and excluded from saves and hashes.
- Every local UI is calculated from its own assigned viewer. Marking inbox events read in multiplayer never mutates canonical `event.unread` for the other players.
- A post-war report remains a blocking modal for the affected local interface, but it never sets shared speed to zero. The authoritative host clock and the other players continue while that report is open. Solo retains its pause-and-resume behaviour.
- A fully absorbed human country becomes a spectator seat. The shared campaign ends only when no human-controlled country remains alive or the ordinary world-victory condition completes.

## 15. Presentation contract

- All user-facing game copy is English.
- The game is desktop-first; narrow/mobile layouts still preserve the playfield and primary Economy/Treasury information.
- Solo begins with the single pure military-ranking country picker. Its Combat Power order is identical to the header and ranking drawer, with no blended/economic mode. Its Army column shows deployed manpower over capacity as `x / x`. Choosing a country opens the live map directly; there is no preceding explainer or post-selection activation briefing. Choosing **Play With Friends** from that screen opens the Direct Connect lobby, where every connected seat chooses a unique country before the host starts.
- The map shows current ownership, the player's empire outline, active fronts and selected/important country labels. The current top ten powers remain strategically legible. Land combat is rendered as a warm solid contact line on the real shared border, plus directional armored chevrons and ground-shock pulses. Naval combat is deliberately distinct: cool curved dashed sea lanes, fleet-and-wake markers and splash impacts. Combat strokes retain screen-pixel width across zoom levels; only active operations animate, at a bounded cadence, and reduced-motion mode keeps a static presentation.
- Camera zoom reaches 24× with pointer-anchored wheel zoom and constrained panning, making compact countries such as Luxembourg practical to inspect and select.
- Flags use sharp scalable assets. Active integration retains a subtle former-core flag/border/progress treatment; only completed integration removes that identity from the map.
- War, Nation, Progress and Economy are the four primary drawers. Country detail replaces them instead of stacking.
- Economy is a compact read-only dashboard with Treasury, annualized Tax Income, Costs and Net, the dynamic annual growth rate and components, population, wealth, current/max food storage, annualized stock change and explicit net food imports/exports. The live Treasury value is also shown immediately beside Economy in the header and marks debt clearly.
- Economy does not show long calculation chains, troop-movement charges or branch-by-branch research accounting.
- Nation is read-only and shows the current AI mode, paid spending, population, food, research and military state. The header and Nation/War surfaces show trained reserves against their one-active-army maximum.
- Progress is read-only for recurring Development; the active UI contains no Rapid Recruitment, Research Surge or Propaganda request controls, confirmations or queued handlers.
- War is the primary decision surface for live fronts, legal targets, forecasts, army upkeep, operations, suspicion and containment.
- Weekly refresh preserves scroll position in drawers and ranking lists.
- War recommendations and confirmation show target food coverage, storage trend, domestic production, GDP, population and the 10% initial integration contribution. War starts and conquests create subtle bottom notifications. Normal notices remain visible for 3.2 seconds, war notices for 4 seconds and conquest notices for 5 seconds; at most four stack at once. Every completed human war queues a perspective-local blocking post-war report containing result/reason, opponent, duration, battles, territory changes, military and civilian losses, economy, treasury, active army/capacity, manpower-weighted base quality and treaty effects. Reports render one at a time with `NEXT REPORT` or `CONTINUE`; duplicate outcomes are ignored. Solo pauses for this queue, while multiplayer leaves the shared clock running. Conquest metric-transfer animation remains visible behind this reporting flow, and country detail shows integration and remaining years.

## 16. Persistence and invariants

Canonical schema-22 saves include schema/rules/content/map versions, seed and RNG state, tick and action sequence, the sorted `humanPlayerIds` roster and compatible primary `humanPlayerId`, nations, territories, wars with revenge state, truces, offers, alliances, alliance offers and AI escalation state. Transient listeners, local viewer identity, locally read inbox IDs, report queues, derived victory projection, trait projections and visual state are excluded from canonical hashes.

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

The V2.60 suite must cover at minimum:

1. schema-22 save/load deterministic continuation, authenticated same-schema V2.59 normalization and authenticated schema-13–21 migration, including the one-country roster fallback, Greenland conservation, singular-to-plural fronts and removal of retired military/territorial systems;
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
12. movement, merging and conquest-guard deployment conserving manpower and manpower-weighted base quality, while 65% GDP per capita, 35% IQ and Economy research apply the documented owner-wide 0.35×–1.65× opening-bounds system layer, 1.715× researched-IQ ceiling and research conversion;
13. the global score equalling current Combat Power, with picker, header and ranking drawer sharing one stable pure-military ordering;
14. all four ATK/DEF directions changing the correct casualty stream;
15. equal-force defenders losing less because of the 25% position bonus;
16. direct decisive capture inheriting zero enemy army, preserving only the proportional conquest guard and never creating partial territorial control;
17. full capitulation absorbing every remaining territory and only 25% treasury, followed by exact-once national-store/research transfer and full backend retirement when the last identity reference disappears;
18. land/naval access, distance-scaled naval operations and supply, long-haul sea lanes and no naval assault/casualty multiplier;
19. normal/regional 52-week and defensive 26-week AI cooldowns, one ordinary expansion commitment roll per decision and the documented modest probability caps;
20. active AI war cap of 2–4, ordinary one-war limit and post-week-260 major two-war limit, including independent score-75/85 human-overreach pressure wars that remain inside those attacker and global caps;
21. ordinary expansion filtering out targets already at war;
22. exact ten always-active Development programs and funding conservation;
23. the same national planner for every country, no selection-based AI superiority and only the documented one-trait human amplification plus bounded national-IQ efficiency/response scaling;
24. eight-week budget and research reviews moving at most the IQ-scaled two-to-four-point total step toward each target;
25. exhaustive per-tick invariants in development/tests, the exact every-eight-tick production cadence, forced terminal validation and multi-seed soak coverage;
26. every human-controlled country's finance/Development automation continuing without autonomous declarations on behalf of that seat;
27. expansion suspicion, containment and federation conservation, including threshold 75–86, 104-week formation windows, 312–416-week cooldowns, tick-832 AI reactions, founding-pair-specific names, `0.25 ×` peaceful integration, exact stat preservation, no hidden multiplier and no zombie member record after final fusion;
28. first-conquest empire naming and persistence;
29. conquest starting at 10%, every new duration being exactly `1.02 ×` the original size curve (~12.8/~26/~173 years), a frozen 3%-of-capture-GDP annual administration quote, a single 2% keyed revolution restoring only the immutable 2026 owner, and completion permanently replacing former core identity without changing population, economy, condition, manpower, force quality or routes;
30. two or more source armies resolving as real battles in the same front round;
31. healthy post-war AI recruiting toward 100%, with demobilisation only in an extreme crisis and never above 0.05% per week;
32. Greenland remaining separate from Denmark with valid flags, fiscal calibration and Arctic sea routes;
33. top-ten map labels, sharp flags, visible active integration, 24× zoom and country-picker-to-map flow without intro or briefing screens;
34. the picker showing the same pure military rank as header/drawer and Army as deployed/capacity (`x / x`), the top bar showing Treasury beside Economy and reserve/one-active-army capacity, plus the documented 3.2/4/5-second notification timings;
35. recruitment and logistics using local cap plus a foreign empire-support curve declining from 10% at integration start to 5% at completion, with pre-existing overshoot preserved and only gradually rerouted;
36. a manpower-conserving foreign-capture guard staying protected from outbound logistics for exactly 52 weeks before normal redeployment;
37. cached map ownership, border, front, label, logistics and national-IQ derivations plus reused military/power snapshots preserving identical results while avoiding redundant weekly, phase and zoom work;
38. post-war outcomes queueing one deduplicated blocking report at a time with complete territorial, casualty, economic, treasury, army, capacity, force-quality and treaty summaries, pausing solo but never the shared multiplayer clock;
39. the active V2 player UI containing no Rapid Recruitment, Research Surge or Propaganda request card, modal, action or queued handler, while compatibility fields continue deterministic save/replay;
40. complete canonical and live-path absence of immigration/refugee displacement and partial territorial occupation while retaining local battle casualties, food mortality, direct decisive capture and authenticated legacy stripping;
41. a sorted schema-22 `humanPlayerIds` roster, distinct 2–8 multiplayer country seats, deterministic primary-human fallback after absorption and local viewer state excluded from saves and hashes;
42. manual invite/answer signalling, protocol/rules/room compatibility checks, unique lobby country claims, ready-state launch gating and the documented 2–8 capacity;
43. host-only clock/speed authority, host-side seat authorization, globally sequenced commands, deterministic tick broadcasts and rejection of cross-seat or AI-only actions;
44. guest replica convergence, every-eighth-eligible-tick hash checkpoints, mismatch-triggered resync and safe authoritative snapshot deferral while commands or ticks are incomplete;
45. the public STUN-only Direct Connect configuration and clear failure behaviour when WebRTC or a direct network route is unavailable;
46. per-client viewer perspective, locally read inbox state and local war-report queues never mutating another player's canonical state or pausing the host simulation;
47. exactly one original country trait per empire across conquest, revolution, federation and integration; complete English visible copy; opening-weakness coverage; stronger bottom-country bonuses; and the immutable 1.08×–1.80× human curve without stacking;
48. logarithmic multi-front War Strain and the bounded score-65–85 AI opportunity against each human seat without bypassing declaration gates;
49. one revenue-week debt grace, progressive programme/import/carrying consequences through 26/52 revenue-weeks, a 25%-capacity home guard and recovery from a temporary deficit;
50. smooth productive investment of cash above 10% of live GDP, respecting the 5%-GDP ramp, 2%-of-excess and 25%-of-revenue weekly caps and using only existing readiness, Research and Development systems.
