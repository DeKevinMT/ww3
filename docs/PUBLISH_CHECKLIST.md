# v2.66 publish checklist

## Required gates

- [x] Focused polar, map, naval, logistics, fusion, UI and multiplayer tests pass.
- [x] Complete Vitest suite passes with no skipped release blockers.
- [x] TypeScript and Vite production build pass.
- [ ] Cloudflare matchmaker dry-run passes in the isolated GitHub release job.
- [x] `git diff --check` has no errors.
- [ ] Release commit is based on the current remote `main` without overwriting remote history.
- [ ] GitHub Pages workflow completes successfully.
- [ ] Published page loads its versioned JavaScript, CSS, map data and audio assets.
- [ ] Published UI reports `v2.66` and opens the country picker.

## Manual smoke test

- [ ] Fullscreen recommendation can enter fullscreen or continue windowed; Esc/F11 guidance is visible.
- [ ] A country can be selected and the map opens centred after the loader.
- [ ] Topbar Economy, Population, Army readiness, EONSCAR Energy and live war supply render clearly.
- [ ] Border rendering has one sharp outline at close zoom and integration borders remain sharp.
- [ ] North Pole opens sequential research with real bonuses, costs, time and progress.
- [ ] Attack Review shows compact costs, signed Economy/Population impact, IQ and GDP-per-person fusion.
- [ ] Nation demographics shows integration and population-origin fusion together.
- [ ] Long naval routes are available where geography permits and quote an increasing distance cost.
- [ ] Survival opens with Rogue-only Antarctica, all three gateways active, the human roster at 100% Army and every ordinary sovereign at 100% Army without changing population, economy, resources or capacity.
- [ ] Dawnline contains only the eligible non-human Arctic states, uses its dedicated alliance flag, opens at full strength and faces a Rogue Antarctic force at roughly 120% of its combined live Combat Power.
- [ ] Survival ordinary AI does not initiate wars against humans or other ordinary AI, while the human can still declare a legal ordinary war.
- [ ] A Rogue-captured ordinary territory keeps its full simulation and shows 4× integration progress without instant assimilation, free units or progression rewards.
- [ ] Every yearly Rogue wave, including wave one, creates provenance-tagged Antarctic personnel equal to exactly 5% of pre-wave live active Rogue Army, splits them across all three real gateways and does not deduct from existing formations.
- [ ] Survival settlement charges 50 Credits, pays zero Credits and grants score/XP only for verified Antarctic-origin Rogue losses and unique held Antarctic sector/core captures.
- [ ] Save/load and a two-player host/client smoke test complete.
