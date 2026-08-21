# Frontier Command — Rules V2.54

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

V2.54 uses schema version 19. Authenticated schema-13 through schema-18 saves migrate deterministically; incompatible rules versions are rejected. Schema-16 singular operations become one-element front arrays. Its former combined Denmark/Greenland territory is split while conserving population, economy and manpower and preserving the existing owner. Legacy military experience is converted into the single empire-wide Combat Experience score. A schema-18 active integration keeps its exact visible share while its remaining endpoint is converted once to the faster calendar; every later save stays on that immutable schema-19 endpoint. Schema 18 did not store the displaced sovereign separately, so migration canonically uses its stored former core as `fromOwnerId`; every new schema-19 capture records the exact displaced owner.

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
  combatExperience: number; // non-negative empire-wide institutional knowledge
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
  control?: { controller: NationId; share: number };
};
```

There is no national manpower reserve, stored force HP/maxHP, readiness resource, special soldier subset, unit inventory, defence fund, research currency, influence, stability or doctrine profile. Temporary integration state is explicit and ends when the former core identity is permanently absorbed.

National population, economy, manpower, capacity, Combat Power and rank are selectors over current territory state. Combat Experience is the one nation-level military-knowledge value and applies across every army currently belonging to that country or empire.

## 4. Visible country information

The permanent desktop header presents compact primary values for Treasury, Population, Economy, Manpower/Capacity, Combat Experience, Combat Power and Super AI status. World rank remains a badge, not a resource.

Manpower is the complete number of trained deployed soldiers. Capacity is only the current recruitment ceiling. Empty capacity adds no combat power and a partly filled army does not make each deployed soldier individually weaker.

Combat Power is derived from deployed manpower, empire-wide Combat Experience, ATK, DEF, condition and supply. Ranking, AI target selection, forecasts and live combat use the same selectors. Every opening army receives its country's calibrated ATK and DEF, but no country receives an opening experience bonus. Movement and occupation preserve the source force's quality; merging armies blends it by manpower; normal and rapid recruitment add the original profile of the territory where those soldiers are raised. Casualties preserve the surviving average, while an empty army resets to its local recruitment profile. Federation changes ownership without diluting any army. National ATK/DEF is a manpower-weighted display/outcome snapshot only; total Combat Power is the additive sum of local armies.

Opening ATK and DEF use one constant-time country calibration. `powerIndex / (100 × deployedOpeningManpower)` sets the combined per-soldier rating (bounded to `[0.35, 14]`). SIPRI spending per deployed soldier adds a small symmetric tilt: equipment-heavy forces lean toward ATK, manpower-heavy forces toward DEF, while `0.55 × ATK + 0.45 × DEF` remains unchanged. Nuclear tiers, research and earned Combat Experience are applied afterward.

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

At peace, food shortage, less than two weeks of reserves, live population decline or debt activates survival recovery. Development is prioritised, food/logistics research gains weight and optional new wars are blocked. Territory damage, post-war fatigue, an ordinary deficit or a routine recovery plan never permits demobilisation. A solvent, fed country protects payroll and recruits toward 100% of live capacity. Only an extreme food or debt emergency that also makes payroll genuinely unaffordable may shrink the deployed force, and the AI rebuilds toward full capacity as soon as that emergency ends. During an active war, Armed Forces becomes the largest priority, but the AI keeps an essential development floor so victory does not automatically destroy the civilian system.

Armed Forces pays mandatory upkeep before mobilization. Capacity is never purchased and cannot be reduced by an underfunded week. Fully maintained forces receive a slow passive training pipeline of 0.1% of live capacity per peaceful week, improved by Training research and limited by food. If readiness is low, surplus military funding may purchase a peacetime fast-track at 2.5× normal unit cost. War disrupts routine training but unlocks a larger emergency programme at 4.5× normal unit cost, allowing strong economies to replace losses materially faster. Base ATK/DEF quality raises unit cost on a bounded square-root curve; Reinforcement Efficiency reduces it. The sole extreme-crisis drawdown may remove at most `0.0005 × deployed manpower`, or 0.05%, per week. It has no instant or accelerated second path and never changes capacity.

Moving or redistributing troops costs exactly zero treasury. There is no per-hop, distance-based or hidden logistics charge for troop movement. This does not make a war declaration or an active front free: their explicit mobilisation and operations costs remain separate and visible.

## 7. Army capacity, recruitment and Combat Experience

Every territory's capacity uses only that territory's current live population and the owner's Force Capacity research. National capacity is the sum across currently owned territories:

```text
territoryCapacity = territory live population
  × territory integration
  × 0.00145
  × (1 + ForceCapacityLevel × 0.01)

nationalCapacity = sum(territoryCapacity of every owned territory)
```

The universal population share is `0.00145`. Homeland integration is 1. A foreign conquest starts at 0.10 and therefore supplies 10% of its structural cap; integration then unlocks the remainder. Military quality, defence spending, starting army size, territory condition, treasury, war fatigue and budget funding do not modify capacity. Capacity automatically rises again when population, integration or research supports it; no permanent crisis penalty exists.

Recruitment spends military funding to fill free national capacity. Training, Recovery and bounded catch-up may change automatic recruitment speed or price, but never the capacity formula. Rapid Recruitment fills at most 5% of current live capacity and then enters a 104-week cooldown. Its discounted initial quote is fixed from the opening country and every successful use makes the next one 25% more expensive; live GDP, conquest and war no longer reprice the button. Research Surge and Propaganda use the same rule with 30% and 35% per-use growth. A conquered frontier begins with 10% of its native local cap, while slow imperial logistics may station existing soldiers above it up to a strict new-inflow ceiling of `2 × local capacity`. This does not create troops: recruitment cannot exceed free empire capacity. Existing trained personnel are not deleted if later population loss or a local cap recalculation leaves them above that ceiling. Instead, ordinary weekly logistics treats the excess as a donor and gradually moves it to owned territory with room; with nowhere valid to move, it remains until real attrition or the sole extreme-crisis drawdown reduces it.

Army redistribution moves manpower through owned routes while conserving total manpower and manpower-weighted base ATK/DEF. The owning empire's Combat Experience applies uniformly before and after movement. Redistribution has zero treasury cost.

### 7.1 Combat Experience

Combat Experience is one non-negative institutional score stored by the country or empire, not by individual soldiers or territories. Every country starts at zero. Country rank, player selection and army size grant no free opening experience.

Battle pulses never grant experience. When a complete war ends after at least one real battle, each participating country receives exactly one deterministic gain. Total-war difficulty uses duration, battle count, cumulative own losses and the campaign power ratio; a harder completed war therefore teaches more than an easy one. A war without combat grants nothing.

```text
warExperienceGain = 1 × clamp(totalWarDifficulty, 0.5, 2)
combatScore = sqrt(combatExperience)
```

Combat Experience itself has no hard cap, while all combat effects are bounded:

```text
attackMultiplier   = 1 + min(0.20, 0.01 × combatScore)
defenseMultiplier  = 1 + min(0.20, 0.01 × combatScore)
casualtyMultiplier = 1 − min(0.15, 0.0075 × combatScore)
```

These multipliers apply empire-wide to every current local army. Recruiting, moving, merging, conquering or losing soldiers neither creates nor dilutes the score. Permanent national mergers preserve earned knowledge without summing duplicate bonuses into free military power.

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

Declaring war itself is free. After declaration, both sides enter a four-week mobilisation phase. No battle pulse occurs before week four. Each live front then charges its explicit weekly operations cost; a naval front costs exactly 1.35× its equivalent land front. Troop redistribution itself remains free.

When a nation's final active war ends, post-war fatigue decays gradually instead of switching instantly to full peacetime efficiency.

## 10. Combat

Wars resolve battle pulses every two weeks. Each side builds a deterministic, source-unique operation for every viable owned source territory that can reach the enemy. All operations on the side with initiative resolve in stable source/target order during that round, so several countries of one empire can attack simultaneously and suffer their own losses. A source army can participate in at most one front per tick. Front scoring considers supply, supporting armies, target army fill, partial control, economy, capital value, power ratio and access penalty.

Supply remains bounded to `[0.25, 1]` and depends on route connectivity, distance from the capital, condition, hostile control, access and Supply research. Naval attacks receive only modest supply friction plus their explicit 35% operations cost. They have no separate assault-strength or casualty multiplier. Troop routing and supply limitations affect combat effectiveness but never charge treasury for movement.

The defender receives `1.25 × terrainModifier` position strength. Attacker pressure is opposed by defender DEF; defender counter-pressure is independently opposed by attacker DEF. Empire-wide Combat Experience modifies ATK, DEF and casualties through the same bounded selectors used by forecasts.

```text
defenderLossRate = clamp(0.016 × (attackPressure / defenseShield)
  × variance × defenderCasualtyModifiers, 0, 0.05)
attackerLossRate = clamp(0.016 × (counterPressure × 1.15 / attackerShield)
  × variance × attackerCasualtyModifiers, 0, 0.05)
```

Variance is seeded in `[0.94, 1.06]`. Damage is simultaneous, uses only deployed local forces and has no minimum-casualty floor. Both loss rates are clamped to `[0, 0.05]`, and the complete exchange including route losses may remove at most 5% of each local formation's supported maximum manpower per pulse. Remaining headcount is the final bound, so a force already below that budget can be fully routed instead of creating a last-percent stalemate. Manpower casualties are continuous. A battle pulse never grants experience; the single difficulty-scaled award occurs only when the full war ends after real combat.

The declaration forecast and live battle resolution use the same pulse projection. Battle damage may also cause bounded civilian casualties, economic damage, condition loss and war fatigue.

## 11. Evolving borders and capture

Partial control is a visual and peace-settlement value, not a second owner and not a capture gate. A territory captures when defending local manpower reaches zero while the attacking source retains combat strength.

For a foreign capture, up to 10% of surviving source manpower moves into the captured territory as a real occupation guard, bounded by `2 ×` the newly unlocked local capacity. The same headcount is removed from the source, so enemy manpower is never inherited and occupation creates no troops or Combat Experience. During the first 52 weeks after capture the guard may receive reinforcement but ordinary empire logistics cannot use it as an outbound donor. It becomes normally mobile after that year and never vanishes automatically.

On capture:

- owner changes to the victor and hostile control is removed;
- surviving population, economy and condition remain as the territory's full potential after explicit battle damage;
- a foreign owner starts at exactly `integration = 0.10`; an original-owner recapture restores `integration = 1`;
- population capacity, taxable output, food production and army capacity all use that same visible integration share;
- the remaining 90% unlocks linearly over one fixed duration derived from immutable baseline population (50%), GDP (30%) and land area (20%); Luxembourg takes 12.5 years, Belgium about 25.5 and China about 170;
- integration speed is calendar-based and is never changed by budget, AI efficiency, war or later growth;
- until completion, `coreOwner` preserves the territorial identity, `fromOwnerId` preserves the sovereign displaced by the latest capture, and the map shows a subtle border, former flag and progress treatment;
- on completion, `coreOwner` becomes the current owner: the old country identity disappears and its land, statistics and land/naval routes are ordinary core territory of that country or empire; Combat Experience and research knowledge from the displaced sovereign and former core transfer by maxima only when each no longer owns any territory, with duplicate identities processed once;
- a lost capital moves to the former owner's largest remaining economy.

The duration curve is immutable. Each population, GDP and area axis first uses the country's baseline logarithmic size normalized over the playable world. Let `s = 0.50 × population + 0.30 × GDP + 0.20 × area`, let `L` be Luxembourg's resulting score, and let `r = clamp((s − L) / (1 − L), 0, 1)`:

```text
integrationYears = 12.5 + 25r + 50r² + 100r⁴
```

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

Capturing territory, rapid Combat Power growth and sustained offensive wars raise global suspicion; peaceful time lowers it. Coalition recruitment begins no earlier than week 156, may add only one member every 52 weeks, requires a higher join threshold and needs five members before containment activates. Nearby states and soft present-day affinity tags may later form permanent defensive federations. Federation cooldown ranges from at least 208 to 312 weeks. Federation merging preserves territories, treasuries, deployed manpower, earned Combat Experience and the strongest existing research without creating free capacity or forces.

The player may fund the documented expensive propaganda program. Its gradual suspicion reduction cannot dissolve an existing federation.

After the first conquest, the player may name the empire. That name becomes the single identity of all absorbed territory and persists in canonical saves.

## 14. Presentation contract

- All user-facing game copy is English.
- The game is desktop-first; no narrow/mobile breakpoint is required.
- The first interaction is the power-ranked country picker. Choosing a country opens the live map directly; there is no preceding explainer or post-selection activation briefing.
- The map shows current ownership, the player's empire outline, active fronts, partial control and selected/important country labels. The current top ten powers remain strategically legible.
- Camera zoom reaches 24× with pointer-anchored wheel zoom and constrained panning, making compact countries such as Luxembourg practical to inspect and select.
- Flags use sharp scalable assets. Active integration retains a subtle former-core flag/border/progress treatment; only completed integration removes that identity from the map.
- War, Nation, Progress and Economy are the four primary drawers. Country detail replaces them instead of stacking.
- Economy is a compact read-only dashboard with Treasury, annualized Tax Income, Costs and Net, the dynamic annual growth rate and components, population, wealth, current/max food storage, annualized stock change and the domestic/imported food mix.
- Economy does not show long calculation chains, troop-movement charges or branch-by-branch research accounting.
- Nation is read-only and shows the current AI mode, paid spending, population, food, research and military state.
- War is the primary decision surface for live fronts, legal targets, forecasts, army upkeep, operations, propaganda, suspicion and containment.
- Combat Experience appears once as the empire-wide score with its bounded derived effects.
- Weekly refresh preserves scroll position in drawers and ranking lists.
- War recommendations and confirmation show target food coverage, storage trend, domestic production, GDP, population and the 10% initial occupation contribution. War starts and conquests create subtle notifications. A conquest no longer blocks play with a post-war modal: currently unlocked economy, cash, population capacity, food access and army-cap gains animate from the captured territory into the matching top-bar metric. Country detail shows integration and remaining years.

## 15. Persistence and invariants

Canonical saves include schema/rules/content/map versions, seed and RNG state, tick and action sequence, nations, territories, wars, truces, offers and AI escalation state. Transient listeners, derived victory projection and visual state are excluded from canonical hashes.

Every completed tick must satisfy:

- all canonical numbers are finite;
- treasury is finite and may be negative;
- population, economy, manpower, capacity, Combat Experience and research progress are non-negative;
- manpower is non-negative; recruitment cannot exceed free empire capacity, new local inflow cannot cross `2 × local capacity`, and an existing overshoot is never deleted instantly;
- `combatExperience >= 0` with no artificial score maximum;
- capacity equals the live population/integration/research formula and never contains a budget or crisis penalty;
- condition and integration remain within their declared bounds;
- each territory has exactly one valid living owner;
- a living nation's capital belongs to that nation;
- budgets and Development allocations retain their exact sums;
- wars have distinct living participants and no duplicate nation pair;
- control references a hostile controller and remains bounded;
- army movement and occupation conserve manpower and manpower-weighted base ATK/DEF except for explicit battle losses; only a completed real war may increase Combat Experience;
- troop movement never mutates treasury.

## 16. Required automated evidence

The V2.54 suite must cover at minimum:

1. schema-18 save/load deterministic continuation plus authenticated schema-13–17 migration, including Greenland conservation and singular-to-plural fronts;
2. the exact 10–20% wealth-linked country-tax identity without double-counting population growth;
3. the compact Economy presentation and absence of obsolete calculation chains;
4. one treasury, debt, paid spending and explicit front costs;
5. army capacity using only `population × integration × 0.00145 × (1 + 0.01 × research)`;
6. automatic capacity recovery after population/integration/research changes and no budget-driven cap loss;
7. recruitment raising manpower without purchasing capacity;
8. free troop movement with exact treasury conservation;
9. Combat Experience remaining one non-negative empire-wide score with no opening selection bonus;
10. zero pulse-time experience plus exactly one difficulty-scaled award after a completed war containing real combat;
11. uncapped experience with bounded square-root ATK/DEF/casualty effects;
12. movement, merging and occupation conserving manpower and manpower-weighted base quality;
13. casualties reducing real manpower without creating or deleting Combat Experience;
14. all four ATK/DEF directions changing the correct casualty stream;
15. equal-force defenders losing less because of the 25% position bonus;
16. capture inheriting zero enemy army and preserving only the proportional occupation force;
17. full capitulation absorbing every remaining territory and only 25% treasury;
18. land/naval access, naval operations costing 35% more, modest supply friction and no naval assault/casualty multiplier;
19. normal/regional 52-week and defensive 26-week AI cooldowns;
20. active AI war cap of 2–4, ordinary one-war limit and post-week-260 major two-war limit;
21. ordinary expansion filtering out targets already at war;
22. exact six always-active Development programs and funding conservation;
23. per-tick invariant checks and multi-seed soak coverage;
24. player finance/Development automation without autonomous player war declarations;
25. expansion suspicion, containment and federation conservation;
26. first-conquest empire naming and persistence;
27. conquest starting at 10%, following the deterministic 12.5/~25.5/~170-year size curve and permanently merging core identity on completion;
28. two or more source armies resolving as real battles in the same front round;
29. healthy post-war AI recruiting toward 100%, with demobilisation only in an extreme crisis and never above 0.05% per week;
30. Greenland remaining separate from Denmark with valid flags, fiscal calibration and Arctic sea routes;
31. top-ten map labels, sharp flags, visible active integration, 24× zoom and country-picker-to-map flow without intro or briefing screens;
32. recruitment and logistics stopping at `2 × local capacity`, with pre-existing overshoot preserved and only gradually rerouted through normal weekly logistics;
33. a manpower-conserving foreign-capture guard staying protected from outbound logistics for exactly 52 weeks before normal redeployment.
34. combat using the gentler 1.6% base rate and a 5%-of-supported-maximum pulse ceiling, including route losses and no protection for a final remnant.
