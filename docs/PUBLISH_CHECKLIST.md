# v2.80 publish checklist

## Required gates

- [x] Complete Vitest suite passes: 227 files, 1,579 passed and 1 intentionally skipped test.
- [x] TypeScript, matchmaker TypeScript and Vite production build pass.
- [x] `git diff --check` has no errors.
- [x] Release commit is based on the current remote `main` without overwriting remote history.
- [ ] GitHub Pages workflow completes successfully.
- [ ] Published page loads its versioned JavaScript, CSS, map data and audio assets.
- [ ] Published UI reports `v2.80` and opens the country picker.
- [ ] Production matchmaker health endpoint responds successfully.

## Manual smoke test

- [x] A country can be selected and the map opens centred after the loader.
- [x] No temporary tutorial overlay appears; War and Research are available immediately.
- [x] The calendar advances one day per normal-speed second and existing operation lengths do not take longer in real time.
- [x] Topbar Economy, Population, Army readiness, EONSCAR Energy, live war supply and active Research focus render clearly.
- [x] Empire Blueprint can select a focus, preserve other branch progress and choose the exact permanent effect at completion.
- [x] Pending multiplayer Research orders stay disabled until the authoritative host applies or rejects them.
- [x] Land target cards show `10% CAP / ATTACK`; naval target cards show `5% CAP / ATTACK · NAVAL`.
- [x] Guyana-Haiti and Costa Rica-Papua New Guinea are valid authored naval routes.
- [x] Naval routes are subtle cyan for ordinary access and muted red when the Rogue owns an endpoint.
- [x] Survival opens with Rogue-only Antarctica and all three gateways active.
- [x] The nine Arctic foundation countries belong directly to the player Empire rather than a separate Dawnline alliance.
- [x] Locked Arctic countries use the 50% Army Capacity Base Packet without mastery; unlocked countries use full power plus mastery.
- [x] In co-op, selected human countries stay sovereign and every unselected Arctic Base Packet belongs to the host.
- [x] Rogue Antarctica opens near its configured player-side benchmark; the strengthened perimeter remains weaker than the core and can support a breakout.
- [x] Survival ordinary AI does not initiate wars against humans or other ordinary AI, while the human can still declare a legal ordinary war.
- [x] A Rogue-captured ordinary territory keeps its full simulation and shows 4x integration progress without instant assimilation, free units or progression rewards.
- [x] Every 52-day Rogue wave creates provenance-tagged Antarctic personnel equal to exactly 5% of pre-wave live active Rogue Army and does not deduct from existing formations.
- [x] Save/load, multiplayer protocol v7 and the primary browser smoke flow complete.
