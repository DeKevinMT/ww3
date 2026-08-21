# Frontier Command

Frontier Command is a real-time world-conquest game on a true political world map. In 2026, the country you choose activates the world's first **Super AI**. You choose war targets; it continuously manages finance, development, recruitment, recovery and military operations. Rival countries use deterministic AI under the same core rules.

The game is designed for desktop. The map contains 166 strategically useful countries; microstates and very small islands are omitted to keep the campaign readable and fast. Greenland is an explicit playable exception with its own territory, flag, economy and Arctic sea routes. The strategic map keeps the current top ten powers legible, uses sharp vector flags and supports deep zoom up to 24× so compact countries such as Luxembourg remain practical to inspect and select.

## The core military model

**Manpower** is the complete deployed army and its normal combat-health pool. Every territory army stores:

- total manpower;
- its current population-, integration- and research-based capacity;
- the manpower-weighted base ATK and DEF carried by that local army.

**Combat Experience** is one non-negative institutional score shared by the complete country or empire. Every country starts at zero; country selection grants no opening military bonus. Experience is earned only once when a real war with at least one battle ends. Duration, battle count, cumulative losses and the campaign power ratio determine the difficulty-scaled gain. Its square-root score improves the empire's entire army with bounded diminishing returns:

```text
combat score = sqrt(Combat Experience)
ATK bonus = min(20%, 1% × combat score)
DEF bonus = min(20%, 1% × combat score)
casualty reduction = min(15%, 0.75% × combat score)
```

Local ATK/DEF quality remains additive: `manpower × base quality` is conserved when armies mix. Moving, recruiting or taking casualties cannot manufacture experience, while a completed real war teaches the whole surviving institution instead of tagging a special soldier subset.

Army capacity is intentionally simple and cannot be permanently damaged by budget trouble or a temporary crisis. Newly conquered land unlocks its population reserve gradually through its visible integration share:

```text
territory army capacity = live population × integration × 0.00145
  × (1 + Force Capacity research × 0.01)
```

Capacity automatically synchronises with live population, integration and research. Recruitment fills available national capacity; it does not purchase more capacity. A healthy AI keeps recruiting toward 100% readiness, including after a war. Demobilisation is forbidden in ordinary recovery and permitted only during an extreme food or debt emergency that also makes payroll genuinely unaffordable; even then at most 0.05% of deployed manpower leaves per week, so army size never changes abruptly. A conquered frontier starts at exactly 10% of its native local cap. Its fixed size curve takes 12.5 years for Luxembourg, about 25.5 for Belgium and about 170 for China. Imperial logistics may slowly reinforce a territory up to 200% of its current local cap, but never creates personnel or bypasses the empire's free national recruitment capacity. A pre-existing overshoot is never deleted: normal weekly logistics gradually moves its excess to another owned territory with room, or leaves it in place until real attrition if no such room exists. Rapid Recruitment can fill at most 5% of live capacity and then has a 104-week cooldown. Its first price is fixed from the chosen country's opening army and discounted by 15%; every successful use raises only the next quote by 25%, so conquest or temporary GDP changes cannot reprice the button. Troops may redistribute through owned territory without any treasury charge or separate logistics cost.

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

Food remains the first required weekly cost. When reserves fall below one week or food security becomes critical, the country may spend its positive cash reserve to close the emergency food gap. In peace, food shortage, population decline, exhausted reserves or debt place every AI in survival recovery: development and essential research take priority and optional wars stop. Low post-war condition or an ordinary deficit never authorises demobilisation; a solvent, fed country protects payroll and rebuilds toward a full army. Only an extreme combined survival and affordability crisis permits the 0.05%-per-week drawdown. During war, every viable source-unique owned army opens and pays for its own real front, so a multi-country empire can attack simultaneously from several territories. A campaign continues across the enemy's remaining territories until peace, withdrawal or capitulation. Treasury may fall below zero; borrowing adds a premium and causes the AI to reduce discretionary spending until finances recover.

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

Wars are persistent operations resolved on a deterministic combat cadence. Every viable, source-unique army route becomes a real simultaneous front; all of those local armies fight, take losses, appear on the map and add operations cost. ATK, DEF, supply, condition, terrain, supporting armies, Combat Experience and the defender's 25% position advantage all matter. Naval fronts cost 35% more to operate and receive only modest supply friction; they have no separate assault or casualty penalty. Combat uses the gentler 1.6% base casualty rate and no local formation can lose more than 5% of its supported maximum manpower in one battle pulse. That ceiling does not shield a depleted final remnant, preventing last-percent stalemates.

Conquest preserves the surviving population, economy and infrastructure as the territory's full long-term potential. A foreign owner receives exactly 10% of its population capacity, taxable output, food production and army capacity immediately. The remaining 90% unlocks smoothly on one immutable population/GDP/land-area curve: Luxembourg takes 12.5 years, Belgium about 25.5 and China about 170. The integrating country's former identity, flag and internal boundary remain subtly visible on the map. At completion its core identity disappears permanently and its land, statistics and land/naval routes become ordinary core territory of the owning country or empire. When the displaced sovereign or former core owns no other territory, its strongest Combat Experience and research knowledge also become part of the final empire without stacking duplicate bonuses. Recapturing a territory by its core owner restores full integration. No enemy army is inherited. A real occupation guard is drawn from the surviving attacking source: up to 10% of that army moves across, never beyond the territory's 2× local support ceiling, and remains protected from ordinary outbound logistics for 52 weeks. After that first year it can redistribute normally; it never disappears or becomes free manpower. Final capitulation may transfer up to 25% of the defeated treasury.

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

- Choose a country from the power-ranked country picker; selection opens the live map immediately, without an explainer or activation briefing.
- The campaign advances automatically at one week per real second.
- Click a country for intelligence or an opening-front forecast.
- Scroll to zoom as deep as 24×, drag to pan and press `Esc` to close the current panel. The top ten powers keep strategic labels while close zoom reveals compact countries and integration progress.
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

The deterministic TypeScript simulation, AI, persistence and map content remain isolated from Phaser rendering and the DOM HUD. Canonical saves use **schema 19** and rules version **v2.54**. Authenticated schema-13 through schema-18 saves migrate deterministically; schema-16 single fronts become front arrays, prior conquest progress is preserved, schema-18 active programs receive the shorter remaining calendar exactly once, and the former combined Denmark/Greenland state is split without changing its owner or totals. Incompatible rules versions are rejected. Manual Research Surge and Propaganda costs also use discounted opening-country quotes and rise only after successful uses (30% and 35% respectively). The Progress drawer lists every active empire-wide upgrade level as well as the next milestones.

```bash
pnpm test
pnpm build
```
