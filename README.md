# EONSCAR

EONSCAR is a deterministic real-time strategy game played on a true political world map. You build an account-wide roster of nations, develop EONSCAR across campaigns and fight a Rogue intelligence that has destabilised the world.

The game is desktop-first. Its 166 playable countries use one shared simulation for finance, research, direct Army recruitment, logistics, recovery and war. Combat Power is the primary military stat; manpower, ATK, DEF, terrain and supply explain where that Power comes from. The world advances at one simulated day per real second at normal speed; existing operation lengths keep their real-time cadence, so an old eight-week quote is now shown as eight days.

## Game modes

- **Campaign** is the main progression mode and is always single-player. Choose one unlocked nation, expand through nearby land and limited authored sea routes, complete Signal Purges and eventually confront the Rogue intelligence. Defeating an ordinary nation in a Campaign war permanently unlocks it for every mode; every new timeline still starts its rivals from the authored world balance.
- **Survival** starts in a later terminal timeline. Your unlocked roster forms one empire against a permanent Rogue invasion, every roster member contributes its own military mastery, and every player-owned roster territory deploys at **100% of its resulting live Army Capacity**. The Rogue initially owns only Antarctica. Every ordinary sovereign keeps its full population, economy, resources, Army Capacity and opening Army; the machine must physically conquer the world instead of receiving it at setup. Permanent war duration itself adds no extra penalty; losses and recovery are already physical.
- **Alternative Universe** is an intentionally unpredictable, deterministic fun mode with regenerated national statistics. It grants no account progression.

Campaign never opens a lobby or adds human co-commanders. Multiplayer remains available only for Survival and Alternative Universe, as a separate deployment choice for those modes.

## EONSCAR and the Campaign opening

EONSCAR is the account-wide allied intelligence and projects one non-territorial neural dome. A fresh timeline begins with **2,000 Energy at 100%** and strong national Army ATK/DEF support. The online dome attempts to absorb **75%** of incoming post-DEF Army damage, limited by its live Energy and per-hit Energy budget; anything it cannot absorb reaches the real Army. Energy is EONSCAR's shield HP: the dome collapses at 0%, recharges at a safe Empire node and returns only when fully restored. Its separate **Backup Energy** can support that safe recovery and is not a military reserve pool. Human EONSCAR never supplies soldiers, deals standalone personnel damage, reflects casualties, contributes national manpower, owns territory or acts as an extra army. EONSCAR shares the selected empire's logistics, adds a small income contribution and has no private upkeep economy. It autonomously reinforces the highest-impact legal front; the player chooses wars and has no manual movement controls.

On the map, EONSCAR is represented as one Empire-wide digital neural shield rather than a robot, moving unit or separate country marker. The shared network concentrates visibly over active fronts without requiring manual movement.

Campaign now opens directly into command. War and Research are available immediately, the former attack lock is gone and the temporary tutorial-message sequence is disabled. Story-critical transmissions remain part of the campaign, but they no longer hold basic controls hostage. Mobilisation, battles and other existing operation timers keep the same real-time cadence while their labels use days.

The ordinary map stays visible after the signal. Remote ordinary land keeps its authored terrain under only a static `0.12` relevance veil, while owned land, reachable/frontier targets, active fronts and the EONSCAR route remain visually clear. There is no global night treatment or moving cloud fade. Only dormant Rogue Antarctica retains real static mist in Campaign until the machine starts mobilising; Survival begins with the Rogue already awake.

## Account progression

Progression is stored in a shared local account and applies across eligible modes:

- Greenland is the starter nation. Every other ordinary nation unlocks permanently when it is defeated in a standard Campaign war; no price, purchase or completed Signal Purge is required. Survival and Alternative Universe never unlock nations.
- EONSCAR progression has no authored level endpoint and grants one free talent point every level. Its branching neural-grid paths specialise Shield Energy, interception, recharge, projection and one national-Army support path; concentration gates make deep capstones a deliberate build choice. **Overdrive Shield** makes every third supported offensive battle more Energy-efficient without dealing its own damage. EONSCAR talents strengthen or distribute the Empire's shield and real Army rather than creating a second source of casualties. All fronts drain one shared Shield Energy pool. Every talent remains repeatable beyond its authored milestones on an endless diminishing tail, while one named specialization applies account-wide.
- Each unlocked country earns its own strength-scaled mastery XP. Every level passively adds `+0.25%` live Army Capacity and grants one free specialization point. Eight military tracks cover Force, Firepower, Defense, Recruitment, Land Logistics, Expeditionary, Military Industry and Field Medicine. Force adds another exact `+1%` live Army Capacity per invested point; the remaining tracks cover ATK, DEF, direct peacetime recruitment, land and naval logistics, military cost and casualties. Respec is free, and every current/next effect is shown exactly.
- Country traits and paid nation upgrades are retired. Campaign uses the selected country's mastery; Survival also applies each roster member's own mastery to its original territory contribution.
- Surrender is a normal end-of-run settlement and grants the same earned reward calculation as ending the run through play.
- Alternative Universe grants no EONSCAR XP, mastery XP or country unlock progress.
- A Survival deployment costs **50 Credits per human seat**. Campaign is the repeatable source of Credits; Survival grants **zero Credits**. Its XP, mastery XP and score come only from destroying verified Antarctic-origin Rogue personnel and from the first currently-held capture of each Antarctic sector or core objective. Ordinary-country battles and captures, wave launch events and unverified placeholder forces grant nothing.

Deployment follows **Nation → Mission → Deploy**. Owned nations are listed first, followed by locked Campaign targets. The strongest owned nation is selected by default. The Nation Arsenal uses the same groups and shows exact current and next progression values.

## War, logistics and conquest

Wars are persistent operations with exactly one canonical front for each opposing country pair; a third country entering the fighting creates a second front. Nearby land borders are the strategic default. Long naval crossings remain possible through authored access routes, but distance lowers movement and supply throughput and raises operations cost. This makes a foothold on a new continent valuable instead of allowing armies to jump freely across the world.

The player-facing military model is compact:

- **Local Threat** identifies the strongest plausible nearby hostile country from legal access, distance, relative Power, nearby expansion and current war state. It is active from the beginning of a Campaign; new wars are no longer locked behind the retired guided intro.
- **Army Readiness** is the real deployed Army divided by its live capacity. Battle losses are replaced directly in local active armies through ordinary funded peacetime recruitment.
- **War Supply** is the share of active front demand that the Empire actually delivers. It reads 0% outside war and 100% only when every active front is fully supplied. Each land attack can field 20% of source Army Capacity; naval attacks can field 10%. Active wars are supplied first and peaceful borders divide remaining protection evenly.
- **Rogue Attention** appears only after EONSCAR has revealed that threat through the story.

Political suspicion, propaganda, containment coalitions, defensive federations and revolt are not active gameplay systems. Signal Purge is stable in-run integration progress: it has no hidden uprising chance, rebel force or rollback, and it does not gate account unlocks. Each endpoint has one immutable 1–6 year duration. EONSCAR presence delivers `3×` purge work, every supplied active front processes its own territory in parallel at `1×`, and an ordinary rear or remote focus advances at a deterministic 50% rate. A front never has to clear before progress can begin.

Every national AI uses the same deterministic planner. It manages one treasury, direct Army recruitment, research and recovery. At peace, funded recruitment fills free capacity directly in active local armies; during any active war, fresh recruitment is exactly zero for every participant. The trained-reserve pool and its mobilization/UI are retired, and its save-compatible field is always normalized to zero. EONSCAR uses the same empire treasury target, and excess funds are reinvested through the normal national systems. Its frozen network support may improve funded peacetime recruitment, but EONSCAR itself never creates or stores personnel and never bypasses active capacity or real supply.

## Rogue Antarctica

Antarctica is divided into machine-controlled regions with ordinary territory, armies, borders, logistics and supply. Its core remains the strongest machine state; the outer ring is weaker than the centre but now strong enough to survive contact and support an actual breakout. Campaign access corridors open gradually in a seeded random order; the late Survival timeline begins with the Rogue awake and all three exits operational. In Survival, Rogue reinforcement runs occur exactly once every **52 days**. **Every wave from wave one onward manufactures provenance-tagged personnel equal to exactly 5% of the Rogue's live active Army at launch**, without deducting from existing formations. The new force is divided across the three Antarctic gateways, then follows visible physical logistics through different sensible corridors toward viable human fronts. It never teleports to combat, and only casualties from these verified Antarctic-origin troops can produce unit rewards.

At the Survival opening, Canada, Denmark, Finland, Greenland, Iceland, Norway, Russia, Sweden and the United States belong directly to the player's Empire instead of forming a separate Dawnline alliance. An unlocked Arctic country contributes its full live power and Country Mastery. A locked Arctic country still provides its full economy and population, but only a **50% Army Capacity Base Packet**, half its opening treasury contribution and no mastery. In co-op, every unselected Arctic Base Packet belongs to the host. The Rogue opening is dynamically calibrated against this real player-side Arctic base, with an additional bounded allowance for mastery, so Antarctica begins as the stronger side without pre-owning the ordinary world.

Every other ordinary sovereign remains independent and uses the normal economy, population, resources, capacity and peaceful recruitment systems. Systemic ordinary-AI wars and ordinary-AI declarations against humans are suppressed in Survival, but the human may still declare an otherwise legal war on an independent ordinary country. When the Rogue captures ordinary land, ownership changes through the normal territorial system and the territory keeps using the full simulation. Its visible Rogue assimilation advances at **4× the ordinary integration rate**—fast, but never instant—and creates no units or progression reward. One permanent player-versus-Rogue conflict may expose at most **two decisive physical axes** at once; empty or stalled axes rotate instead of leaving zero-Power fronts alive. Rogue PRIME remains the hostile exception that can deal its own bounded direct digital attack. The run ends when the Rogue intelligence is defeated or the player's empire is eliminated.

When any country is at war, non-fighting territories reinforce live fronts by need and viable route; land and naval deficits are both served rather than permanently binding a donor to the closest front. A safe donor normally keeps a home garrison equal to **10% of its live local Army Capacity**. If a front is clearly losing, that final tenth is released only in small weekly emergency steps. Movement conserves personnel and wartime recruitment remains zero.

## Research and economy

Research uses a desktop-first **Strategic Matrix** with five categories running in parallel: People, Army, Combat, Sustainment and State. Every category has three authored directions and exactly one active direction; completed levels apply their exact permanent effect automatically and the next level starts without pausing. Each category receives 16% of the national research pool, keeping useful portfolio throughput at 80% so five simultaneous tracks do not become runaway power. Switching a direction preserves its branch progress, and costly National Initiatives remain an optional directed push. The panel shows the complete GDP → funded R&D → active portfolio chain, live national IQ and education upside; target review projects the GDP, purge cost and IQ/R&D impact of expansion before an operation starts. The fourteen-stage North Pole sequence stays in the same Research surface as the strategic endgame track.

The economy uses one shared national treasury. Base country operations cost **30% of tax revenue** before discretionary programmes. The Economy view leads with Treasury, annualised income, costs and net cashflow, followed by growth. Countries automatically build a liquid Treasury reserve target, pay essential costs first, and spend surplus above target through recruitment, recovery, research and development. This cash reserve is unrelated to the retired military trained-reserve system. Treasury may enter debt, which constrains new wars and discretionary spending.

## Multiplayer

Campaign is excluded from multiplayer. Public matchmaking can search for a compatible Survival or Alternative Universe co-op lobby, and Direct Connect remains available for private games in those two modes. Each seat freezes its own Country Mastery, EONSCAR shield build and specialization at deployment. Human territory provides bounded friendly logistics through authored routes without sharing ownership or control; no route may cross neutral or ordinary AI land. At most one real ally contingent supports each side of a battle pulse, and its manpower, supply, treasury cost and casualties stay with the contributing seat. Human countries cannot declare war on each other, separate EONSCAR networks cannot occupy the same projection node, and the run ends only after every human country is eliminated. The authoritative snapshot also preserves each active war's EONSCAR support, integrity, energy and capstone history, so reconnecting cannot reset the final report.

The host owns the shared clock and validates globally ordered commands. Guests replay authoritative ticks, compare canonical checkpoints and request a full snapshot when needed. Reconnect credentials reclaim the exact reserved seat, country and frozen build before synchronising to the host's latest state. Only the host changes shared speed.

Browser connections use WebRTC data channels with STUN and no TURN relay, so restrictive networks can still prevent a direct route.

## Controls

- Select a country to inspect its Power, economy, population, army, supply, terrain and legal actions.
- Use War for active fronts, best targets, Power forecasts, supply, EONSCAR contribution and deterministic war outcomes.
- Use Nation, Research and Economy for the corresponding compact national views.
- The permanent Combined Power tile splits Empire and EONSCAR contribution and pairs the total with a visible **`x% ARMY READY`** value derived only from deployed Army versus live capacity.
- The permanent War Supply tile shows how completely active wars are being fed; click it to inspect the individual fronts.
- Scroll to zoom, drag to rotate or pan, and press `Esc` to close the active panel.
- Active land wars use warm contact lines; naval wars use cool dashed routes. Neutral internal borders stay subtly visible, while dangerous frontiers and Rogue territory receive distinct warnings.

## Start

```bash
pnpm install
pnpm dev
```

Open the local address printed by Vite. The configured preview currently uses `http://127.0.0.1:4174/`.

## Data baseline

- Borders: [Natural Earth Admin 0 Countries, 1:50m](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/)
- Population, growth, mortality and GDP: [World Bank](https://data.worldbank.org/)
- Tax revenue: [IMF World Revenue Longitudinal Database](https://data.imf.org/Datasets/WORLD)
- Military expenditure: [SIPRI](https://www.sipri.org/)

The starting Power index is a gameplay score based on these datasets, not a political or moral judgement. Live population, economy, borders and military strength then evolve through the simulation.

The browser client uses [Phaser](https://github.com/phaserjs/phaser) and [flag-icons](https://github.com/lipis/flag-icons). Their own licenses remain applicable. No license is granted for EONSCAR itself unless a repository license is added explicitly.

## Architecture and verification

The deterministic TypeScript simulation, AI, persistence and multiplayer protocol are isolated from rendering and the DOM HUD. Canonical saves use schema 22 and rules version `frontier-command-v2.82-attack-tempo`. Supported authenticated migrations preserve deterministic hashes, in-progress research and every existing deadline while moving the visible calendar from weeks to days.

Development runs the full invariant boundary every tick. Production schedules the same full scan and forces it on terminal paths. Map presentation caches peaceful statistics, uses bounded active-operation animation and keeps polar simulation constant-size so rapid Rogue expansion does not multiply rendering or simulation work.

```bash
pnpm test
pnpm build
```
