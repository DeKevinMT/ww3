# APEX: RECLAMATION

APEX: RECLAMATION is a deterministic real-time strategy game played on a true political world map. You build an account-wide roster of nations, develop APEX across campaigns and fight a Rogue intelligence that has destabilised the world.

The game is desktop-first. Its 166 playable countries use one shared simulation for finance, research, recruitment, reserves, logistics, recovery and war. Combat Power is the primary military stat; manpower, ATK, DEF, terrain and supply explain where that Power comes from. The world advances at one simulated week per real second at normal speed.

## Game modes

- **Campaign** is the main progression mode. Choose one unlocked nation, expand through nearby land and limited authored sea routes, complete Signal Purges and eventually confront the Rogue intelligence. Defeating an ordinary nation in a Campaign war permanently unlocks it for every mode; every new timeline still starts its rivals from the authored world balance.
- **Survival** starts in a later terminal timeline. Your unlocked roster forms one empire against a permanent Rogue invasion, and every roster member contributes its own military mastery. Permanent war duration itself adds no extra penalty; losses and recovery are already physical.
- **Alternative Universe** is an intentionally unpredictable, deterministic fun mode with regenerated national statistics. It grants no account progression.

Solo and multiplayer use the same modes. Multiplayer is one toggle in deployment rather than a separate game flow.

## APEX and the Campaign opening

APEX is the account-wide allied intelligence and projects one non-territorial neural dome. A fresh timeline begins at **100% Shield Integrity** with **125 DOME ATK / 125 DOME DEF**, about **100 DOME POWER** while operational and a separate energy reserve for strikes, interception and projection. Integrity is APEX's HP: the dome collapses at 0%, recharges at a safe Empire node and returns only when fully restored. It never supplies soldiers, national manpower, territory or an extra army. APEX shares the selected empire's logistics, adds a small income contribution and has no private upkeep economy. It autonomously prioritises the highest-impact legal front; the player chooses wars and has no manual movement controls.

On the map, APEX is represented as one Empire-wide digital neural shield rather than a robot, moving unit or separate country marker. The shared network concentrates visibly over active fronts without requiring manual movement.

Campaign opens with six quiet weeks before APEX introduces the mandatory first objective. Accepting it opens Research and atomically starts **Signal Triangulation** for **$10M** over **13 weeks**. Stage I confirms a hostile coordination signal and unlocks war. One measured proof conflict follows 6–8 weeks later, APEX observes it for two weeks, and transmissions remain at least two weeks apart. The guided first war then uses four weeks of mobilisation and weekly battle pulses; later wars return to the ordinary eight-week mobilisation and two-week pulse cadence.

The ordinary map stays visible after the signal. Remote ordinary land keeps its authored terrain under only a static `0.12` relevance veil, while owned land, reachable/frontier targets, active fronts and the APEX route remain visually clear. There is no global night treatment or moving cloud fade. Only dormant Rogue Antarctica retains real static mist in Campaign until the machine starts mobilising; Survival begins with the Rogue already awake.

## Account progression

Progression is stored in a shared local account and applies across eligible modes:

- Greenland is the starter nation. Every other ordinary nation unlocks permanently when it is defeated in a standard Campaign war; no price, purchase or completed Signal Purge is required. Survival and Alternative Universe never unlock nations.
- APEX progression has no authored level endpoint and grants one free talent point every level. Its branching neural-grid paths specialise integrity, attack, interception, recharge and projection; concentration gates make deep capstones a deliberate build choice. **Singularity Pulse** overdrives DOME ATK by 60% on every third supported offensive battle, **Mirror Matrix** returns 20% of damage actually intercepted by the shield as a bounded counterpulse, and **Omnipresence Grid** starts with 100% projection at one front, adds 25% shared budget per additional front up to 150%, then divides that one budget evenly across every active front. All fronts drain one shared Shield Integrity and energy pool. Every talent remains repeatable beyond its authored milestones on an endless diminishing tail, while one named specialization applies account-wide.
- Each unlocked country earns its own strength-scaled mastery XP and one free point per mastery level. Eight military tracks cover Force, Firepower, Defense, Mobilization, Land Logistics, Expeditionary, Military Industry and Field Medicine. Force adds exactly `+1%` live Army Capacity per point; the remaining tracks cover ATK, DEF, recruitment and reserves, land and naval logistics, military cost and casualties. Respec is free, and every current/next effect is shown exactly.
- Country traits and paid nation upgrades are retired. Campaign uses the selected country's mastery; Survival also applies each roster member's own mastery to its original territory contribution.
- Surrender is a normal end-of-run settlement and grants the same earned reward calculation as ending the run through play.
- Alternative Universe grants no APEX XP, mastery XP or country unlock progress.

Deployment follows **Nation → Mission → Deploy**. Owned nations are listed first, followed by locked Campaign targets. The strongest owned nation is selected by default. The Nation Arsenal uses the same groups and shows exact current and next progression values.

## War, logistics and conquest

Wars are persistent operations with exactly one canonical front for each opposing country pair; a third country entering the fighting creates a second front. Nearby land borders are the strategic default. Long naval crossings remain possible through authored access routes, but distance lowers movement and supply throughput and raises operations cost. This makes a foothold on a new continent valuable instead of allowing armies to jump freely across the world.

The player-facing military model is compact:

- **Local Threat** identifies the strongest plausible nearby hostile country from legal access, distance, relative Power, nearby expansion and current war state. Before Campaign Signal Triangulation completes, hostile threat against the player is zero and new wars are locked.
- **Army Readiness** reflects the real deployed force and trained reserves. Battle losses must be replaced through the ordinary funded recovery systems.
- **War Supply** is the share of active front demand that the Empire actually delivers. It reads 0% outside war and 100% only when every active front is fully supplied. Land movement uses a fixed share of Army Capacity; naval movement receives exactly half that throughput. Active wars are supplied first and peaceful borders divide remaining protection evenly.
- **Rogue Attention** appears only after APEX has revealed that threat through the story.

Political suspicion, propaganda, containment coalitions, defensive federations and revolt are not active gameplay systems. Signal Purge is stable in-run integration progress: it has no hidden uprising chance, rebel force or rollback, and it does not gate account unlocks. Each endpoint has one immutable 1–6 year duration. APEX presence delivers `3×` purge work, every supplied active front processes its own territory in parallel at `1×`, and an ordinary rear or remote focus advances at a deterministic 50% rate. A front never has to clear before progress can begin.

Every national AI uses the same deterministic planner. It manages one treasury, recruitment, reserve training, research and recovery. Reserve training continues alongside ordinary recruitment at a slower passive rate. APEX uses the same empire treasury target, and excess funds are reinvested through the normal national systems. Its frozen network-support snapshot may improve funded national training rates, but APEX itself never creates, stores or replaces personnel and never bypasses active capacity, the finite reserve cap or real supply.

## Rogue Antarctica

Antarctica is divided into machine-controlled regions with ordinary territory, armies, borders, logistics and supply. Its core is the strongest machine state; outer regions are weaker. Access corridors open gradually in a seeded random order, and incoming forces travel through visible, slower logistics instead of appearing instantly.

In Survival, ordinary countries begin weakened and may be taken over as Rogue supply territory. Those occupied countries do not produce replacement armies for the Rogue intelligence; real reinforcements must arrive from Antarctica. Only verified forces supplied after launch contribute to Survival score and rewards. The campaign ends when the Rogue intelligence is defeated or the player's empire is eliminated.

## Research and economy

Research contains ten ordinary Development branches plus a fourteen-stage North Pole sequence. Signal Triangulation remains a tiny **$10M**, 13-week story gate; later costs rise smoothly through **$40M, $120M, $300M, $700M, $1.5B, $3B, $5B, $12B, $25B, $50B, $110B, $240B and $500B**. Its original total research, logistics, purge, recovery and anti-Rogue power is distributed across those smaller milestones rather than arriving in four oversized jumps. Ordinary research continues through the national planner. North Pole projects stay inside the same compact Research surface rather than opening a separate command screen.

The economy uses one shared national treasury. The Economy view leads with Treasury, annualised income, costs and net cashflow, followed by growth. Countries automatically build a reserve target, pay essential costs first, and spend surplus above target through recruitment, recovery, research and development. Treasury may enter debt, which constrains new wars and discretionary spending.

## Multiplayer

Public matchmaking uses the selected nation and mission, then searches for a compatible co-op lobby. Direct Connect remains available for private games. Each seat freezes its own Country Mastery, APEX shield build and specialization at deployment. Human territory provides bounded friendly logistics through authored routes without sharing ownership or control; no route may cross neutral or ordinary AI land. At most one real ally contingent supports each side of a battle pulse, and its manpower, supply, treasury cost and casualties stay with the contributing seat. Human countries cannot declare war on each other, separate APEX networks cannot occupy the same projection node, and the run ends only after every human country is eliminated. The authoritative snapshot also preserves each active war's APEX support, integrity, energy and capstone history, so reconnecting cannot reset the final report.

The host owns the shared clock and validates globally ordered commands. Guests replay authoritative ticks, compare canonical checkpoints and request a full snapshot when needed. Reconnect credentials reclaim the exact reserved seat, country and frozen build before synchronising to the host's latest state. Only the host changes shared speed.

Browser connections use WebRTC data channels with STUN and no TURN relay, so restrictive networks can still prevent a direct route.

## Controls

- Select a country to inspect its Power, economy, population, army, supply, terrain and legal actions.
- Use War for active fronts, best targets, Power forecasts, supply, APEX contribution and deterministic war outcomes.
- Use Nation, Research and Economy for the corresponding compact national views.
- The permanent Combined Power tile splits Empire and APEX contribution and pairs the total with a visible **`x% ARMY READY`** value plus trained reserves.
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

The browser client uses [Phaser](https://github.com/phaserjs/phaser) and [flag-icons](https://github.com/lipis/flag-icons). Their own licenses remain applicable. No license is granted for APEX: RECLAMATION itself unless a repository license is added explicitly.

## Architecture and verification

The deterministic TypeScript simulation, AI, persistence and multiplayer protocol are isolated from rendering and the DOM HUD. Canonical saves use schema 22 and rules version `frontier-command-v2.75-no-land-condition`. Supported authenticated migrations preserve deterministic hashes and safely retire obsolete revolt and propaganda compatibility state.

Development runs the full invariant boundary every tick. Production schedules the same full scan and forces it on terminal paths. Map presentation caches peaceful statistics, uses bounded active-operation animation and keeps polar simulation constant-size so rapid Rogue expansion does not multiply rendering or simulation work.

```bash
pnpm test
pnpm build
```
