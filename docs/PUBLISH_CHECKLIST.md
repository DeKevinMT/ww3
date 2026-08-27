# v2.65 publish checklist

## Required gates

- [x] Focused polar, map, naval, logistics, fusion, UI and multiplayer tests pass.
- [x] Complete Vitest suite passes with no skipped release blockers.
- [x] TypeScript and Vite production build pass.
- [ ] Cloudflare matchmaker dry-run passes in the isolated GitHub release job.
- [x] `git diff --check` has no errors.
- [ ] Release commit is based on the current remote `main` without overwriting remote history.
- [ ] GitHub Pages workflow completes successfully.
- [ ] Published page loads its versioned JavaScript, CSS, map data and audio assets.
- [ ] Published UI reports `v2.65` and opens the country picker.

## Manual smoke test

- [ ] Fullscreen recommendation can enter fullscreen or continue windowed; Esc/F11 guidance is visible.
- [ ] A country can be selected and the map opens centred after the loader.
- [ ] Topbar Treasury target fill, Economy per-person trend, People IQ and Military reserves/priority render.
- [ ] Border rendering has one sharp outline at close zoom and integration borders remain sharp.
- [ ] North Pole opens sequential research with real bonuses, costs, time and progress.
- [ ] Attack Review shows compact costs, signed Economy/Population impact, IQ and GDP-per-person fusion.
- [ ] Nation demographics shows integration and population-origin fusion together.
- [ ] Long naval routes are available where geography permits and quote an increasing distance cost.
- [ ] Save/load and a two-player host/client smoke test complete.
