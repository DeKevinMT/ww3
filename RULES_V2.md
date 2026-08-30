# Frontier Command — Rules V2.75

This document is the authoritative gameplay and simulation contract. If presentation copy, tests and code disagree, they must be reconciled in the same change.

## 1. Product promise

- Solo assigns one current country; multiplayer assigns one distinct current country to each of 2–8 permanently allied human co-op seats.
- Every living country, including the chosen country, uses the same deterministic national AI planner for finance, Development, recruitment, recovery and front execution.
- **APEX** is the account-wide allied intelligence and one non-territorial neural-shield platform. It starts at 100% of its `0.0008` compatibility-unit Max Integrity with 125 DOME ATK / 125 DOME DEF, `0.010` stored projection energy and about 100 operational DOME POWER. Integrity is shield HP, not personnel: APEX never contributes national manpower, capacity, reserves, territory ownership or a second army. At 0% the dome collapses, extracts to a safe Empire node, recharges and returns only at 100%. Its level has no authored endpoint and every level grants exactly one free point for the branching neural-grid talent paths. Deep specialisation unlocks three save-stable capstones: Singularity Pulse gives every third supported offensive battle `1.60×` DOME ATK; Mirror Matrix returns `20%` of damage actually intercepted as a counterpulse bounded by hostile personnel; Twin Projection supports two distinct legal fronts at `60%` each while both drain the same single Integrity and energy pool. APEX autonomously selects the highest-impact legal front while the human chooses wars and has no manual movement controls.
- National IQ is the shared AI's only skill input. A higher bounded score provides a modest improvement in execution and allocation response, never a separate ruleset. The same published score also contributes transparently to live national combat-system quality alongside GDP per capita and research; it is not a hidden selection bonus.
- At normal speed the game advances continuously at one simulated week per real second. Combat is live and contains no dice interaction; only the room host may change multiplayer speed.
- Campaign ends in victory when the Rogue intelligence is defeated and in defeat when the player's empire is eliminated. Survival is the later terminal timeline; Alternative Universe is an unbalanced zero-progression sandbox. All three can use the same multiplayer toggle.
- Every starting country must have a plausible route to victory. Catch-up improves development, recruitment and rebuilding; it never grants hidden raw combat damage.
- A strategically foolish player declaration remains legal when identity, access, treasury, duplicate-war and truce rules permit it.
- The presentation is desktop-first. Narrow layouts must still preserve a usable map and the primary Economy/Treasury header information.

## 2. World content

The map contains 166 playable countries derived from Natural Earth geometry and recent World Bank/SIPRI baselines. Microstates and very small islands are filtered for readability and performance. Greenland is an explicit exception: it has its own owner, data, flag and strategic sea routes to Canada and Iceland.

The 2026 scenario begins with the Russia–Ukraine, Israel–Palestine and Afghanistan–Pakistan border fronts active. Territory has no generic land-health or repair meter. Ongoing internal conflicts in Sudan, Myanmar, Yemen, Somalia and eastern DR Congo begin as explicitly authored reductions to output and army readiness, not fabricated interstate wars. Scenario instability does not count as aggression by the chosen player country.

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

The current simulation uses schema version 22 and rules version `frontier-command-v2.75-no-land-condition`. Canonical state stores a sorted, unique `humanPlayerIds` roster of one to eight content nations and a `humanPlayerId` primary compatible with solo systems; a multiplayer campaign uses two to eight of those seats. A client's current `viewerPlayerId` is local runtime state, not canonical state, and therefore never changes the save hash.

The legacy-named `communicationsBlackoutTick` is only a save-stable Stage-I completion marker. It never authorises ordinary-map dimming, a global night tint, moving clouds or hidden ordinary geography.

Authenticated supported same-schema saves are accepted only after their exact original payload hash is verified, then normalize to the current rules. Authenticated schema 13–21 migrations remain deterministic, incompatible rules versions are rejected, and every existing active Signal Purge endpoint remains immutable after load. Historical saves from versions that simulated revolts contain no persisted revolt schedule; loading them therefore safely retires that obsolete chance while preserving their purge progress.

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

There is one finite national trained-reserve pool in addition to deployed manpower. It is not combat HP or a hidden army: its current and maximum size are visible, it contributes no combat power until mobilised, and new training is capped at exactly `1 ×` live active army capacity. Every opening nation receives reservists: a reported real-world pool is discounted to a uniform 55% immediately-ready share, while a zero or missing observation receives a 2%-of-cap trained cadre; both paths obey the same 1× cap. A later capacity fall blocks growth but does not delete already trained excess. No nation has another stored force HP/maxHP, readiness resource, special soldier subset, unit inventory, defence fund, research currency, influence, stability or doctrine profile. APEX Shield Integrity and energy are explicitly non-national and never enter those manpower selectors. Temporary integration state is explicit and ends when the former core identity is permanently absorbed.

National population, economy, manpower, capacity, Combat Power, global score and rank are selectors over current territory state. There is no nation-level battle-XP or military-experience value.

## 4. Visible country information

The permanent header presents five compact surfaces: Economy with Treasury, Combined Power, Population, Logistics Readiness and Research. Combined Power separates national Power from only the currently operational APEX contribution, excludes the dome during extraction/recharge and displays APEX as `SHIELD x%`; national readiness remains the separate `x% ARMY READY` value with trained reserves. Army Readiness is `LOW` below 55%, `BUILDING` from 55% through 84% and `READY` from 85%; both percentages are clamped to 0–100. Military rank remains a badge, not a resource.

Logistics Readiness is the exact live `supplyFactorV2` of each active front. The Empire percentage is weighted by the manpower of every source army participating in those fronts. With no active front it is 100% and reads **NETWORK READY**; otherwise the status is **READY** at 72% or higher, **STRAINED** from 50% through 71% and **CRITICAL** below 50%. During war the header also reports the number of fronts and the weakest percentage. Selecting it opens War, where the overall and weakest values lead into one line per front with its percentage, land or naval access, route distance, next-battle ETA and a short limiting-factor explanation.

Manpower is the complete number of trained deployed soldiers. Capacity is only the current recruitment ceiling. Empty capacity adds no combat power and a partly filled army does not make each deployed soldier individually weaker.

Combat Power is derived from deployed manpower, effective ATK, effective DEF and supply. AI target selection, forecasts and live combat use the same underlying selectors. Every opening army receives its country's calibrated base ATK and DEF. Movement and conquest-guard deployment preserve the source force's base quality; merging armies blends it by manpower; automatic recruitment adds the original profile of the territory where those soldiers are raised. Casualties preserve the surviving average, while an empty army resets to its local recruitment profile. Federation changes ownership without diluting any army. National ATK/DEF is a manpower-weighted display/outcome snapshot only; total Combat Power is the additive sum of local armies.

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

Account country traits, paid stat upgrades and currencies are retired. National improvement uses XP and free Country Mastery points. Each unlocked country has eight military tracks with exact current and next values:

- Force: `+1%` live Army Capacity per point;
- Firepower and Defense: `+1.5%` ATK or DEF per point;
- Mobilization: `+2%` Recruitment and `+2.5%` Reserve Training per point;
- Land Logistics: `+2%` land supply and `+1.5%` land transfer throughput per point;
- Expeditionary: `+1.5%` naval supply, `+1%` naval transfer throughput and a compounded `0.995` naval-transfer cost factor per point;
- Military Industry: compounded `0.99` recruitment-cost and `0.9925` standing-upkeep factors per point;
- Field Medicine: a compounded `0.99` casualty factor per point.

Every mastery level also adds `+0.25%` opening Army, earns one freely assignable point and can be respecced without cost or loss. Stronger countries require progressively more XP. Campaign freezes the selected country's mastery at deployment. Survival freezes each roster member's mastery onto that member's original territory contribution; multiplayer freezes these values independently for every seat. Later conquest never duplicates mastery, and mastery never changes GDP or treasury.

Greenland is the canonical starter nation. Defeating an ordinary nation in a completed standard Campaign war immediately and permanently adds it to the account roster, without a purchase or Signal Purge requirement. Survival and Alternative Universe never unlock nations. Signal Purge remains an in-run integration system only.

## 5. Tick order and determinism

At each weekly tick the engine performs, in order:

1. Apply queued player commands in action-sequence order.
2. Advance the canonical tick.
3. Synchronise every army capacity from live owned population, integration and Force Capacity research.
4. Snapshot and apply weekly finance, upkeep and recruitment changes.
5. Apply passive Development progress and breakthroughs.
6. Apply population and economic development, then resynchronise capacity where needed.
7. Redistribute armies and resolve active wars.
8. Update local hostile threat and narratively revealed Rogue Attention.
9. Apply deterministic AI commands.
10. Derive victory and prune history.
11. Run the scheduled full-state integrity boundary.
12. Notify presentation listeners.

All ordinary randomness advances the saved seeded RNG. Signal Purge is calendar-driven and contains no hidden random roll. The same seed, globally ordered commands and tick count must produce the same canonical hash. Development and tests run the exhaustive invariant scan after every tick. Production runs the same scan every eight ticks and forces it immediately on game-over or other terminal tick paths.

Cross-border immigration/displacement and partial territorial occupation remain absent from the weekly hot path. National-IQ views are cached by state, country, content and live IQ-research level. Finance, research, AI, resistance, ranking and war consumers accept and reuse already-built military/power snapshots within their phase so downstream selectors do not rebuild the same world view repeatedly.

## 6. Simple tax and one treasury

The player does not manually allocate a budget. Every national AI runs the same planner, chooses an exact-100 policy and derives an adaptive active plan from treasury runway and reserves, live population growth, army gaps, territory damage, technology gap and active fronts. APEX uses that same empire treasury and logistics; its small institutional output flows directly into the empire and it has no separate upkeep economy.

National IQ is a bounded gameplay score in `[80, 108]`, not a scientific claim about real populations. It is the sole skill input to the shared planner. Its modest funded-output multiplier is exact and inspectable:

```text
aiEfficiency = 1 + (clamp(IQ, 80, 108) − 100) × 0.0025
```

This yields only `0.95×` to `1.02×`. Every country reviews budget policy and the ten research allocations on the same eight-week cadence. A review moves each exact-100 allocation toward its target by only this many percentage points in total:

```text
stepLimit = round(2 + 2 × clamp((IQ − 80) / 28, 0, 1))
```

The resulting limit is two to four points. Policies therefore transition gradually instead of jumping directly to a newly optimised mix. Mandatory costs may still change immediately when a real event changes the army, fronts, debt or owned territory; the AI does not hide those costs behind smoothing.

Every country also follows the same liquid-reserve policy. The base target is eight ordinary tax-revenue weeks in peace, or six plus two for each active war. Bounded IQ scales that target from 0.90× to 1.10× and a large peacetime economy can reduce it by at most 15%. While below target, the planner retains 12–16% of otherwise discretionary peacetime cashflow or 14–18% in war, with the exact point set by IQ; after the reserve is funded, it still retains 5%. These are conserved treasury funds, not a separate resource, and AI command planning never spends them on one-off Rapid Recruitment, Research Surge or Propaganda purchases.

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

Fiscal reference wealth is measured in thousands of dollars per immutable reference person, so `$75K` reaches the 20% end of the range. Using that reference for the rate prevents live population from algebraically cancelling its own contribution or lowering the rate when it grows. At baseline `populationFactor = 1`, so taxable output equals integrated GDP and opening income preserves the old calibration. With fixed GDP, tax then rises monotonically with more live productive people and falls with losses; even at zero live population the stable economy half retains 50% of the taxable-output base for possible population recovery. This blend changes only tax: real integrated GDP remains the Economy value used by strategic systems, growth and conquest, while rank remains pure Combat Power. The UI may still show live GDP per person, which falls when population grows against unchanged production. No hidden territorial-health or war modifier sits inside the rate, and integration applies equally to live population, its reference and GDP.

The final annual economy-growth rate is recalculated once per finance plan:

```text
annualEconomyGrowth = clamp(
  0.3% base
  + 0.22 × annual productive-investment share of live GDP (capped at 12%)
  + Economy Growth research
  + territory-terrain adjustment
  − war/post-war growth drag,
  −6%, +4.5%
)
```

One active war removes at least 1.2 percentage points of annual growth. Extra fronts and accumulated fatigue increase that drag, and a smaller recovery penalty remains briefly after peace.

The Economy drawer shows this final percentage and its components next to treasury, tax, costs, net, population and wealth per person. Treasury also appears directly beside Economy in the permanent header, with negative values visibly marked. Recurring player-facing amounts are annualized while canonical settlement remains weekly. It remains compact and does not expose branch-by-branch research arithmetic or obsolete movement costs.

One treasury first pays a universal Base Operations cost that starts at `0.20 × ordinary weekly tax revenue`; Public Administration research can gradually lower that share toward `0.15`, and the Economy ledger shows the live rate. Remaining revenue pays army upkeep, recruitment and reserve training, research, national development, active-front operations and any debt premium.

Treasury may become negative. Each increase in principal pays a 10% origination premium. Let `debtWeeks = max(0, −treasury / weeklyRevenue)`: the first week is a liquidity grace band; recovery pressure rises by smoothstep from 1 to 26 weeks and critical pressure from 26 to 52. Those pressures progressively contract existing programme envelopes. Opening debt that remains after the weekly result begins a carrying premium after two debt-weeks, reaches full activation at eight, and uses `0.05% + 0.15% × recovery + 0.20% × critical` per week, capped at 25% of weekly revenue. Mandatory survival costs remain real and peace/war programme floors stay at 35%/45%, so shallow debt is recoverable while sustained debt becomes dangerous.

At peace, less than two weeks of liquid reserves, live population decline or debt activates survival recovery. Development is prioritised, recovery and logistics research gain weight and optional new wars are blocked. Post-war fatigue, an ordinary deficit or a routine recovery plan never permits demobilisation. A solvent country protects payroll and recruits toward 100% of live capacity. Only an extreme debt emergency that also makes payroll genuinely unaffordable may shrink the deployed force, and never below 25% of live Army capacity; the AI rebuilds toward full capacity as soon as that emergency ends. During an active war, Armed Forces becomes the largest priority, but the AI keeps an essential development floor so victory does not automatically destroy the civilian system.

Armed Forces pays mandatory upkeep before mobilization. Capacity is never purchased and cannot be reduced by an underfunded week. Fully maintained forces receive a base active training pipeline of `0.135%` of live capacity per peaceful week, improved by Training research. One continuous readiness curve raises that same pipeline smoothly toward `5×` as Army Ready approaches zero and fades cubically back to `1×` at full strength; there is no hidden low-readiness threshold or emergency band. A real human APEX network may carry a frozen account-support multiplier for the Empire's funded active and reserve-training pipelines, bounded at `1.50` and `1.75`; APEX talents specialise the dome and do not create personnel. No rival, ordinary AI, PRIME or Rogue corridor receives this support. These factors compose once with Research, North Pole, Country Mastery and run modifiers, and still consume the normal national budget at the normal per-unit price. If readiness is low, recurring surplus military funding may purchase up to `4×` extra peacetime throughput at `1.15×` normal unit cost. Reserve training continues alongside active recovery on one smooth readiness-sensitive share, up to exactly `1 ×` live active capacity. During any active war, fresh active recruitment and reserve training both become exactly zero for every participant, regardless of controller, front count or mode. Only already-trained reservists may transfer into an active gap: that mobilization is bounded by funded upkeep and reserve-mobilization throughput, costs no recruitment money and preserves deployed plus reserve personnel. A later capacity fall blocks new reserve growth but never deletes stored personnel. Base ATK/DEF quality raises unit cost on a bounded square-root curve; Reinforcement Efficiency and the same modest national-IQ efficiency used by every country reduce it. The sole extreme-crisis drawdown may remove at most `0.0005 × deployed manpower`, or 0.05%, per week and stops at a 25%-of-live-capacity home guard. It has no instant or accelerated second path and never changes capacity.

Moving or redistributing troops costs exactly zero treasury. There is no per-hop, distance-based or hidden logistics charge for troop movement. This does not make a war declaration or an active front free: their explicit mobilisation and operations costs remain separate and visible.

## 7. Army capacity and recruitment

Every territory's capacity uses only that territory's current live population and the owner's Force Capacity research. National capacity is the sum across currently owned territories:

```text
territoryCapacity = territory live population
  × territory integration
  × max(0.00145, native opening manpower × 1.25 / native opening population)
  × (1 + ForceCapacityLevel × 0.01)

nationalCapacity = sum(territoryCapacity of every owned territory)
```

The universal minimum population share is `0.00145`; a country whose real opening force requires a larger professional floor keeps that local floor in its own territory. Conquest never projects the conqueror's force/population ratio over foreign residents. Homeland integration is 1. A foreign conquest starts at 0.10 and therefore supplies 10% of its native structural cap; integration then unlocks the remainder. Military quality, current defence spending, treasury, war fatigue and budget funding do not modify capacity. Capacity automatically rises again when population, integration or research supports it; no permanent crisis penalty exists.

There is no separate campaign-strain score or threshold modifier. War costs are the actual casualties, funded replacements, trained-reserve depletion, supply, operations spending and the existing economic effects of active war and recovery. Naval battle fatigue keeps its reduced multiplier; capture and post-war transition fatigue keep their ordinary values.

Recruitment spends recurring military funding to fill free national capacity and, after full active readiness in peace, to train the finite national reserve. Training, Recovery and the same bounded IQ efficiency may change automatic recruitment speed or price, but never the capacity formula. A conquered frontier begins with 10% of its native local cap and may station existing soldiers up to that local cap plus 10% of total empire Army cap. The foreign support share then declines linearly with integration from 10% at `integration = 0.10` to 5% at `integration = 1`; original homeland uses its separate 3% support share. This is a deployment allowance, not a required troop count, and creates neither troops nor national capacity. Existing trained personnel are not deleted if later population loss or recalculation leaves them above that ceiling; logistics gradually reroutes only real excess manpower.

Army redistribution moves manpower through owned routes while conserving total manpower and manpower-weighted base ATK/DEF. Redistribution has zero treasury cost.

## 8. Automatic Development portfolio

All ten programs are active at the same time. There is no exclusive focus, separate upgrade currency or manual quality/volume slider. Every national AI reassesses its target portfolio every eight weeks according to manpower fill, reserves, technology gap, administration, live IQ, economy and current wars. The saved allocation then moves only two to four percentage points toward that target, using the same IQ-scaled transition limit as the budget. The Progress drawer shows the total completed level of every empire-wide effect, separate from progress toward the next breakthrough.

| Program | Seeded-random +1% result |
| --- | --- |
| Population & Recruitment | Population Growth or Training |
| Military Industry | Force Capacity or Reinforcement Efficiency |
| Advanced Weapons | Attack or Control |
| Defensive Systems | Defense or Casualty Reduction |
| Logistics & Medicine | Recovery or Supply |
| Economy & Science | Economy Growth, Research Speed or Research Efficiency |
| Sustainment Systems | Supply or Recovery |
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
- no short post-war redeclaration cooldown blocks it;
- a current owned land border, strategic sea connection or bounded authored co-op corridor exists.

Army size and fill ratio create visible risk warnings but do not block the player's Start War command. Human co-op seats are permanently friendly and can never declare war on each other. One bilateral war against one hostile country is exactly one front, regardless of how many borders both empires share or which side currently has initiative. A third hostile country creates a second front because it is a distinct opponent pair.

Declaring war itself is free. The single shared front is published immediately so APEX can stage during mobilisation. No battle pulse occurs before mobilisation completes. Each opponent pair then charges one explicit weekly operations cost. A naval front starts at 1.35× its equivalent land front for routes up to 1,500 km and rises smoothly toward 2.15× by 9,000 km; naval supply falls from 0.92× toward 0.62× over the same band. Troop redistribution itself remains free.

When a nation's final active war ends, post-war fatigue decays gradually instead of switching instantly to full peacetime efficiency.

## 10. Combat

Ordinary wars mobilise for eight weeks and then resolve battle pulses every two weeks. The once-only guided first Campaign war instead mobilises for four weeks and resolves weekly pulses; all later wars use the ordinary cadence. The two belligerents share one canonical operation: initiative can reverse its direction, and conquest can replace its source and target, but it never duplicates within the same war. The strategically strongest valid contact is chosen deterministically from supply, supporting armies, target army fill, economy, capital value, power ratio and access penalty. Separate simultaneous wars remain separate fronts.

Supply remains bounded to `[0.25, 1]` and depends on route connectivity, distance from the capital, access and Supply research. Naval attacks use the documented distance-scaled supply friction and operations cost. They have no separate assault-strength or casualty multiplier. Troop routing and supply limitations affect combat effectiveness but never charge treasury for movement.

In co-op, each country's armies remain its own real formations. At most one strongest legal ally contingent may support each side of a battle pulse. It is bounded to 18% of its source formation and 25% of the formal side's strength before route throughput, fights at 85% support efficiency and cannot reuse the same source twice in that pulse. Its source loses the real casualties; its contributing nation pays the route treasury cost and supply from its own stock.

The defender receives `1.25 × terrainModifier` position strength. Attacker pressure is opposed by defender DEF; defender counter-pressure is independently opposed by attacker DEF. Research may reduce casualties through its bounded selector.

```text
requestedDefenderLosses = defenderCombatManpower × 0.0125
  × max(0, attackPressure / defenseShield)
  × variance × defenderCasualtyModifiers

requestedAttackerLosses = attackerCombatManpower × 0.0125
  × max(0, counterPressure / attackerShield)
  × variance × accessCasualtyModifier × attackerCasualtyModifiers
```

Variance is seeded in `[0.94, 1.06]`; the linear power-ratio exponent is exactly `1`. Every deployed soldier in the local source and target armies contributes to front pressure through the formulas above. Damage is simultaneous, has no minimum-casualty floor and has no per-pulse rate, capacity or damage ceiling. Requested losses are applied directly and only the remaining local manpower is a natural upper bound. Direct combat effectiveness is `0.0125`. The separate 5% strength ratio remains solely a front-viability and initiative signal; it never caps casualties or adds route damage. Manpower casualties are continuous and battles create no XP resource.

The declaration forecast and live battle resolution use the same pulse projection. Battle damage may also cause bounded local civilian casualties, economic damage and war fatigue. Civilian deaths remain in the affected territory; no migration, refugee or displacement transfer exists.

## 11. Evolving borders and capture

A territory remains wholly owned by its defender until decisive capture. Capture occurs when local defending manpower reaches zero while the attacking source retains combat strength. A depleted formation may instead surrender only after the same front has existed for at least 26 weeks, its readiness is at most 12.5% of local capacity, that war has inflicted losses equal to at least 80% of local capacity, the attacking source outnumbers it at least four to one, and sustained momentum plus the current pulse remain positive. The remaining formation leaves active manpower without being recorded as battle deaths, then ownership transfers directly and completely. No partial-control or territorial peace-settlement state exists.

For a foreign capture, up to 10% of surviving source manpower moves into the captured territory as a real conquest guard, bounded by its local cap plus 10% of total empire Army cap. The same headcount is removed from the source, so enemy manpower is never inherited and conquest creates no troops or military quality. The scalable deployment allowance declines linearly to 5% of empire cap at full integration. During the first 52 weeks after capture the guard may receive reinforcement but ordinary empire logistics cannot use it as an outbound donor.

On capture:

- owner changes directly and completely to the victor;
- surviving population and economy remain as the territory's full potential after explicit battle damage;
- a foreign owner starts at exactly `integration = 0.10`; an original-owner recapture restores `integration = 1`;
- population capacity, taxable output and army capacity all use that same visible integration share;
- the remaining 90% unlocks linearly over one immutable 1–6 year duration derived from baseline population (50%), GDP (30%) and land area (20%);
- the base annual administration quote is `0.03 × live territory GDP at capture`; the resulting annual amount is frozen in the program. Weekly finance pays one fifty-second of it until completion or sovereign recapture deletes that program;
- APEX physical presence converts each calendar week into `3×` purge work. Every supplied active front processes its own endpoint in parallel at `1×` (one third of APEX speed), while every rear or remote focus advances deterministically at 50%. Fronts never have to clear and there is no queued purge state. Budget, AI efficiency and later growth never alter this work accounting;
- Signal Purge has no revolt risk, uprising trigger or hidden rollback; progress remains stable until completion or sovereign recapture;
- until completion, `coreOwner` preserves the territorial identity, `fromOwnerId` preserves the sovereign displaced by the latest capture, and the map shows a subtle border, former flag and progress treatment;
- on completion, `integration = 1`, `coreOwner` becomes the current owner and `integrationProgram` is deleted; population, economy, manpower, force quality and routes are conserved while full owner-based capacity and output become available;
- the old flag, integration border and country label are no longer renderable once `coreOwner === owner`; after the last territory carrying that former owner/core identity completes, the vanished sovereign is fully removed from canonical `players` and selector caches;
- treasury and trained reserves transfer exactly once when the vanished identity has no owned territory, active war or unfinished integration reference; durable research transfers by maxima, so duplicate values never sum into free progress;
- there is no selected-country exception: full absorption also removes the chosen nation's canonical record, ends that campaign and renders defeat from immutable content plus the surviving absorber; save loading reconstructs this terminal state deterministically;
- a lost capital moves to the former owner's largest remaining economy.

The duration curve is immutable. Each population, GDP and area axis first uses the country's baseline logarithmic size normalized over the playable world. Let `s = 0.50 × population + 0.30 × GDP + 0.20 × area`, let `L` be Luxembourg's resulting score, and let `r = clamp((s − L) / (1 − L), 0, 1)`:

```text
integrationWeeks = round(52 × (1.5 + 3.5r + 3r² + 4r⁴))
```

Peaceful defensive federation uses the same visible integration state with `federationIntegrationWeeks = round(0.25 × integrationWeeks)`. Ownership changes at the start of the voluntary union, but each territory's population, economy, deployed manpower and manpower-weighted base ATK/DEF are preserved exactly. The joining nation's treasury, trained reserves and strongest research remain on its backend identity until its final core completes, then transfer exactly once through the same retirement path. The old identity is removed afterward, so federation cannot leave a zombie nation or create free stats.

If one side's total deployed manpower reaches zero while the opponent retains combat strength, its remaining land capitulates with the same damage and zero inherited enemy army. Final elimination transfers 25% of the defeated treasury and sets that treasury to zero. If both armies reach zero together, the war ends without mutual absorption.

## 12. War conclusions

Wars cannot be ended through negotiation, offers, payments or territorial bargaining. A war concludes only through territorial elimination, a completed military conquest objective, mutual total army exhaustion, or a deterministic no-legal-front closure after 26 weeks without a viable battle.

Every conclusion starts a short internal bilateral redeclaration cooldown and applies the normal post-war military recovery load. It creates no income, cost or sovereign obligation. Authenticated older saves may contain retired offer and payment fields; load migration discards them, resets their legacy counters and never writes them back as active state.

## 13. National AI and local threat

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
- pressure against a stuck human remains a normal bilateral declaration and still respects route, finance, forecast, cooldown and global-war limits.

Before Campaign Signal Triangulation completes, hostile threat against the player is exactly zero and new wars remain locked. Afterwards every candidate is scored locally from shared land or short authored sea access, real Power ratio, nearby expansion, active war and whether the player has no viable route forward. The HUD exposes only the strongest plausible neighbour, a 0–100 score and concise reasons. There is no global political-suspicion chance and no coalition or federation escalation in serious modes.

The Campaign prologue is measured but short. APEX first contacts the player at week 6; accepting the transmission starts the 13-week Stage-I Signal Triangulation project. Stage I confirms a hostile coordination signal and unlocks war. After the briefing is resolved, one seeded proof conflict starts 6–8 weeks later, never underneath an unread transmission. APEX observes it for two weeks before explaining the pattern, and narrative dispatches remain at least two weeks apart. The subsequent target briefing releases the player's once-only guided first strike on the normal mobilisation and battle cadence documented in §10.

Strategic initiative rotates deterministically across living AI countries. Legal access, favourable force ratio, treasury runway, fatigue, target value and one modest seeded commitment roll decide whether a credible plan executes. IQ can improve forecast judgement and cash discipline but never declaration appetite. Every country uses the same planner, treasury, supply, defence bonus, casualty and conquest rules. APEX autonomously reinforces the best legal human front, but only the human seat declares a new war.

There is no separate escalation modifier for fighting a long war or operating with a depleted force. Depleted Army and reserves are already weaker and require real funded recovery; supply, operations costs, casualties and the existing economic recovery model remain authoritative. Rogue Attention is a separate Campaign benchmark and appears only after APEX reveals it.

Propaganda is retired. Compatibility fields and old commands may authenticate and normalize, but commands are rejected, active legacy programs clear with zero effect and no UI control remains. Revolt is also retired completely: Signal Purge has no hidden chance, rebel force, independence war or rollback.

Empire identity is account-wide and edited from the main menu; conquest never opens a naming modal.

## 14. Direct Connect multiplayer

- A multiplayer room is a 2–8 player co-op team. Each seat chooses a unique living country and freezes that account's Country Mastery, APEX shield talents and selected specialization before tick zero. The host applies every complete seat snapshot before launch; reconnect and replica setup reinstall those exact frozen builds. Human seats can never declare war on one another. Solo canonical state continues to use a one-country roster.
- Human territory grants friendly military access but never shared ownership or command. Routes must follow authored open edges, may traverse only the mover's or human teammates' land, and are bounded to seven edges, two sea legs and 12,000 km of sea distance. Every relay keeps ordinary distance, throughput, supply and treasury costs; neutral or ordinary AI territory is never a bridge.
- Every human seat has one independent APEX network. Separate networks may not claim the same projection node; simultaneous arrivals are repaired deterministically and reconnect reconciliation preserves that invariant. APEX never keeps a defeated seat alive after its last national territory and deployable national personnel are gone.
- Signalling and matchmaking payloads must match the exact current protocol/rules versions and room/seat identity.
- Direct Connect uses browser WebRTC data channels and the default public Cloudflare STUN endpoint only. It has no account, matchmaking service, dedicated game server or TURN relay. The host tab must remain open; restrictive NAT, school, office, carrier-grade and mobile networks may prevent a route.
- The host is the sole clock and simulation authority. It validates seat ownership, assigns one global command sequence and applies accepted commands at deterministic tick boundaries. Only the host may change shared speed. A guest cannot command another seat or send AI-only escalation actions.
- Guests replay host tick messages on local replicas. Canonical hash checkpoints are sent every eighth eligible tick; a mismatch requests a complete authenticated host snapshot for deterministic resynchronisation. Snapshots are deferred while an authoritative tick or queued command batch is incomplete.
- `humanPlayerIds` is shared canonical state. `viewerPlayerId`, locally read event IDs, open drawers, selected map state and pending local report presentation are per-client runtime state and excluded from saves and hashes.
- Every local UI is calculated from its own assigned viewer. Marking inbox events read in multiplayer never mutates canonical `event.unread` for the other players.
- A post-war report remains a blocking modal for the affected local interface, but it never sets shared speed to zero. The authoritative host clock and the other players continue while that report is open. Solo retains its pause-and-resume behaviour.
- A fully absorbed human country becomes a spectator seat. A reconnect credential is seat-specific and may reclaim only the same peer identity, country, mission and frozen deployment; it cannot select a replacement seat. The shared campaign ends only when no human-controlled country remains alive or the ordinary world-victory condition completes.

## 15. Presentation contract

- All user-facing game copy is English.
- The game is desktop-first; narrow/mobile layouts still preserve the playfield and primary Economy/Treasury information.
- New deployment follows Nation → Mission → Deploy. The nation screen lists owned countries first, then locked Campaign targets; the strongest owned country is the default. Campaign and Survival are primary missions, Alternative Universe is a smaller zero-progression fun mode, and one multiplayer toggle applies to every mission.
- The map shows current ownership, the player's empire outline, active fronts and selected/important country labels. After Stage I, remote ordinary land remains readable under only a static `0.12` relevance veil. Owned land, reachable/frontier targets, active fronts and APEX-held/path territory are visually clear. The ordinary world never receives a global night tint or cloud fade. Campaign Rogue Antarctica alone keeps real static mist while dormant and clears when Rogue Attention reaches `mobilising`; Survival and Alternative Universe treat Antarctica as awake from the start. Exact hover, command and live-stat access remain limited to the viewer's current intelligence ring.
- The current top ten powers remain strategically legible. Land combat is rendered as a warm solid contact line on the real shared border, plus directional armored chevrons and ground-shock pulses. Naval combat is deliberately distinct: cool curved dashed sea lanes, fleet-and-wake markers and splash impacts. Combat strokes retain screen-pixel width across zoom levels; only active operations animate, at a bounded cadence, and reduced-motion mode keeps a static presentation.
- Camera zoom reaches 24× with pointer-anchored wheel zoom and constrained panning, making compact countries such as Luxembourg practical to inspect and select.
- Flags use sharp scalable assets. Active integration retains a subtle former-core flag/border/progress treatment; only completed integration removes that identity from the map.
- War, Nation, Progress and Economy are the four primary drawers. Country detail replaces them instead of stacking.
- Economy is a compact read-only dashboard with Treasury, annualized Tax Income, Costs and Net, the dynamic annual growth rate and components, population and wealth. The live Treasury value is also shown immediately beside Economy in the header and marks debt clearly.
- Economy does not show long calculation chains, troop-movement charges or branch-by-branch research accounting.
- Nation is read-only and shows the current AI mode, population, economy, army and research. The header and Nation/War surfaces show trained reserves against their one-active-army maximum; the Combined Power top-bar tile always exposes `x% ARMY READY` beside live Power.
- Research contains both ordinary branches and one compact fourteen-stage North Pole sequence; the first APEX transmission opens Research and atomically starts the $10M, 13-week Signal Triangulation project. Later universal stage costs are $40M, $120M, $300M, $700M, $1.5B, $3B, $5B, $12B, $25B, $50B, $110B, $240B and $500B. The exact end-state bonuses remain bounded at +0.25% research, +0.5% supply, 8% faster Signal Purge, +2% recovery, +4% Rogue attack, +6% Rogue defence, +8% Antarctic supply and +5% Antarctic operation power; the intermediate stages only distribute that same preparation curve.
- War is the primary decision surface for live fronts, legal targets, Power forecasts, supply, exact APEX contribution and deterministic conclusions. Local Threat and revealed Rogue Attention replace suspicion, containment and revolt information.
- Weekly refresh preserves scroll position in drawers and ranking lists.
- War recommendations and confirmation show target Logistics Readiness, route access and distance, GDP, population and the 10% initial integration contribution. War starts and conquests create subtle bottom notifications. Normal notices remain visible for 3.2 seconds, war notices for 4 seconds and conquest notices for 5 seconds; at most four stack at once. Every completed human war queues a perspective-local blocking post-war report containing result/reason, opponent, duration, battles, territory changes, military and civilian losses, economy, treasury, active army/capacity, manpower-weighted base quality, exact APEX support/integrity/energy use and actual Singularity, Mirror and Twin activations, plus the conclusion. The per-war APEX ledger is part of the canonical host snapshot, so save/load, resynchronisation and reconnect preserve it exactly. Reports render one at a time with `NEXT REPORT` or `CONTINUE`; duplicate outcomes are ignored. Solo pauses for this queue, while multiplayer leaves the shared clock running. Conquest metric-transfer animation remains visible behind this reporting flow, and country detail shows integration and remaining years.

## 16. Persistence and invariants

Canonical schema-22 saves include schema/rules/content/map versions, seed and RNG state, tick and action sequence, the sorted `humanPlayerIds` roster and compatible primary `humanPlayerId`, nations, territories, wars with revenge state, truces, offers, alliances, alliance offers and AI escalation state. Transient listeners, local viewer identity, locally read inbox IDs, report queues, derived victory projection, account mastery registries and visual state are excluded from canonical hashes. Authenticated legacy fields from the retired campaign-strain prototype are discarded at load and never re-saved.

Every completed tick must satisfy:

- all canonical numbers are finite;
- treasury is finite and may be negative;
- population, economy, manpower, capacity and research progress are non-negative;
- manpower is non-negative; recruitment cannot exceed free empire capacity, new local inflow respects the local-plus-empire-share deployment ceiling, and an existing overshoot is never deleted instantly;
- new reserve training stops at one live active-army capacity, while a stored overshoot caused by a later capacity fall is preserved until deployment or real attrition;
- capacity equals the live population/integration/research formula and never contains a budget or crisis penalty;
- integration remains within its declared bounds;
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

The current suite must demonstrate at minimum:

1. deterministic schema-22 save/load, authenticated migration, canonical hashing and every-eight-tick production invariants;
2. the documented economy, debt, Development, recruitment, capacity, logistics, battle, conquest and post-war conservation rules;
3. eight XP-only Country Mastery tracks, Force at exactly +1% capacity per level, no country traits or paid stat upgrades, and frozen deployment snapshots;
4. the power-derived unlock catalogue, including Greenland free, the weakest paid country at 100, India at 7,445 from neutral opening Power and the USA at 15,000;
5. convex level-gated APEX ranks through rank 15 at level 67, the endless diminishing tail, deterministic Singularity charge, bounded Mirror counterpulses, Twin Projection's two 60% fronts sharing one shield/energy pool, one APEX claim per territory and Signal Purge at 3× on-site, parallel supplied fronts at 1× and rear/remote work at 50%;
6. the measured Campaign prologue, guided-first-war cadence, ordinary-map `0.12` relevance veil and the distinct dormant/awake Antarctic Rogue states without global map obscuration;
7. human-human war rejection, bounded friendly co-op logistics and one real ally contingent per side with contributor-owned manpower, supply, treasury and casualties;
8. per-seat frozen Country Mastery/APEX specialization, host authority, deterministic checkpoints, authenticated resynchronisation and exact-seat reconnect;
9. viewer-local information and reports, multiplayer clock independence and the permanent top-bar `x% ARMY READY` presentation.
