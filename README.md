# Frontier Command

Frontier Command is a real-time world-conquest game on a true political world map. Every country uses the same deterministic national AI for finance, development, recruitment, recovery and military operations. Country selection grants no hidden planning or AI-efficiency advantage, while the human commander chooses war and peace. It does amplify that country's one existing trait, with a smooth 1.03× modifier for the strongest opening military through 20× for the weakest. Solo play assigns one country. Public matchmaking and private Direct Connect rooms assign a different country to each player in the same world, with the same economy, research, AI and combat rules. AI skill scales only modestly with the country's bounded national-IQ gameplay score, so a higher score means slightly better execution without creating a separate ruleset.

The game is designed for desktop. The map contains 166 strategically useful countries; microstates and very small islands are omitted to keep the campaign readable and fast. Greenland is an explicit playable exception with its own territory, flag, economy and Arctic sea routes. The strategic map keeps the current top ten powers legible, uses sharp vector flags and supports deep zoom up to 24× so compact countries such as Luxembourg remain practical to inspect and select.

## The core military model

**Manpower** is the complete deployed army and its normal combat-health pool. Every territory army stores:

- total manpower;
- its current population-, integration- and research-based capacity;
- the manpower-weighted base ATK and DEF carried by that local army.

Local ATK/DEF quality remains additive: `manpower × base quality` is conserved when armies mix. Moving, recruiting or taking casualties cannot manufacture military quality, and there is no separate battle-XP progression system.

Army capacity is intentionally simple and cannot be permanently damaged by budget trouble or a temporary crisis. Newly conquered land unlocks its population reserve gradually through its visible integration share:

```text
territory army capacity = live population × integration × 0.00145
  × (1 + Force Capacity research × 0.01)
```

Capacity automatically synchronises with live population, integration and research. Recruitment fills available national capacity; it does not purchase more capacity. Every country opens with a country-calibrated reserve: published reserve pools contribute a common 55% immediately-ready share, missing or zero observations receive a small 2%-of-cap trained cadre, and every result remains bounded by exactly `1 ×` live active capacity. A healthy AI restores the active army to effectively 100% readiness first and then pays to train that separate reserve pool. The top bar shows both deployed/capacity and trained reserve/reserve capacity. During war, ordinary weekly recruitment no longer creates fresh active soldiers: the existing pool supplies bounded replacements and therefore depletes. Already-trained reservists mobilise at `3 ×` the matching fresh-training throughput, while paid reserve training itself continues at only 5% of its normal peacetime pace. Demobilisation is forbidden in ordinary recovery and permitted only during an extreme food or debt emergency that also makes payroll genuinely unaffordable; even then at most 0.05% of deployed manpower leaves per week, so army size never changes abruptly. A conquered frontier starts at exactly 10% of its native local cap. Every new conquest integration uses exactly `1.02 ×` the original immutable size curve: about 12.8 years for Luxembourg, 26 years for Belgium and 173 years for China. A foreign territory can station its local cap plus 10% of the empire's total Army cap when integration begins; this support allowance declines linearly to 5% at full integration. It is a deployment ceiling, not a troop requirement, and creates neither personnel nor national recruitment capacity. A pre-existing overshoot is never deleted: normal weekly logistics gradually moves its excess to another owned territory with room, or leaves it in place until real attrition if no such room exists. Troops may redistribute through owned territory without any treasury charge or separate logistics cost.

Starting ATK and DEF are calibrated separately from the capacity rule. The country's existing military power index is divided by its actually deployable opening manpower; GDP per capita and IQ supply only a small conserved 0.97×–1.03× opening-quality imprint, while SIPRI spending per deployed soldier applies an ATK-versus-DEF tilt without changing the combined 55/45 value. Each territory army keeps its own manpower-weighted base quality after that. Moving or deploying troops carries that quality, merged armies blend it by manpower, and local recruits use the starting profile of the land they come from. Annexation or federation never rewrites or weakens soldiers already deployed. Live effective ATK and DEF then apply a separate owner-wide national-systems layer: current integrated GDP per capita carries 65% and live national IQ 35%, producing 0.35×–1.65× across the opening bounds and up to 1.715× at researched IQ 112. Diminishing Economy & Science modernisation then converts at 0.75×–1.25× with IQ. Effective DEF above neutral 1.0 passes through an additional bounded diminishing-return curve. This same effective value is used in combat, the pure military ranking, forecasts, national panels and post-war reports.

Every empire has exactly one immutable country trait: the trait of its original 2026 nation. All visible trait names, effects, conditions and identity text are English. Each identity is value-balanced around a distinct playstyle; very weak countries primarily gain scalable growth tools such as Army capacity instead of passive cost trivia. Flat `+DEF %` country-trait modifiers are retired: those old passive slots now grant clearer growth, recruitment, reserve, supply or research tools, while normal GDP/IQ defense quality remains intact. Greenland keeps exceptional recruitable room without receiving free opening soldiers. A human seat amplifies the signed bonuses of that same trait using the 1.03×–20× opening-military-rank curve, with most of the increase reserved for the weakest starts. Conquest, integration, revolution and federation never copy, donate or stack another country's trait.

## Simple economy

The Economy tab is a compact read-only overview of treasury, annualized tax income, annualized costs, net cashflow, food supply and the live annual economy-growth rate. The current empire treasury also sits directly beside Economy in the top bar and visibly marks debt. Every country starts with a visible Base Operations cost equal to 20% of ordinary tax revenue; Public Administration research can gradually lower it toward 15%, and the live percentage is shown in the ledger. The simulation still settles weekly, but player-facing recurring rates are shown per year for easier comparison. It uses one automatic country rate and one transparent tax identity:

```text
reference productive population = sum(opening population × current integration share)
live population factor = live productive population / reference productive population
fiscal wealth reference = integrated GDP / reference productive population
country tax rate = 10% + 10% × clamp(fiscal wealth reference / $75K, 0, 1)
taxable output = integrated GDP × (50% + 50% × live population factor)
weekly tax = taxable output × country tax rate ÷ 52
```

The rate therefore stays between 10% and 20%: lower-income countries sit near 10%, while financially strong countries move toward 20%. It is automatic, not a player slider. The tax rate itself has no hidden war or condition modifier; the live and reference populations of an annexed territory use the same visible integration share. At the opening baseline the population factor is exactly one, so starting income keeps its previous calibration. Afterwards tax responds monotonically to live productive population: more people raise receipts and losses lower them, while the stable 50% economy half keeps some income available after a severe demographic collapse so food recovery remains possible. Real integrated GDP, the displayed Economy value and conquest value remain separate from this fiscal blend; global rank is based only on live Combat Power. GDP grows only through the economy-growth system, reconstruction or conquest; displayed GDP per person may still fall when population grows against unchanged production.

Real economic growth is recalculated every week instead of being fixed:

```text
annual economy growth = 0.3% base
  + productive investment as a share of live GDP × 0.22
  + Economy Growth research
  + a small full-food bonus
  − food-shortage drag
  − war and post-war growth drag
```

Productive investment is capped at a normalised 12% share for the growth calculation. The result is bounded between −6% and +4.5% per year. An active war removes at least 1.2 percentage points, with extra fronts and fatigue worsening the loss; recovery remains gradual after peace. Food production uses agricultural capacity, live condition, integration, research and the territory's current economic strength; terrain is not a gameplay system. Domestic food is bought first; imports cover the remaining demand at a higher price. `100% incoming` means this week's needs are covered; production or imports above 100% become stored surplus. Food may fall below the safe balance: increasingly deep shortages first suppress growth and then cause slow but visible famine deaths. Food has a real national storage limit: population creates the base need while controlled landmass, wealth and Food Systems research add storage depth. The top bar shows `current / maximum` food and the annualized storage gain or loss. The Economy drawer subtracts imports from exports and explicitly labels the result as **Net Food Imports**, **Net Food Exports** or balanced trade, so a country that imports food is never described as merely having no exports. This makes reserves a real buffer instead of a constant countdown, while fragile countries still carry a much larger food cost. A rich, poor, populous, agricultural or food-insecure conquest changes the combined economy and food system in a different, visible way.

Food purchasing is preventative as well as reactive. The funded request rises smoothly as stock falls below its country-specific target and progressively draws on positive treasury reserves instead of waiting for weekly coverage to fail. During a live shortage, extra starvation mortality begins below 10% of the safe target stock and increases toward the empty-reserve maximum.

For steadier long campaigns, each World Bank population-growth starting value is moved exactly halfway toward 1% annual growth:

```text
balanced growth = 1% + 0.5 × (source growth − 1%)
```

This raises the lowest figures, lowers the highest figures and preserves the complete country ordering. The adjustment happens once when game content is built and adds no work to weekly simulation.

Every national AI manages one treasury and three priorities:

- **Armed Forces** pays army upkeep, wartime operations and recruitment.
- **Research** funds the ten Development programs.
- **National Economy** supports repair, economic growth and population growth.

Food remains the first required weekly cost. When food reserves fall below one week or food security becomes critical, the country may spend its positive cash reserve to close the emergency food gap. In peace, food shortage, population decline, exhausted reserves or debt place every AI in survival recovery: development and essential research take priority and optional wars stop. Low post-war condition or an ordinary deficit never authorises demobilisation; a solvent, fed country protects payroll and rebuilds toward a full army. Only an extreme combined survival and affordability crisis permits the 0.05%-per-week drawdown, and at least 25% of live Army capacity remains as a home guard. During war, every viable source-unique owned army opens and pays for its own real front, so a multi-country empire can attack simultaneously from several territories. A campaign continues across the enemy's remaining territories until peace, withdrawal or capitulation. Treasury may fall below zero: new borrowing costs 10%, the first revenue-week of debt remains a recoverable grace band, and deeper debt progressively raises import costs and contracts recurring-program funding. Existing debt begins a small carrying premium after two revenue-weeks, reaches full activation after eight, and is capped at 25% of weekly revenue; pressure reaches its severe and critical stages at 26 and 52 revenue-weeks respectively.

The shared treasury policy deliberately builds a liquid emergency buffer: roughly eight weeks of tax revenue in peace, or six weeks plus two per active war, with only small IQ and economy-size adjustments. While building it, the planner retains a bounded share of otherwise free cash; even a funded reserve keeps 5% of free cashflow. For AI countries and the human country's APEX planner alike, cash above 10% of live controlled GDP is gradually reinvested through existing readiness, research and Development systems. The draw ramps in over the next 5% of GDP and is capped each week at 2% of the true excess and 25% of weekly revenue, so a windfall remains stable rather than disappearing at once. Autonomous countries do not drain that buffer through one-off Rapid Recruitment, Research Surge or Propaganda purchases. The common planner reviews recurring policy every eight weeks and moves budget and research allocations toward their targets by only two to four percentage points in total per review, with national IQ determining the small bounded step. This keeps allocation-driven costs and priorities gradual; real events such as war, conquest or lost revenue can still change mandatory costs directly.

## Development

All ten programs progress automatically at the same time. The national AI gradually redistributes attention according to each country's current needs:

- **Population & Recruitment** — population growth or training speed.
- **Military Industry** — force capacity or cheaper recruitment.
- **Advanced Weapons** — ATK or reinforcement efficiency.
- **Defensive Systems** — DEF or casualty reduction.
- **Logistics & Medicine** — replenishment or supply.
- **Economy & Science** — economic growth, research speed or research efficiency.
- **Food Systems** — domestic food output or strategic storage.
- **Reserve Doctrine** — reserve training or wartime mobilisation.
- **Public Administration** — tax collection or lower base operations.
- **Education & Intelligence** — a very expensive, diminishing live-IQ increase capped at 112.

Every breakthrough adds a deterministic seeded +1% result from its branch. Requirements grow along the `(B + 1) × 1.18^B` mastery curve, so research can continue indefinitely while later improvements take longer. Research allocations use the same eight-week, two-to-four-point transition limit as the national budget and therefore never jump straight to a newly calculated target.

## War and conquest

Wars are persistent operations resolved on a deterministic combat cadence. Every viable, source-unique army route becomes a real simultaneous front; the complete deployed source and target armies on those fronts contribute to pressure, take losses, appear on the map and add operations cost. ATK, DEF, supply, condition, supporting armies and the defender's position advantage all matter. Naval fronts now extend to long-haul global lanes. A short route starts at 1.35× land operating cost and 0.92× supply; distance raises cost smoothly toward 2.15× and lowers supply toward 0.62× by 9,000 km. Naval access has no separate assault or casualty penalty. Effective damage uses a `0.008` (0.8%) multiplier against the opposing pressure/shield ratio. Requested losses are bounded only by remaining local manpower. Even an undefended conquest during the first six war weeks costs the attacker at least 1% of the assault force after ordinary battle losses, so a one-hit annexation is never free.

The War Strain meter rates sustainability from live wars, fronts, duration, recent conquests, fatigue, active readiness and reserves. A fresh single land war starts at only 5 strain, but duration builds toward 22 additional points. Separate simultaneous wars add a steep non-linear penalty, while extra fronts inside one conflict keep diminishing pressure and naval routes count as only 0.25 of a land front. Each hostile territorial conquest adds 8 temporary strain that fades over 78 weeks; voluntary federation integration adds none. Naval battle pulses also generate less fatigue. At very high strain, AI countries increasingly prioritize a vulnerable human empire while still respecting their normal concurrent-war limits.

Army economics also follows live GDP per capita through a bounded square-root cost-of-living curve. Low-income mass armies pay materially less for soldier upkeep, recruitment, reserve training and the manpower portion of war operations; wealthy high-quality forces pay more per soldier. The 0.58×–1.45× bounds keep North Korea-style force structures financially possible without making poverty an unlimited free-army exploit. GDP-scaled war administration, weapons quality, real defence spending, army size and country traits continue to apply separately.

A country with a negative treasury cannot declare a new war. Existing wars continue normally, and the central declaration rule unlocks again as soon as treasury reaches zero or higher, so neither human commands nor AI paths can bypass debt recovery.

Battle damage still causes bounded local civilian deaths on both sides. Those losses remain in the affected territories: there is no cross-border migration, refugee or displacement subsystem.

Conquest preserves the surviving population, economy and infrastructure as the territory's full long-term potential. Territory stays completely with its defender throughout combat and transfers directly, in full, only after decisive conquest; there is no partial-control state. A depleted formation may surrender only after at least 26 weeks on the same strongly dominant front, at no more than 12.5% local readiness, after losses equal to at least 80% of local capacity and while outnumbered at least four to one. Surrendered remnants leave active manpower but are not reported as battle deaths. A foreign owner receives exactly 10% of its population capacity, taxable output, food production and army capacity immediately. The remaining 90% unlocks smoothly on the immutable `1.02 ×` original population/GDP/land-area calendar: Luxembourg takes about 12.8 years, Belgium 26 and China 173. The base administration quote is 3% per year of the territory's live GDP at capture; the active owner's one trait may adjust that quote, after which it is frozen and paid only while the program exists. Completion, sovereign recapture or revolution ends it. Each frozen integration program has one seed-stable 2% revolution chance, scheduled between 20% and 80% of its calendar. A revolution restores the territory and surviving live stats to its immutable 2026 start owner—even if that nation had been absorbed—instead of using a recent owner or federation leader. At completion without revolution, `coreOwner` becomes the current owner, the program is deleted and the old flag, border and country label disappear permanently. A real conquest guard is drawn from the surviving attacking source: up to 10% of that army moves across, bounded by the territory's local cap plus 10% of total empire Army cap at the start; this scalable support share declines linearly to 5% at full integration. It never creates soldiers or national cap.

AI finance reserves every frozen integration bill before it calculates food and discretionary military, research or development envelopes, so the same weekly revenue cannot be promised twice. Integration costs equal to at least 15% of revenue progressively increase the required war chest; at 40% they block optional AI expansion until the burden or fiscal position improves.

Peaceful defensive federation is an accelerated version of the same visible core-fusion process, not an instant stat rewrite. Ownership changes when the union begins, each joining territory integrates over `0.25 ×` its conquest duration, and its live population, economy, condition and deployed army quality remain unchanged. The member's treasury, food, trained reserves and strongest research remain conserved until its final core completes, then transfer exactly once before the retired backend identity is removed.

Rival expansion is deliberately restrained:

- normal AI war starts have a 52-week global cooldown;
- regional escalations also have a 52-week cooldown;
- defensive interventions have a 26-week cooldown;
- the global active-war cap grows only from 2 to 4;
- an ordinary country may have at most one active war;
- only a major power after week 260 may sustain two;
- normal expansion targets peaceful ordinary countries, avoiding states already caught in another war.
- each eight-week AI review gets only one ordinary expansion commitment roll; normal chances remain modest and opportunistic dogpiles are sharply suppressed.
- a human empire at very high War Strain becomes an increasingly attractive exception, without bypassing routes, truces, finance, food, forecasts or the global war cap.

Expansion-driven suspicion can still create permanent defensive federations, but coalition recruitment cannot begin before year three, adds at most one member per year and needs five aligned members before loose containment activates. Federation checks occur only every two years, require threat 75–86, and successful waves remain six to eight years apart; reactions to a rapidly expanding AI cannot begin before year 16 and use the same two-year windows. Each new union starts with two countries and gains at most one member per later wave. Its founding pair permanently produces a deterministic name ending in **Defense Federation**. These systems do not bypass treasury, access, combat or global war limits and grant no ATK, DEF, forecast, declaration or other hidden multiplier.

## Controls

- Choose a country from the single pure military-ranking picker; its score is current Combat Power only. The same order is used by the picker, top bar and ranking display. The list can also be sorted by GDP per capita and the other visible opening metrics. Picker stats and sorting use the ordinary AI baseline, including deployed Army, trained Reserve, GDP per capita and starting Treasury; the human trait multiplier is shown separately and never changes the preview rank.
- The campaign advances automatically at one week per real second.
- Click a country for intelligence or an opening-front forecast.
- Scroll to zoom as deep as 24×, drag to pan and press `Esc` to close the current panel. The top ten powers keep strategic labels while close zoom reveals compact countries and integration progress. Map tags emphasize a country's combat-power number instead of separate ATK/DEF text. Land warfare follows a warm, solid ground-contact line; naval warfare uses cool curved dashed sea lanes. The persistent route remains stable, while an armored or fleet marker travels along that exact route only when a real battle pulse resolves, followed by a distinct impact. These screen-pixel-scaled effects remain legible at every zoom and reduce motion when the browser requests it.
- War, Nation, Progress and Economy use desktop drawers and preserve their scroll positions during weekly updates. The top bar keeps Treasury beside Economy, replaces the old APEX-status slot with live World Population and mapped World Land control, and keeps all eight metrics horizontally accessible on mobile. War targets show food coverage, food-stock trend, GDP and population before the player commits. Every completed player war queues a post-war report with the result, opponent, duration, battles, land changes, military and civilian losses, economy and treasury change, army/capacity change, force-quality mix and treaty terms. Reports appear one at a time. Solo play pauses until the queue is continued; in multiplayer each report blocks only that local interface while the shared host clock keeps running. Conquest gains still travel subtly from the captured country to matching top-bar metrics, and bottom notifications remain readable for 3.2 seconds normally, 4 seconds for war events and 5 seconds for conquests, with at most four visible at once.

## Multiplayer

Public matchmaking lets a player enter one live queue without choosing a lobby size or exchanging codes. Compatible players are placed in an open lobby, and more commanders may join until the elected host starts. Every connected player chooses a unique country and marks ready. Private Direct Connect rooms remain available for friends who prefer manual invites.

The production queue runs at `wss://frontier-command-matchmaking.dekevinmt.workers.dev/matchmaking`. The client ships with that endpoint as its secure default; `VITE_MATCHMAKING_URL` remains available for explicit local or staging overrides.

The host is authoritative: its tab owns the shared clock, validates that every command belongs to the sender's country, assigns the global action order and broadcasts deterministic ticks. Guests run synchronized replicas, compare a canonical checkpoint every eight eligible ticks and request an authoritative snapshot if they diverge. Only the host changes shared speed. Each local interface uses its own assigned-country viewer, locally read inbox state and war-report queue; those presentation choices never change the shared save or hash.

Campaign connections use browser WebRTC data channels with a public **STUN-only** configuration. Public matchmaking automates discovery and signaling, while private rooms expose the manual invite/answer exchange. The host tab must remain open for the entire game. There is no TURN relay fallback, so restrictive school, office, carrier-grade or mobile networks may block a direct peer route.

## Start

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173`.

## Data baseline

- Borders: [Natural Earth Admin 0 Countries, 1:50m](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/)
- Population and population growth: [World Bank](https://data.worldbank.org/indicator/SP.POP.TOTL)
- Baseline mortality: [World Bank](https://data.worldbank.org/indicator/SP.DYN.CDRT.IN)
- GDP: [World Bank](https://data.worldbank.org/indicator/NY.GDP.MKTP.CD)
- Tax revenue: [IMF World Revenue Longitudinal Database (WoRLD)](https://data.imf.org/Datasets/WORLD)
- Agricultural-land calibration: [FAOSTAT Land Use](https://data.fao.org/catalog/dataset/946526fb-7148-45b7-80e0-a4c3881ff2ab)
- Military expenditure: [SIPRI 2025](https://www.sipri.org/publications/2026/sipri-fact-sheets/trends-world-military-expenditure-2025)
- Military expenditure: [World Bank / SIPRI](https://data.worldbank.org/indicator/MS.MIL.XPND.CD)

The browser client uses [Phaser](https://github.com/phaserjs/phaser) and [flag-icons](https://github.com/lipis/flag-icons). Their own licenses remain applicable. No license is granted for Frontier Command itself unless a repository license is added explicitly.

The starting power index is a gameplay score based on these datasets, not a political or moral judgement. Live population, economy, borders and military strength then evolve through the simulation.

## Architecture and verification

The deterministic TypeScript simulation, AI, persistence, multiplayer protocol and map content remain isolated from Phaser rendering and the DOM HUD. Canonical saves use **schema 22** and rules version **`frontier-command-v2.60-revolutions-debt`**. Schema 22 stores the sorted `humanPlayerIds` roster, alliances and war-revenge state; the local viewer is runtime-only. Authenticated same-schema V2.59 saves upgrade in place after their original payload is verified. Authenticated schema 13–21 migrations remain deterministic, and existing integration endpoints remain unchanged.

V2.60 keeps those deterministic performance boundaries while adding original-owner integration revolutions, pure military ranking, stronger GDP/IQ combat systems, progressive debt, productive cash-surplus investment, weakness-targeted country traits and high-strain AI opportunism. Development and tests still run exhaustive invariants every tick; production runs the same full scan every eight ticks and forces it immediately on terminal paths.

```bash
pnpm test
pnpm build
```
