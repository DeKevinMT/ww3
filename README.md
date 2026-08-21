# Frontier Command

Frontier Command is a real-time world-conquest game on a true political world map. In 2026, the country you choose activates the world's first **Super AI**. You choose war targets; it continuously manages finance, development, recruitment, recovery and military operations. Rival countries use deterministic AI under the same core rules.

The game is designed for desktop. The map contains 166 strategically useful countries; microstates and very small islands are omitted to keep the campaign readable and fast. Greenland is an explicit playable exception with its own territory, flag, economy and Arctic sea routes.

## The core military model

**Manpower** is the complete deployed army and its normal combat-health pool. **Veteran Forces** are experienced soldiers inside that manpower total, never a separate unit or currency. Every territory army stores:

- total manpower;
- the manpower-weighted base ATK and DEF carried by that local army;
- veteran manpower, which must remain between zero and total manpower;
- the veterans' equivalent experience, which is non-negative and has no hard cap.

A low-ranked country selected by the human player receives a one-time, rank-scaled elite core drawn from its existing manpower; this never creates extra soldiers. The top 20 receive no opening aid. The share and XP rise smoothly below them, up to 80% of the army and 3,500 XP for the weakest countries. After the campaign starts, veteran status changes only when a complete war ends. If that war contained combat, a difficulty-scaled share of the surviving national force is promoted and existing veterans gain one experience step. Duration, battle count, losses and the campaign power ratio determine the total-war difficulty. A veteran contribution uses diminishing returns so long-lived forces may keep improving without quickly breaking balance:

```text
veteran HP bonus  = 0.03 × sqrt(equivalent experience)
veteran ATK bonus = 0.01 × sqrt(equivalent experience)
veteran DEF bonus = 0.01 × sqrt(equivalent experience)
```

The linear veteran bonus score is `sqrt(XP)`. Whenever cohorts merge, their scores are weighted by veteran manpower and the average score is squared back into the stored equivalent XP. `Average Rank = floor(sqrt(equivalent XP)) + 1`, or Rank 0 when no veterans exist. New post-war promotions start at Rank 1 and therefore never inherit a 5,000-XP opening elite's bonus merely by joining it. These bonuses apply only to the veteran share of the army. Casualties remove veteran soldiers; when no veterans survive, their XP and elite advantage are gone. New recruits are regular soldiers, so growth and conquest naturally dilute an opening elite core.

ATK/DEF quality is additive: `manpower × base quality` is conserved when armies mix, and veteran quality adds `veteran manpower × bonus × 100` rating-mass. HP changes casualty durability only. This one global reference keeps the weakest opening countries playable without country-specific exceptions, while ordinary low-XP post-war cohorts remain modest because they begin as a small share.

Army capacity is intentionally simple and cannot be permanently damaged by budget trouble or a temporary crisis. Newly conquered land unlocks its population reserve gradually through its visible integration share:

```text
territory army capacity = live population × integration × 0.00145
  × (1 + Force Capacity research × 0.01)
```

Capacity automatically synchronises with live population, integration and research. Recruitment fills available national capacity; it does not purchase more capacity. A healthy AI keeps recruiting toward 100% readiness, including after a war. Demobilisation is permitted only during a real food, debt or payroll emergency, and even then releases only a small share each week; it never changes army size instantly. A conquered frontier starts at 10% of its native local cap and unlocks the remainder over 10–20 years according to country size. Imperial logistics may slowly station existing troops above a local cap, but total empire manpower remains bounded by the summed national cap. Rapid Recruitment can fill at most 5% of live capacity and then has a 104-week cooldown. Its first price is fixed from the chosen country's opening army and discounted by 15%; every successful use raises only the next quote by 25%, so conquest or temporary GDP changes cannot reprice the button. Troops may redistribute through owned territory without any treasury charge or separate logistics cost.

Starting ATK and DEF are calibrated separately from the capacity rule. The country's existing military power index is divided by its actually deployable opening manpower; SIPRI spending per deployed soldier then applies only a small ATK-versus-DEF tilt while preserving the same combined 55/45 value. Each territory army keeps its own manpower-weighted quality after that. Moving or occupying troops carries their quality with them, merged armies blend by manpower, and local recruits use the starting profile of the land they come from. Annexation or federation never rewrites or weakens soldiers already deployed. National ATK/DEF is only a lightweight display average; live Combat Power remains the additive sum of every local army.

## Simple economy

The Economy tab is a compact read-only overview of treasury, annualized tax income, annualized costs, net cashflow, food supply and the live annual economy-growth rate. The simulation still settles weekly, but player-facing recurring rates are shown per year for easier comparison. It uses one automatic country rate and one transparent tax identity:

```text
country tax rate = 10% + 10% × clamp(live wealth per person / $75K, 0, 1)

weekly tax = live owned population
  × population-weighted live wealth per person
  × country tax rate
  ÷ 52
```

The rate therefore stays between 10% and 20%: lower-income countries sit near 10%, while financially strong countries move toward 20%. It is automatic, not a player slider. The tax rate itself has no hidden war or condition modifier; the taxable population and output of an annexed territory use its visible integration share. Population is not a free GDP multiplier: if population rises while total production is unchanged, wealth per person falls and total taxable output stays unchanged. GDP grows only through the separate economy-growth system, reconstruction or conquest.

Real economic growth is recalculated every week instead of being fixed:

```text
annual economy growth = 0.3% base
  + productive investment as a share of live GDP × 0.22
  + Economy Growth research
  + a small full-food bonus
  − food-shortage drag
  − war and post-war growth drag
```

Productive investment is capped at a normalised 12% share for the growth calculation. The result is bounded between −6% and +4.5% per year. An active war removes at least 1.8 percentage points, with extra fronts and fatigue worsening the loss; recovery remains gradual after peace. Food production uses land, terrain, live condition, integration, research and the territory's current economic strength. India's agricultural territory has a modest 30% structural yield uplift. Domestic food is bought first; imports cover the remaining demand at a higher price. `100% incoming` means this week's needs are covered; production or imports above 100% become stored surplus. Food has a real national storage limit: population creates the base need while controlled landmass, wealth and Supply research add storage depth. The top bar shows `current / maximum` food and the annualized storage gain or loss. This makes reserves a real buffer instead of a constant countdown, while fragile countries still carry a much larger food cost. A rich, poor, populous, agricultural or food-insecure conquest changes the combined economy and food system in a different, visible way.

For steadier long campaigns, each World Bank population-growth starting value is moved exactly halfway toward 1% annual growth:

```text
balanced growth = 1% + 0.5 × (source growth − 1%)
```

This raises the lowest figures, lowers the highest figures and preserves the complete country ordering. The adjustment happens once when game content is built and adds no work to weekly simulation.

The Super AI manages one treasury and three priorities:

- **Armed Forces** pays army upkeep, wartime operations and recruitment.
- **Research** funds the six Development programs.
- **National Economy** supports repair, economic growth and population growth.

Food remains the first required weekly cost. When reserves fall below one week or food security becomes critical, the country may spend its positive cash reserve to close the emergency food gap. In peace, food shortage, population decline, exhausted reserves or debt place every AI in survival recovery: development and essential research take priority and optional wars stop. Low post-war condition by itself never authorises demobilisation; a solvent, fed country protects payroll and rebuilds toward a full army. A truly unaffordable force reduces gradually, never below the 45% ordinary crisis floor; only a severe food or debt disaster unlocks the 25% home guard. During war, each viable owned border army opens and pays for its own real front, so a multi-country empire can attack simultaneously from several territories. Every war still ends after one territory is conquered. Treasury may fall below zero; borrowing adds a premium and causes the AI to reduce discretionary spending until finances recover.

## Development

All six programs progress automatically at the same time. The national AI redistributes attention according to the country's current needs:

- **Population & Recruitment** — population growth or training speed.
- **Military Industry** — force capacity or cheaper recruitment.
- **Advanced Weapons** — ATK or territorial pressure.
- **Defensive Systems** — DEF or casualty reduction.
- **Logistics & Medicine** — replenishment or supply.
- **Economy & Science** — economic growth, research speed or research efficiency.

Every breakthrough adds a deterministic seeded +1% result from its branch. Requirements grow along the `(B + 1) × 1.18^B` mastery curve, so research can continue indefinitely while later improvements take longer.

## War and conquest

Wars are persistent operations resolved on a deterministic combat cadence. Every viable, source-unique army route becomes a real simultaneous front; all of those local armies fight, take losses, appear on the map and add operations cost. ATK, DEF, supply, condition, terrain, supporting armies and the defender's 25% position advantage all matter. Veteran bonuses are folded into the relevant soldiers' HP, ATK and DEF. A pulse applies its 0–5% damage rate to that army's maximum manpower at pulse start, capped by its remaining canonical manpower; veteran HP converts the same damage budget into fewer veteran headcount losses.

Conquest preserves the surviving population, economy and infrastructure as the territory's full long-term potential. A foreign owner receives exactly 10% of its population capacity, taxable output, food production and army capacity immediately; the remaining 90% unlocks smoothly over a deterministic 10–20 year calendar based on baseline population, GDP and land area. Recapturing a territory by its original country restores full integration. No enemy army is inherited. Two percent of the surviving attacking manpower crosses as the initial occupation force, limited by the newly unlocked local cap; its veteran share and experience are preserved proportionally. Final capitulation may transfer up to 25% of the defeated treasury.

Rival expansion is deliberately restrained:

- normal AI war starts have a 52-week global cooldown;
- regional escalations also have a 52-week cooldown;
- defensive interventions have a 26-week cooldown;
- the global active-war cap grows only from 2 to 4;
- an ordinary country may have at most one active war;
- only a major power after week 260 may sustain two;
- normal expansion targets peaceful ordinary countries, avoiding states already caught in another war.

Expansion-driven suspicion can still create permanent defensive federations, but coalition recruitment cannot begin before year three, adds at most one member per year and needs five aligned members before loose containment activates. Permanent federation waves are separated by at least four to six years depending on threat. These systems do not bypass treasury, access, combat or global war limits.

## Controls

- Choose a country from the power-ranked campaign screen.
- The campaign advances automatically at one week per real second.
- Click a country for intelligence or an opening-front forecast.
- Scroll to zoom, drag to pan and press `Esc` to close the current panel.
- War, Nation, Progress and Economy use desktop drawers and preserve their scroll positions during weekly updates. War targets show food coverage, food-stock trend, GDP and population before the player commits. Conquest does not open a blocking report: gained economy, cash, population, food land and capacity travel subtly from the captured country to their matching top-bar metric.

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

The deterministic TypeScript simulation, AI, persistence and map content remain isolated from Phaser rendering and the DOM HUD. Canonical saves use **schema 17** and rules version **v2.52**. Authenticated schema-13 through schema-16 saves migrate deterministically; schema-16 single fronts become front arrays, prior conquests are grandfathered at their already-reduced values, and the former combined Denmark/Greenland state is split without changing its owner or totals. Incompatible rules versions are rejected. Manual Research Surge and Propaganda costs also use discounted opening-country quotes and rise only after successful uses (30% and 35% respectively). The Progress drawer lists every active empire-wide upgrade level as well as the next milestones.

```bash
pnpm test
pnpm build
```
