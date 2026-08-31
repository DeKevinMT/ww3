# Polar endgame

EONSCAR v2.65 turns the poles into a complete late-game arc without adding countries to the ordinary world model. The Arctic is a manual preparation layer; Antarctica is a bounded deterministic campaign that becomes the final victory condition for a surviving human player.

## Player flow

1. Control at least one Arctic gateway country: Canada, Finland, Greenland, Iceland, Norway, Russia, Sweden or the United States.
2. Click the North Pole or open **Research → North Pole**.
3. Authorise four sequential projects. Each project freezes its quoted cost, pays it immediately and progresses alongside automatic national research.
4. Acknowledge the persistent Antarctic signal warning after the final project.
5. Open one of three entry corridors and fight through it with the normal territorial army and logistics systems.
6. First contact reveals the machine army, suppresses new ordinary AI wars and shifts strategic initiative toward the Antarctic front.
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
| Strategic Mobilisation Vaults | 416 weeks | $385B | +4 Force Capacity, +3 Training, +3 Reinforcement Efficiency |
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

The standalone expedition system is retired. Antarctica now uses normal territories, active armies, supply routes and wars. Personnel remain in territorial armies; there is no secondary manpower pool or return step. Depth and the core phase increase opposition strength. In Survival, every annual mobilization from wave one onward manufactures provenance-tagged personnel equal to exactly 5% of the pre-wave live Rogue active Army and routes them from the three gateways.

## Survival opening and Arctic Base Packets

Survival begins with the Rogue awake and owning only Antarctica. All three Antarctic gateways are operational immediately. Player-roster territories deploy at 100% of their post-mastery live Army Capacity. Every ordinary sovereign outside the player's Arctic foundation retains its normal population, economy, resources and capacity and opens at 100% Army readiness.

Canada, Denmark, Finland, Greenland, Iceland, Norway, Russia, Sweden and the United States belong directly to the player's Empire as the Survival foundation. Unlocked countries contribute full live Army Capacity plus their Country Mastery. Locked countries contribute full economy and population, a 50% structural Army Capacity Base Packet, half their opening treasury contribution and no mastery. In co-op, each selected human country remains sovereign and every unselected Arctic Base Packet belongs to the host. The Rogue opening is calibrated to roughly 120% of the base Arctic benchmark plus a bounded mastery allowance.

Ordinary countries outside the Arctic foundation remain independent. Their systemic wars and declarations against humans are suppressed in Survival, but humans may still declare otherwise legal ordinary wars. Rogue conquest continues to use normal ownership, population, economy, production, integration and logistics in every ordinary territory. Visible Rogue assimilation advances at 4× the ordinary integration rate, but it is never instant and creates no personnel or progression reward.

Every 52 days, Antarctica manufactures provenance-tagged personnel equal to exactly 5% of its pre-wave live active Army and divides them across the three gateways, starting with the first wave. Existing formations are not drained. Wave launch itself grants no reward. Survival score and XP come only from defeating provenance-verified Antarctic-origin Rogue personnel and from unique currently-held Antarctic sector/core captures. Ordinary combat and captures grant zero Survival progression, and the mode always pays zero Credits after its 50-Credit-per-seat entry cost.

## Determinism, saves and multiplayer

- Polar state is canonical, validated and included in schema-22 saves.
- Authenticated v2.64 saves are verified before receiving an initial dormant polar state.
- New commands are validated by the authoritative multiplayer host and are restricted to the sender's assigned country.
- Polar combat derives its variation from stable hashes and never advances the ordinary world RNG.
- The state has a fixed project list, nine sectors and at most one expedition per player, keeping per-tick work bounded.

## Rendering and performance

- Close zoom uses one reusable line-segment mesh for Natural Earth coast and border detail.
- Ownership recolours update existing GPU buffers when their size is unchanged.
- All nine Antarctic sector markers share one instanced mesh and update only when the polar visual revision changes.
- Polar camera focus no longer forces the globe into continuous 60 FPS rendering; idle presentation returns to the normal low-rate loop.
- Antarctica uses irregular ice facets, glacier flow and fractures in the existing texture atlas rather than runtime geometry subdivision.
- The Drake Passage corridor uses a seaward route so it does not cross South American land.

## Verification focus

The automated suite covers project sequencing and payment, the warning transition, corridor access, territorial logistics, deterministic combat, the sector graph, Survival opening ownership and Army fill, Arctic Base Packet ownership and strength, 52-day wave commitment, provenance-gated rewards, multiplayer protocol and authorisation, map routing and UI accessibility. The browser smoke test additionally covers desktop and mobile top bars, the Research gateway, confirmation flow, progress display and polar camera handoff.
