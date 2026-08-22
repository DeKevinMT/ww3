# Frontier Command

Frontier Command is a real-time world-conquest game on a true political world map. Every country uses the same deterministic national AI for finance, development, recruitment, recovery and military operations. In the country you choose, that autopilot is called **APEX**; selection grants no hidden planning or efficiency advantage. You still choose that country's war targets. AI skill scales only modestly with the country's bounded national-IQ gameplay score, so a higher score means slightly better execution without creating a separate ruleset.

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

Capacity automatically synchronises with live population, integration and research. Recruitment fills available national capacity; it does not purchase more capacity. A healthy AI restores the active army to effectively 100% readiness first and then pays to train a separate reserve pool up to exactly `1 ×` live active capacity. The top bar shows both deployed/capacity and trained reserve/reserve capacity. During war, ordinary weekly recruitment no longer creates fresh active soldiers: the existing pool supplies bounded replacements and therefore depletes. Already-trained reservists mobilise at `3 ×` the matching fresh-training throughput, while paid reserve training itself continues at only 5% of its normal peacetime pace. Demobilisation is forbidden in ordinary recovery and permitted only during an extreme food or debt emergency that also makes payroll genuinely unaffordable; even then at most 0.05% of deployed manpower leaves per week, so army size never changes abruptly. A conquered frontier starts at exactly 10% of its native local cap. Every new conquest integration uses exactly `1.2 ×` the original immutable size curve: 15 years for Luxembourg, about 30 years for Belgium and about 204 years for China. Imperial logistics may slowly reinforce a territory by at most one additional local-cap equivalent, but never creates personnel or bypasses the empire's free national recruitment capacity. A pre-existing overshoot is never deleted: normal weekly logistics gradually moves its excess to another owned territory with room, or leaves it in place until real attrition if no such room exists. Troops may redistribute through owned territory without any treasury charge or separate logistics cost.

Starting ATK and DEF are calibrated separately from the capacity rule. The country's existing military power index is divided by its actually deployable opening manpower; SIPRI spending per deployed soldier then applies only a small ATK-versus-DEF tilt while preserving the same combined 55/45 value. Each territory army keeps its own manpower-weighted base quality after that. Moving or occupying troops carries that quality, merged armies blend it by manpower, and local recruits use the starting profile of the land they come from. Annexation or federation never rewrites or weakens soldiers already deployed. Live effective ATK and DEF then apply an owner-wide national-systems layer driven materially by current integrated GDP per capita and national IQ, from 0.50× to 1.50×, plus diminishing Economy & Science modernisation whose research conversion ranges from 0.75× to 1.25× with IQ. This layer changes as the country develops without mutating the conserved local soldier profiles. National ATK/DEF is only a lightweight display average; live Combat Power remains the additive sum of every local army.

## Simple economy

The Economy tab is a compact read-only overview of treasury, annualized tax income, annualized costs, net cashflow, food supply and the live annual economy-growth rate. Every country first pays a visible Base Operations cost equal to exactly 20% of ordinary tax revenue; the remaining 80% is available to food and the normal national programmes. The simulation still settles weekly, but player-facing recurring rates are shown per year for easier comparison. It uses one automatic country rate and one transparent tax identity:

```text
reference productive population = sum(opening population × current integration share)
live population factor = live productive population / reference productive population
fiscal wealth reference = integrated GDP / reference productive population
country tax rate = 10% + 10% × clamp(fiscal wealth reference / $75K, 0, 1)
taxable output = integrated GDP × (50% + 50% × live population factor)
weekly tax = taxable output × country tax rate ÷ 52
```

The rate therefore stays between 10% and 20%: lower-income countries sit near 10%, while financially strong countries move toward 20%. It is automatic, not a player slider. The tax rate itself has no hidden war or condition modifier; the live and reference populations of an annexed territory use the same visible integration share. At the opening baseline the population factor is exactly one, so starting income keeps its previous calibration. Afterwards tax responds monotonically to live productive population: more people raise receipts and losses lower them, while the stable 50% economy half keeps some income available after a severe demographic collapse so food recovery remains possible. Real integrated GDP, the displayed Economy value, global ranking and conquest value remain separate from this fiscal blend. GDP grows only through the economy-growth system, reconstruction or conquest; displayed GDP per person may still fall when population grows against unchanged production.

Real economic growth is recalculated every week instead of being fixed:

```text
annual economy growth = 0.3% base
  + productive investment as a share of live GDP × 0.22
  + Economy Growth research
  + a small full-food bonus
  − food-shortage drag
  − war and post-war growth drag
```

Productive investment is capped at a normalised 12% share for the growth calculation. The result is bounded between −6% and +4.5% per year. An active war removes at least 1.8 percentage points, with extra fronts and fatigue worsening the loss; recovery remains gradual after peace. Food production uses land, terrain, live condition, integration, research and the territory's current economic strength. India's agricultural territory has a modest 30% structural yield uplift. Domestic food is bought first; imports cover the remaining demand at a higher price. `100% incoming` means this week's needs are covered; production or imports above 100% become stored surplus. Food has a real national storage limit: population creates the base need while controlled landmass, wealth and Supply research add storage depth. The top bar shows `current / maximum` food and the annualized storage gain or loss. The Economy drawer subtracts imports from exports and explicitly labels the result as **Net Food Imports**, **Net Food Exports** or balanced trade, so a country that imports food is never described as merely having no exports. This makes reserves a real buffer instead of a constant countdown, while fragile countries still carry a much larger food cost. A rich, poor, populous, agricultural or food-insecure conquest changes the combined economy and food system in a different, visible way.

For steadier long campaigns, each World Bank population-growth starting value is moved exactly halfway toward 1% annual growth:

```text
balanced growth = 1% + 0.5 × (source growth − 1%)
```

This raises the lowest figures, lowers the highest figures and preserves the complete country ordering. The adjustment happens once when game content is built and adds no work to weekly simulation.

Every national AI manages one treasury and three priorities:

- **Armed Forces** pays army upkeep, wartime operations and recruitment.
- **Research** funds the six Development programs.
- **National Economy** supports repair, economic growth and population growth.

Food remains the first required weekly cost. When food reserves fall below one week or food security becomes critical, the country may spend its positive cash reserve to close the emergency food gap. In peace, food shortage, population decline, exhausted reserves or debt place every AI in survival recovery: development and essential research take priority and optional wars stop. Low post-war condition or an ordinary deficit never authorises demobilisation; a solvent, fed country protects payroll and rebuilds toward a full army. Only an extreme combined survival and affordability crisis permits the 0.05%-per-week drawdown. During war, every viable source-unique owned army opens and pays for its own real front, so a multi-country empire can attack simultaneously from several territories. A campaign continues across the enemy's remaining territories until peace, withdrawal or capitulation. Treasury may fall below zero; borrowing adds a premium and causes the AI to reduce discretionary spending until finances recover.

The shared treasury policy deliberately builds a liquid emergency buffer: roughly eight weeks of tax revenue in peace, or six weeks plus two per active war, with only small IQ and economy-size adjustments. While building it, the planner retains a bounded share of otherwise free cash; even a funded reserve keeps 5% of free cashflow. Autonomous countries do not drain that buffer through one-off Rapid Recruitment, Research Surge or Propaganda purchases. The common planner reviews recurring policy every eight weeks and moves budget and research allocations toward their targets by only two to four percentage points in total per review, with national IQ determining the small bounded step. This keeps allocation-driven costs and priorities gradual; real events such as war, conquest or lost revenue can still change mandatory costs directly.

## Development

All six programs progress automatically at the same time. The national AI gradually redistributes attention according to the country's current needs:

- **Population & Recruitment** — population growth or training speed.
- **Military Industry** — force capacity or cheaper recruitment.
- **Advanced Weapons** — ATK or territorial pressure.
- **Defensive Systems** — DEF or casualty reduction.
- **Logistics & Medicine** — replenishment or supply.
- **Economy & Science** — economic growth, research speed or research efficiency.

Every breakthrough adds a deterministic seeded +1% result from its branch. Requirements grow along the `(B + 1) × 1.18^B` mastery curve, so research can continue indefinitely while later improvements take longer. Research allocations use the same eight-week, two-to-four-point transition limit as the national budget and therefore never jump straight to a newly calculated target.

## War and conquest

Wars are persistent operations resolved on a deterministic combat cadence. Every viable, source-unique army route becomes a real simultaneous front; the complete deployed source and target armies on those fronts contribute to pressure, take losses, appear on the map and add operations cost. ATK, DEF, supply, condition, terrain, supporting armies and the defender's 25% position advantage all matter. Naval fronts cost 35% more to operate and receive only modest supply friction; they have no separate assault or casualty penalty. Effective damage uses a `0.008` (0.8%) multiplier against the opposing pressure/shield ratio, exactly half of the former `0.016` baseline. There is no per-pulse casualty or damage ceiling: requested losses are applied directly, with only the remaining local manpower as the natural upper bound. A compact War Strain meter above the live war cards replaces the ambiguous Recovery Load value: it rates push sustainability from current fronts, fatigue, active readiness and reserves, then states the existing output, growth, research and operation-cost consequences. It is explanatory only and adds no hidden modifier.

Battle damage can also displace a small number of surviving civilians from both sides into one deterministic safe land neighbour. The host must be outside both belligerent camps, outside every active war, fully integrated, uncontrolled and in good condition. Displacement transfers population rather than destroying it and is shared across every battle touching the same source territory in that week: at most 0.025% of attacker-home population and 0.05% of defended-territory population, further bounded by 35% and 50% of that side's civilian-death figure respectively. If no safe neighbour exists, no transfer occurs.

Conquest preserves the surviving population, economy and infrastructure as the territory's full long-term potential. A foreign owner receives exactly 10% of its population capacity, taxable output, food production and army capacity immediately. The remaining 90% unlocks smoothly on the immutable `1.2 ×` original population/GDP/land-area calendar: Luxembourg takes 15 years, Belgium about 30 and China about 204. The integrating country's former identity, flag and internal boundary remain subtly visible on the map. At completion its `coreOwner` becomes the current owner, the program is deleted and the old flag, border and country label disappear permanently; the territory's population, economy, condition, army and routes remain intact as ordinary core territory. Once no owned territory or unfinished core identity remains for the displaced country, national treasury, food and trained reserves transfer exactly once, strongest research knowledge transfers by maxima without stacking, and the obsolete backend nation record is removed. There is no selected-country exception: if the player's former country reaches full absorption, its record disappears too and the campaign ends on a dedicated defeat screen. Save loading also retires pre-existing absorbed zombie records deterministically. Recapturing a territory by its core owner restores full integration. No enemy army is inherited. A real occupation guard is drawn from the surviving attacking source: up to 10% of that army moves across, never beyond one additional local-cap equivalent of support, and remains protected from ordinary outbound logistics for 52 weeks. After that first year it can redistribute normally; it never disappears or becomes free manpower. Final capitulation may transfer up to 25% of the defeated treasury.

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

Expansion-driven suspicion can still create permanent defensive federations, but coalition recruitment cannot begin before year three, adds at most one member per year and needs five aligned members before loose containment activates. Permanent federation waves are separated by at least four to six years depending on threat. These systems do not bypass treasury, access, combat or global war limits and grant no selected-opponent ATK, DEF, forecast or declaration bonus.

## Controls

- Choose a country from the single global-ranking picker; its score is `sqrt(Combat Power × controlled economy)`, giving military power and economy equal relative weight. The Army column combines deployed manpower and capacity as `x / x`. Selection opens the live map immediately, without an explainer or activation briefing.
- The campaign advances automatically at one week per real second.
- Click a country for intelligence or an opening-front forecast.
- Scroll to zoom as deep as 24×, drag to pan and press `Esc` to close the current panel. The top ten powers keep strategic labels while close zoom reveals compact countries and integration progress.
- War, Nation, Progress and Economy use desktop drawers and preserve their scroll positions during weekly updates. War targets show food coverage, food-stock trend, GDP and population before the player commits. Every completed player war queues a post-war report with the result, opponent, duration, battles, land changes, military and civilian losses, economy and treasury change, army/capacity change, force-quality mix and treaty terms. Reports appear one at a time and must be continued before play resumes. Conquest gains still travel subtly from the captured country to matching top-bar metrics, and bottom notifications remain readable for 3.2 seconds normally, 4 seconds for war events and 5 seconds for conquests, with at most four visible at once.

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

The deterministic TypeScript simulation, AI, persistence and map content remain isolated from Phaser rendering and the DOM HUD. Canonical saves use **schema 20** and rules version **`frontier-command-v2.55-combat-rebalance`**. Authenticated schema-13 through schema-19 saves migrate deterministically; schema-16 single fronts become front arrays, prior conquest progress is preserved, schema-18 active programs receive the current remaining calendar exactly once, existing schema-19 programs retain both their visible share and promised completion date, the former combined Denmark/Greenland state is split without changing its owner or totals, schema-19's retired legacy Combat Experience field is discarded, and every migrated nation begins with a deterministic zero trained-reserve pool. Incompatible rules versions are rejected. The active player UI exposes no manual Rapid Recruitment, Research Surge or Propaganda buttons, modals or queued handlers; their canonical fields remain only for compatible save and engine replay. The Progress drawer lists every active empire-wide upgrade level as well as the next milestones. Map ownership, borders, fronts, labels and logistics views reuse cached derived data so weekly updates and zoom changes avoid repeating unchanged work.

```bash
pnpm test
pnpm build
```
