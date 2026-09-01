# v2.82 publish checklist

## Required gates

- [x] Complete Vitest suite passes: 228 files, 1,590 passed and 1 intentionally skipped test.
- [x] TypeScript, matchmaker TypeScript and Vite production build pass.
- [x] `git diff --check` has no errors.
- [x] Release commit is based on the current remote `main` without overwriting remote history.
- [ ] GitHub Pages workflow completes successfully.
- [ ] Published page loads its versioned JavaScript, CSS, map data and audio assets.
- [ ] Published UI reports `v2.82` and opens the country picker.
- [ ] Production matchmaker health endpoint responds successfully.

## Manual smoke test

- [x] A country can be selected and the map opens centred after the loader.
- [x] No temporary tutorial overlay appears; War and Research are available immediately.
- [x] The calendar advances one day per normal-speed second and existing operation lengths do not take longer in real time.
- [x] Topbar Economy, Population, Army readiness, EONSCAR Energy, live war supply and all five active Research categories render clearly.
- [x] The desktop-first Research Matrix shows five parallel categories with three authored directions each and exactly one active direction per category.
- [x] Every selected direction researches continuously, applies its exact permanent effect automatically and starts its next level without a blocking choice.
- [x] Research throughput is capped at 80% useful portfolio output, and the UI explains funded R&D, live IQ and the +25% funding scenario.
- [x] Target review projects GDP on capture, fully integrated GDP, purge cost and the resulting national-IQ effect on Research.
- [x] Pending multiplayer Research direction orders stay disabled until the authoritative host applies or rejects them.
- [x] Land target cards show `20% CAP / ATTACK`; naval target cards show `10% CAP / ATTACK · NAVAL`.
- [x] Guyana-Haiti and Costa Rica-Papua New Guinea are valid authored naval routes.
- [x] Naval routes are visible but subtle cyan for ordinary access and muted red when the Rogue owns an endpoint; distant sea shield tethers are absent.
- [x] Survival opens with Rogue-only Antarctica and all three gateways active.
- [x] The nine Arctic foundation countries belong directly to the player Empire rather than a separate Dawnline alliance.
- [x] Locked Arctic countries use the 50% Army Capacity Base Packet without mastery; unlocked countries use full power plus mastery.
- [x] In co-op, selected human countries stay sovereign and every unselected Arctic Base Packet belongs to the host.
- [x] Rogue Antarctica opens near its configured player-side benchmark; the strengthened perimeter remains weaker than the core and can support a breakout.
- [x] Survival ordinary AI does not initiate wars against humans or other ordinary AI, while the human can still declare a legal ordinary war.
- [x] A Rogue-captured ordinary territory keeps its full simulation and shows 4x integration progress without instant assimilation, free units or progression rewards.
- [x] Every 52-day Rogue wave creates provenance-tagged Antarctic personnel equal to exactly 5% of pre-wave live active Rogue Army and does not deduct from existing formations.
- [x] Save/load, multiplayer protocol v8 and the primary browser smoke flow complete.
