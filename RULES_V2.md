# Frontier Command — Rules V2.52

This document is the authoritative gameplay and simulation contract. If presentation copy, tests and code disagree, they must be reconciled in the same change.

## 1. Product promise

- The player chooses one current country, never a starting alliance.
- The chosen country owns the world's strongest national Super AI. The player chooses war targets; the AI manages finance, Development, recruitment, recovery and front execution.
- Every other living country uses capable deterministic AI under the same economic and military rules, without the player's Super-AI efficiency advantage.
- The game advances continuously at one simulated week per real second. Combat is live and contains no dice interaction.
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

V2.52 uses schema version 17. Authenticated schema-13 through schema-16 saves migrate deterministically; incompatible rules versions are rejected. Schema-16 singular operations become one-element front arrays. Its former combined Denmark/Greenland territory is split while conserving population, economy and manpower and preserving the existing owner.

### Nation

```ts
type NationState = {
  empireName: string;
  treasury: number;
  budget: { military: number; research: number; development: number };
  research: {
    allocations: Record<ResearchProgram, number>; // six integers, exact sum 100
    progress: Record<ResearchProgram, number>;
    effectLevels: Record<ResearchEffect, number>;
    breakthroughs: Record<ResearchProgram, number>;
  };
  rapidRecruitmentAvailableTick: number;
  researchSurgeAvailableTick: number;
  ceasefiresRequested: number;
  propagandaAvailableTick: number;
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
  population: number;       // millions
  economy: number;          // billions USD-equivalent
  condition: number;        // 0.15–1
  integration: number;      // 0–1 integration under the current owner
  army: {
    manpower: number;          // millions; complete deployed army
    capacity: number;          // millions; automatic population/integration/research ceiling
    baseAttack: number;        // manpower-weighted local army quality
    baseDefense: number;       // manpower-weighted local army quality
    veteranManpower: number;   // millions; subset of manpower
    veteranExperience: number; // non-negative average; no hard cap
  };
  control?: { controller: NationId; share: number };
};
```

There is no national manpower reserve, stored force HP/maxHP, readiness resource, separate veteran currency, unit inventory, defence fund, research currency, influence, stability, doctrine profile or separate occupied-country state.

National population, economy, manpower, capacity, Veteran Forces, Combat Power and rank are selectors over current territory state. They are never independently written back into the nation.

## 4. Visible country information

The permanent desktop header presents compact primary values for Treasury, Population, Economy, Manpower/Capacity, Veteran Forces, Combat Power and Super AI status. World rank remains a badge, not a resource.

Manpower is the complete number of trained deployed soldiers. Veteran manpower is included in that total. Capacity is only the current recruitment ceiling. Empty capacity adds no combat power and a partly filled army does not make each deployed soldier individually weaker.

Combat Power is derived from deployed manpower, the veteran share, veteran experience, ATK, DEF, condition and supply. Ranking, AI target selection, forecasts and live combat use the same selectors. Every opening army receives its country's calibrated ATK and DEF. Movement and occupation preserve the source force's quality; merging armies blends it by manpower; normal and rapid recruitment add the original profile of the territory where those soldiers are raised. Casualties preserve the surviving average, while an empty army resets to its local recruitment profile. Federation changes ownership without diluting any army. National ATK/DEF is a manpower-weighted display/outcome snapshot only; total Combat Power is the additive sum of local armies.

Opening ATK and DEF use one constant-time country calibration. `powerIndex / (100 × deployedOpeningManpower)` sets the combined per-soldier rating (bounded to `[0.35, 14]`). SIPRI spending per deployed soldier adds a small symmetric tilt: equipment-heavy forces lean toward ATK, manpower-heavy forces toward DEF, while `0.55 × ATK + 0.45 × DEF` remains unchanged. Nuclear tiers, research and veterans are applied afterward.

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
10. Derive victory, prune history and assert invariants.
11. Notify presentation listeners.

All randomness advances the saved seeded RNG. The same seed, commands and tick count must produce the same canonical hash.

## 6. Simple tax and one treasury

The player does not manually allocate a budget. Every national AI chooses an exact-100 policy and derives an adaptive active plan from treasury runway, food coverage and reserves, live population growth, army gaps, territory damage, technology gap and active fronts. The chosen country's APEX Super AI applies its documented funded-output efficiency and faster planning cadence; it never creates free money or troops.

Weekly tax uses one automatic country rate between 10% and 20%. It is not a policy slider:

```text
ownedPopulation = sum(live population of every owned territory)
populationWeightedWealthPerPerson =
  sum(territory live population × territory live wealth per person)
  / ownedPopulation

countryTaxRate = 0.10
  + 0.10 × clamp(populationWeightedWealthPerPerson / 75, 0, 1)

weeklyTax = ownedPopulation
  × populationWeightedWealthPerPerson
  × countryTaxRate
  / 52
```

Wealth is measured in thousands of dollars per person, so `$75K` reaches the 20% end of the range. Population and wealth per person are simply the visible decomposition of total live GDP. Population growth alone does not create GDP: with unchanged total production it lowers wealth per person and leaves taxable output unchanged. Twice the population yields twice the tax only when output per person also stays unchanged. No condition, war or integration modifier is hidden inside the rate.

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

One active war removes at least 1.8 percentage points of annual growth. Extra fronts and accumulated fatigue increase that drag, and a smaller recovery penalty remains briefly after peace.

The Economy drawer shows this final percentage and its five components next to treasury, tax, costs, net, population, wealth per person, and domestic/imported food. Recurring player-facing amounts are annualized while canonical settlement remains weekly. It remains compact and does not expose branch-by-branch research arithmetic or obsolete movement costs.

One treasury pays food, army upkeep, recruitment, research, national development, active-front operations, treaty obligations and any debt premium. Domestic food depends on land, terrain, condition, integration, research and live territory economic strength; India-origin agricultural territory receives a 1.30 yield multiplier. More expensive imports fill the remaining reachable demand. Food storage is finite: population demand supplies the base capacity, controlled landmass adds physical capacity, and wealth plus Supply research improve it. The top bar reports current/max food and the projected annualized stock change. Treasury may become negative; new borrowing adds a premium and causes discretionary spending to contract until finances recover.

At peace, food shortage, less than two weeks of reserves, live population decline or debt activates survival recovery. Development is prioritised, food/logistics research gains weight and optional new wars are blocked. Territory damage or post-war fatigue alone never permits demobilisation. A solvent, fed country protects payroll and recruits toward 100% of live capacity. Only a genuinely unaffordable army may demobilise toward the 45% ordinary crisis floor; a severe food or debt crisis may temporarily reach the hard 25% home-guard floor. The AI rebuilds toward full capacity once conditions improve. During an active war, Armed Forces becomes the largest priority, but the AI keeps an essential development floor so victory does not automatically destroy the civilian system.

Armed Forces pays mandatory upkeep before mobilization. Capacity is never purchased and cannot be reduced by an underfunded week. Fully maintained forces receive a slow passive training pipeline of 0.1% of live capacity per peaceful week, improved by Training research and limited by food. If readiness is low, surplus military funding may purchase a peacetime fast-track at 2.5× normal unit cost. War disrupts routine training but unlocks a larger emergency programme at 4.5× normal unit cost, allowing strong economies to replace losses materially faster. Base ATK/DEF quality raises unit cost on a bounded square-root curve; Reinforcement Efficiency reduces it. Only during a real economic or food emergency may underfunded upkeep demobilise at no more than 0.15% per week before floors; an orderly crisis drawdown adds at most 0.35% per week. Neither path changes capacity or removes an army instantly.

Moving or redistributing troops costs exactly zero treasury. There is no per-hop, distance-based or hidden logistics charge for troop movement. This does not make a war declaration or an active front free: their explicit mobilisation and operations costs remain separate and visible.

## 7. Army capacity, recruitment and Veteran Forces

Every territory's capacity uses only that territory's current live population and the owner's Force Capacity research. National capacity is the sum across currently owned territories:

```text
territoryCapacity = territory live population
  × territory integration
  × 0.00145
  × (1 + ForceCapacityLevel × 0.01)

nationalCapacity = sum(territoryCapacity of every owned territory)
```

The universal population share is `0.00145`. Homeland integration is 1. A foreign conquest starts at 0.10 and therefore supplies 10% of its structural cap; integration then unlocks the remainder. Military quality, defence spending, starting army size, territory condition, treasury, war fatigue and budget funding do not modify capacity. Capacity automatically rises again when population, integration or research supports it; no permanent crisis penalty exists.

Recruitment spends military funding to fill free national capacity. Training, Recovery and bounded catch-up may change automatic recruitment speed or price, but never the capacity formula. Rapid Recruitment fills at most 5% of current live capacity and then enters a 104-week cooldown. Its discounted initial quote is fixed from the opening country and every successful use makes the next one 25% more expensive; live GDP, conquest and war no longer reprice it. Research Surge and Propaganda use the same rule with 30% and 35% per-use growth. A conquered frontier begins with 10% of its native local cap, while slow imperial logistics may station existing soldiers above it. This does not create troops: total deployed manpower always remains at or below the empire's summed population-, integration- and research-based capacity.

Army redistribution moves manpower through owned routes while conserving totals. Veteran manpower moves as part of the same army, and its linear `sqrt(XP)` bonus score follows it through manpower-weighted averaging. Redistribution has zero treasury cost.

### 7.1 Veteran progression

Veteran Forces are a subset of ordinary manpower and follow the same movement, supply, capture and casualty rules. They are not manufactured or bought separately.

When the campaign country is chosen, a low-ranked human-controlled nation receives a one-time rank-scaled elite core. The top 20 receive none. Below rank 20, one smooth underdog curve converts an increasing share of existing manpower and grants increasing opening XP. The weakest five percent reach the maximum: 100% of their existing army at 5,000 XP. This never creates extra soldiers, never exceeds capacity, does not recur and cannot stack.

```text
underdogDepth = clamp((rank - 20) / (countryCount - 20), 0, 1)
eliteIntensity = clamp(underdogDepth / 0.95, 0, 1)
openingVeteranShare = eliteIntensity ^ 0.55
openingVeteranXP = 5,000 × eliteIntensity
```

Battle pulses never create veterans or increase experience. Casualties remove veterans as well as regular soldiers. If the elite subset reaches zero, its XP is lost; new recruits enter as regulars and therefore dilute the remaining elite share. Merging forces preserves total veteran manpower and the exact manpower-weighted `sqrt(XP)` bonus score. The squared average score is stored as equivalent XP, so merging never manufactures veteran power.

When a complete war ends after at least one battle, veterancy is awarded exactly once:

- existing surviving veterans gain one deterministic experience step from their own prior equivalent XP;
- a deterministic share of surviving regular soldiers is promoted at Rank 1 and receives only that war's XP step;
- total-war difficulty uses duration, battle count, cumulative own losses and the campaign power ratio;
- a harder completed war produces more promotion and experience than an easy one.

Equivalent veteran experience is non-negative and has no hard cap. Its effect uses square-root diminishing returns:

```text
veteranHpMultiplier      = 1 + 0.03 × sqrt(veteranExperience)
veteranAttackMultiplier  = 1 + 0.01 × sqrt(veteranExperience)
veteranDefenseMultiplier = 1 + 0.01 × sqrt(veteranExperience)
averageVeteranRank        = veteranManpower > 0 ? floor(sqrt(veteranExperience)) + 1 : 0
```

Only veteran manpower receives these multipliers. The HP multiplier is derived combat durability; it is not a second stored health pool. The smaller ATK/DEF coefficients keep offensive and defensive growth modest while allowing exceptionally long-lived forces to keep improving.

Base quality and veteran quality remain additive instead of retroactively multiplying each other:

```text
attackRatingMass  = manpower × baseAttack  + veteranManpower × (veteranAttackMultiplier  − 1) × 100
defenseRatingMass = manpower × baseDefense + veteranManpower × (veteranDefenseMultiplier − 1) × 100
```

The single global `100` reference is country-agnostic. It gives the weakest 5,000-XP opening core a limited boost, while ordinary post-war veterans begin with low XP and a small share. Effective per-combat-manpower ATK/DEF divides this mass by veteran-adjusted combat manpower; combat pressure multiplies it back, so adding any positive-quality recruits strictly adds power and can never weaken the force already present. HP remains casualty durability, not a hidden quality multiplier.

## 8. Automatic Development portfolio

All six programs are active at the same time. There is no exclusive focus, separate upgrade currency or manual quality/volume slider. Every 32 weeks the national AI redirects extra attention according to manpower fill, technology gap and current wars; APEX reassesses more frequently. The Progress drawer shows the total completed level of every empire-wide effect, separate from progress toward the next breakthrough.

| Program | Seeded-random +1% result |
| --- | --- |
| Population & Recruitment | Population Growth or Training |
| Military Industry | Force Capacity or Reinforcement Efficiency |
| Advanced Weapons | Attack or Control |
| Defensive Systems | Defense or Casualty Reduction |
| Logistics & Medicine | Recovery or Supply |
| Economy & Science | Economy Growth, Research Speed or Research Efficiency |

Thirty percent of the Research pot is the equal passive baseline: 5% for each branch. The remaining 70% follows the exact-100 allocation. Every branch stores its own progress and breakthrough count.

The requirement for a branch with `B` completed breakthroughs follows the deterministic mastery curve:

```text
branchBaseRP × 0.45 × (B + 1) × 1.18^B
  × bounded power catch-up
  × research-efficiency modifier
```

Research may improve indefinitely, while the exponential requirement slows extreme late-game growth. APEX Research Surge adds a visible, paid boost to the ordinary Development portfolio and then enters its cooldown; it does not create a separate research system.

## 9. War declaration, access and costs

A declaration is legal only when:

- attacker and target are distinct living nations;
- the same pair is not already at war;
- no active truce or ceasefire obligation blocks it;
- a current owned land border or strategic sea connection exists.

Army size and fill ratio create visible risk warnings but do not block the player's Start War command. Every additional source-unique front uses its own local army and adds to the national war budget.

Declaring war itself is free. After declaration, both sides enter a four-week mobilisation phase. No battle pulse occurs before week four. Each live front then charges its explicit weekly operations cost. Troop redistribution itself remains free.

When a nation's final active war ends, post-war fatigue decays gradually instead of switching instantly to full peacetime efficiency.

## 10. Combat

Wars resolve battle pulses every two weeks. Each side builds a deterministic, source-unique operation for every viable owned source territory that can reach the enemy. All operations on the side with initiative resolve in stable source/target order during that round, so several countries of one empire can attack simultaneously and suffer their own losses. A source army can participate in at most one front per tick. Front scoring considers supply, supporting armies, target army fill, partial control, economy, capital value, power ratio and access penalty.

Supply remains bounded to `[0.25, 1]` and depends on route connectivity, distance from the capital, condition, hostile control, access and Supply research. Naval attacks receive their documented supply and casualty disadvantages. Troop routing and supply limitations affect combat effectiveness but never charge treasury for movement.

The defender receives `1.25 × terrainModifier` position strength. Attacker pressure is opposed by defender DEF; defender counter-pressure is independently opposed by attacker DEF. Veteran HP, ATK and DEF multipliers are blended according to each local army's veteran share.

```text
defenderLossRate = clamp(0.032 × (attackPressure / defenseShield) × variance, 0, 0.05)
attackerLossRate = clamp(0.032 × (counterPressure × 1.15 / attackerShield)
  × variance × accessCasualtyMultiplier, 0, 0.05)
```

Variance is seeded in `[0.94, 1.06]`. Damage is simultaneous, uses only deployed local forces and has no minimum-casualty floor. Each 0–5% loss rate is applied to the struck army's canonical maximum manpower at pulse start: `min(current canonical manpower, capacity × lossRate)`. Veteran HP converts that effective damage budget into fewer headcount losses. Manpower casualties are continuous. A battle pulse never promotes troops or grants experience; the single veterancy award occurs only when the full war ends.

The declaration forecast and live battle resolution use the same pulse projection. Battle damage may also cause bounded civilian casualties, economic damage, condition loss and war fatigue.

## 11. Evolving borders and capture

Partial control is a visual and peace-settlement value, not a second owner and not a capture gate. A territory captures when defending local manpower reaches zero while the attacking source retains combat strength.

Two percent of surviving source manpower moves into the captured territory as the occupation force. Veteran manpower transfers in the same proportion and retains its average experience. Enemy manpower and veteran experience are never inherited or created.

On capture:

- owner changes to the victor and hostile control is removed;
- surviving population, economy and condition remain as the territory's full potential after explicit battle damage;
- a foreign owner starts at exactly `integration = 0.10`; an original-owner recapture restores `integration = 1`;
- population capacity, taxable output, food production and army capacity all use that same visible integration share;
- the remaining 90% unlocks linearly over 520–1,040 weeks, with the exact duration determined from immutable baseline population (50%), GDP (30%) and land area (20%);
- integration speed is calendar-based and is never changed by budget, AI efficiency, war or later growth;
- a lost capital moves to the former owner's largest remaining economy.

If one side's total deployed manpower reaches zero while the opponent retains combat strength, its remaining land capitulates with the same damage and zero inherited enemy army. Final elimination transfers 25% of the defeated treasury and sets that treasury to zero. If both armies reach zero together, the war ends without mutual absorption.

## 12. Peace

Only the objectively weaker side may request negotiated peace after at least 52 war weeks. One request and one pending offer may exist per war. An offer remains open for 26 weeks. Stale wars without a viable front end deterministically.

A paid unilateral ceasefire abandons unfinished occupation, pays 52 weekly instalments and blocks reattack during all payments plus another 52 weeks. If either sovereign disappears through elimination or federation, its obligation is cancelled so no money can be created from a dead payer.

## 13. National AI and containment

Rival expansion is intentionally sparse and predictable enough for the map to remain readable:

- a normal AI war start may occur no earlier than week 52 and normal global starts have a 52-week cooldown;
- AI regional escalations have a separate 52-week global cooldown;
- defensive interventions have a 26-week global cooldown;
- the global active-war cap scales slowly from 2 in the early campaign to at most 4 later;
- an ordinary AI country may sustain at most one active war;
- only a major power after week 260 may sustain two active wars;
- normal expansion considers only peaceful ordinary targets, never a country already fighting another war;
- defensive and containment reactions remain separate from ordinary expansion but still respect their explicit cooldown and global cap.

Strategic initiative rotates deterministically across living AI countries. Legal access, favourable force ratio, treasury runway, fatigue, target value and seeded randomness decide whether a credible plan executes. AI uses the same treasury, supply, defence bonus, casualties and conquest rules as the player.

Capturing territory, rapid Combat Power growth and sustained offensive wars raise global suspicion; peaceful time lowers it. Coalition recruitment begins no earlier than week 156, may add only one member every 52 weeks, requires a higher join threshold and needs five members before containment activates. Nearby states and soft present-day affinity tags may later form permanent defensive federations. Federation cooldown ranges from at least 208 to 312 weeks. Federation merging preserves territories, treasuries, deployed manpower, veteran composition and the strongest existing research without creating free capacity or forces.

The player may fund the documented expensive propaganda program. Its gradual suspicion reduction cannot dissolve an existing federation.

After the first conquest, the player may name the empire. That name becomes the single identity of all absorbed territory and persists in canonical saves.

## 14. Presentation contract

- All user-facing game copy is English.
- The game is desktop-first; no narrow/mobile breakpoint is required.
- The map shows current ownership, the player's empire outline, active fronts, partial control and selected/important country labels.
- War, Nation, Progress and Economy are the four primary drawers. Country detail replaces them instead of stacking.
- Economy is a compact read-only dashboard with Treasury, annualized Tax Income, Costs and Net, the dynamic annual growth rate and components, population, wealth, current/max food storage, annualized stock change and the domestic/imported food mix.
- Economy does not show long calculation chains, troop-movement charges or branch-by-branch research accounting.
- Nation is read-only and shows the current AI mode, paid spending, population, food, research and military state.
- War is the primary decision surface for live fronts, legal targets, forecasts, army upkeep, operations, propaganda, suspicion and containment.
- Veteran Forces appear as the veteran subset of manpower with their average experience and derived bonuses.
- Weekly refresh preserves scroll position in drawers and ranking lists.
- War recommendations and confirmation show target food coverage, storage trend, domestic production, GDP, population and the 10% initial occupation contribution. War starts and conquests create subtle notifications. A conquest no longer blocks play with a post-war modal: currently unlocked economy, cash, population capacity, food access and army-cap gains animate from the captured territory into the matching top-bar metric. Country detail shows integration and remaining years.

## 15. Persistence and invariants

Canonical saves include schema/rules/content/map versions, seed and RNG state, tick and action sequence, nations, territories, wars, truces, offers and AI escalation state. Transient listeners, derived victory projection and visual state are excluded from canonical hashes.

Every completed tick must satisfy:

- all canonical numbers are finite;
- treasury is finite and may be negative;
- population, economy, manpower, capacity, veteran manpower, veteran experience and research progress are non-negative;
- `0 <= manpower <= capacity`;
- `0 <= veteranManpower <= manpower`;
- `veteranExperience >= 0` with no artificial maximum;
- capacity equals the live population/integration/research formula and never contains a budget or crisis penalty;
- condition and integration remain within their declared bounds;
- each territory has exactly one valid living owner;
- a living nation's capital belongs to that nation;
- budgets and Development allocations retain their exact sums;
- wars have distinct living participants and no duplicate nation pair;
- control references a hostile controller and remains bounded;
- army movement and occupation conserve manpower, veteran manpower and manpower-weighted veteran bonus score except for explicit battle losses and one end-of-war award;
- troop movement never mutates treasury.

## 16. Required automated evidence

The V2.52 suite must cover at minimum:

1. schema-17 save/load deterministic continuation plus authenticated schema-13–16 migration, including Greenland conservation and singular-to-plural fronts;
2. the exact 10–20% wealth-linked country-tax identity without double-counting population growth;
3. the compact Economy presentation and absence of obsolete calculation chains;
4. one treasury, debt, paid spending and explicit front costs;
5. army capacity using only `population × integration × 0.00145 × (1 + 0.01 × research)`;
6. automatic capacity recovery after population/integration/research changes and no budget-driven cap loss;
7. recruitment raising manpower without purchasing capacity;
8. free troop movement with exact treasury conservation;
9. `veteranManpower` remaining a subset of manpower;
10. zero pulse-time promotion plus exactly one difficulty-scaled veterancy award after a completed war;
11. uncapped equivalent experience with square-root HP/ATK/DEF bonuses of `0.03/0.01/0.01` and derived uncapped Average Rank;
12. movement, merging and occupation conserving veteran manpower and weighted `sqrt(XP)` bonus score;
13. casualties reducing real manpower and permitting veteran loss;
14. all four ATK/DEF directions changing the correct casualty stream;
15. equal-force defenders losing less because of the 25% position bonus;
16. capture inheriting zero enemy army and preserving only the proportional occupation force;
17. full capitulation absorbing every remaining territory and only 25% treasury;
18. land/naval access and overseas combat penalties;
19. normal/regional 52-week and defensive 26-week AI cooldowns;
20. active AI war cap of 2–4, ordinary one-war limit and post-week-260 major two-war limit;
21. ordinary expansion filtering out targets already at war;
22. exact six always-active Development programs and funding conservation;
23. per-tick invariant checks and multi-seed soak coverage;
24. player finance/Development automation without autonomous player war declarations;
25. expansion suspicion, containment and federation conservation;
26. first-conquest empire naming and persistence.
27. conquest starting at 10% and completing on a deterministic 10–20 year size calendar;
28. two or more source armies resolving as real battles in the same front round;
29. healthy post-war AI recruiting toward 100%, with only gradual crisis demobilisation;
30. Greenland remaining separate from Denmark with valid flags, fiscal calibration and Arctic sea routes.
