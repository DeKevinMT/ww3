# Frontier Command v2.65 - Polar Endgame

## Headline

Version 2.65 adds the complete Arctic research and Antarctic rogue-AI endgame while preserving the deterministic simulation and bounded render workload.

## Endgame

- Four manual, sequential Arctic projects with frozen cost and duration quotes.
- Starter-rank pricing from 0.50x to 10.00x; Arctic affinity is the only other price modifier.
- Extra Arctic access points reduce project time, never price.
- A persistent warning opens three Antarctic approach corridors.
- Nine bounded sectors, deterministic four-week combat pulses and a three-phase central boss.
- Earth Defence ends ordinary interstate conflict, mobilises every surviving country and shares lagging research.
- Fighting the rogue AI lowers player Suspicion; destroying the core is the final victory condition.

## Strategy and balance

- Human opening-force recovery lasts 30 years; the United States begins at exactly 0.05x.
- The weakest 25 starts receive an additional competitive curve and the weakest ten reach up to 50x.
- Weak-country reserve floors are non-zero before multipliers are applied.
- Greenland has a deliberately restrained mobilisation identity, a separate 12.5% Arctic discount and extra opening reserves; its temporary weak-start force curve remains the main opening aid.
- Country traits were rebalanced toward distinctive military, economic or research identities; generic food traits are exceptional.
- Suspicion progressively raises APEX military priority before first contact. After first contact all countries prioritise Earth Defence regardless of Suspicion.
- Upkeep may be funded to 125% above the treasury reserve target to accelerate recruitment.

## Empire fusion

- National IQ is population-weighted by immutable population origin and live integration.
- Only the current empire leader's IQ trait applies, once; research is added after fusion.
- Nation demographics combines integration progress, population origin mix and current fusion impact.
- Attack Review previews full-core IQ, army-quality and GDP-per-person fusion before conquest; retained Economy and Population also show their signed percentage impact on the current empire.

## Map and logistics

- One sharp screen-space border system replaces overlapping border passes.
- Integration borders share that sharp geometry; terrain influence is stronger on land and borders.
- The camera allows closer zoom while nameplates stay compact at distance.
- Integrating territory labels show local defence; completed player territory labels retain a subtle power bar and number.
- Naval routes anchor on principal landmasses, permit long ocean crossings and reject paths that cut through third-party land.
- Routes beyond 5,000 km continue to become more expensive.
- War and internal logistics include real sea distance and a bounded physical-country-size load.
- AI prefers land and short sea routes, using very long routes more readily only when urgency and treasury justify them.

## Interface and audio

- A startup fullscreen recommendation explains both entry and exit controls.
- A two-second country-selection loader and longer map loader hide camera setup.
- Topbar cards include explanatory hover text, per-person economy trends, neutral IQ, reserves, military priority and treasury target fill.
- Sound options are available from the topbar; default music is 20%.
- Radio calls can overlap battle impacts on independent audio voices.
- Attack Review is shorter and keeps only decision-relevant cost, route, comparison and conquest information. Country selection no longer exposes Aggressiveness as a stat or sort option.
- The help panel now explains the complete game loop and polar endgame.

## Compatibility and performance

- Save schema 22 migrates authenticated v2.64 saves before injecting the dormant polar state.
- Multiplayer validates polar actions through the existing host-authoritative protocol.
- Polar simulation is constant-size and uses independent deterministic rolls.
- Borders use one draw call; Antarctic sector markers use one instanced mesh; peaceful map statistics remain staggered.
