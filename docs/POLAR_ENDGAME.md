# Polar endgame

Frontier Command v2.65 turns the poles into a complete late-game arc without adding countries to the ordinary world model. The Arctic is a manual preparation layer; Antarctica is a bounded deterministic campaign that becomes the final victory condition for a surviving human player.

## Player flow

1. Control at least one Arctic gateway country: Canada, Finland, Greenland, Iceland, Norway, Russia, Sweden or the United States.
2. Click the North Pole or open **Research → North Pole**.
3. Authorise four sequential projects. Each project freezes its quoted cost, pays it immediately and progresses alongside automatic national research.
4. Acknowledge the persistent Antarctic signal warning after the final project.
5. Choose one of three entry corridors and commit trained reserves.
6. First contact reveals the machine army, ends ordinary political wars and starts Earth Defence mobilisation.
7. Secure the directed sector network and destroy all three Zero Point Core phases.

The three corridors are:

- **Drake Passage** from the South American sea lane;
- **Queen Maud Route** from southern Africa;
- **Ross Sea Route** from Australia and New Zealand.

Only these gateways appear before first contact. Hidden sectors and their machine strength are not exposed early.

## Research rewards

| Project | Base duration | Base cost | Permanent rewards |
| --- | ---: | ---: | --- |
| Polar Habitat Genome | 156 weeks | $80B | +3 Population Growth, +2 Recovery |
| Cryogenic Logistics Grid | 260 weeks | $180B | +4 Supply, +3 Casualty Reduction, +2 Research Efficiency |
| Strategic Mobilisation Vaults | 416 weeks | $385B | +4 Force Capacity, +3 Reserve Training, +3 Reserve Mobilisation |
| Deep-Ice Signal Array | 780 weeks | $760B | +2 Attack, +3 Defence, +2 Research Speed; reveal Antarctica |

The frozen price quote is base cost × original-country military-rank factor × Arctic affinity. The opening-rank factor is scenario-aware and decreases smoothly from ×10.00 for the strongest starter to ×0.50 for the weakest. It never changes after conquest. Greenland, Iceland, Norway, Canada, Finland, Sweden and Russia receive identity discounts of 12.5%, 35%, 30%, 25%, 22%, 18% and 12%; the United States pays a 15% affinity premium; other identities are neutral. Current empire economy has no Arctic price effect.

One live-owned Arctic gateway uses the base duration. Every additional gateway reduces duration by five percentage points, up to 35% with all eight gateways. The existing research-speed reduction then applies multiplicatively, capped at 18%. A started project's paid cost and start-to-completion duration remain frozen even if ownership or research changes later.

## Campaign topology

The campaign uses nine fixed sectors:

```text
Drake Entry ─┐
Maud Entry  ─┼─> 3 outer installations ─> 2 inner strongholds ─> Zero Point Core
Ross Entry   ─┘                                                        × 3 phases
```

Every deployment consumes real trained reserves. One expedition per player can be active at a time. Combat resolves every four weeks with deterministic, sector-specific rolls. The expedition's remaining personnel return to the reserve pool when it ends, bounded by the current reserve capacity. Depth, campaign wave and the core phase increase opposition strength.

## Earth Defence rules

First contact is a global rules transition:

- active ordinary wars and alliance offers are cleared;
- AI countries stop planning interstate wars;
- defence members join over time and contribute to a shared counteroffensive;
- lagging member research receives bounded catch-up transfers;
- the coalition can weaken and eventually secure non-core sectors;
- high Suspicion slows trust, recruitment and coalition damage.

Suspicion is never simply disabled. It remains the memory of the player's earlier expansion and initially makes Earth unity harder. Direct robot damage and sector victories earn Suspicion relief, allowing a formerly feared player to rebuild legitimacy through the Antarctic war.

## Determinism, saves and multiplayer

- Polar state is canonical, validated and included in schema-22 saves.
- Authenticated v2.64 saves are verified before receiving an initial dormant polar state.
- New commands are validated by the authoritative multiplayer host and are restricted to the sender's assigned country.
- Polar combat derives its variation from stable hashes and never advances the ordinary world RNG.
- The state has a fixed project list, nine sectors and at most one expedition per player, keeping weekly work bounded.

## Rendering and performance

- Close zoom uses one reusable line-segment mesh for Natural Earth coast and border detail.
- Ownership recolours update existing GPU buffers when their size is unchanged.
- All nine Antarctic sector markers share one instanced mesh and update only when the polar visual revision changes.
- Polar camera focus no longer forces the globe into continuous 60 FPS rendering; idle presentation returns to the normal low-rate loop.
- Antarctica uses irregular ice facets, glacier flow and fractures in the existing texture atlas rather than runtime geometry subdivision.
- The Drake Passage corridor uses a seaward route so it does not cross South American land.

## Verification focus

The automated suite covers project sequencing and payment, rewards, the warning transition, corridor access, reserve debits and returns, deterministic combat, Suspicion relief, the sector graph, three boss phases, save migration, multiplayer protocol and authorisation, map routing and UI accessibility. The browser smoke test additionally covers desktop and mobile top bars, the Research gateway, confirmation flow, progress display and polar camera handoff.
