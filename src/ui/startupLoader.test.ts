import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import globeSceneSourceRaw from '../game/map/three/ThreeGlobeScene.ts?raw';
import mainSourceRaw from '../main.ts?raw';
import worldUiSourceRaw from './WorldUIV2.ts?raw';

const normalized = (source: string): string => source.replace(/\r\n/g, '\n');
const globeSceneSource = normalized(globeSceneSourceRaw);
const mainSource = normalized(mainSourceRaw);
const worldUiSource = normalized(worldUiSourceRaw);
const indexSource = normalized(readFileSync(new URL('../../index.html', import.meta.url), 'utf8'));
const stylesSource = normalized(readFileSync(new URL('../styles.css', import.meta.url), 'utf8'));
const criticalStyleStart = indexSource.indexOf('<style id="startup-critical-css">');
const criticalStyleEnd = indexSource.indexOf('</style>', criticalStyleStart);
const criticalStyleSource = indexSource.slice(criticalStyleStart, criticalStyleEnd);

describe('boot and timeline deployment loaders', () => {
  it('paints the cinematic EONSCAR loader before modules or application CSS are available', () => {
    const moduleTag = '<script type="module" src="/src/main.ts"></script>';
    expect(indexSource).toContain('<meta name="theme-color" content="#030a12" />');
    expect(indexSource).toContain('<meta name="color-scheme" content="dark" />');
    expect(criticalStyleStart).toBeGreaterThan(-1);
    expect(criticalStyleEnd).toBeGreaterThan(criticalStyleStart);
    expect(criticalStyleStart).toBeLessThan(indexSource.indexOf('</head>'));
    expect(indexSource.match(/<script type="module" src="\/src\/main\.ts"><\/script>/g)).toHaveLength(1);
    expect(indexSource.indexOf(moduleTag)).toBeLessThan(indexSource.indexOf('</head>'));
    expect(criticalStyleSource).toContain('html, body, #app');
    expect(criticalStyleSource).toContain('background: #030a12;');
    expect(criticalStyleSource).toContain('position: fixed;');
    expect(criticalStyleSource).toContain('inset: 0;');
    expect(criticalStyleSource).toContain('min-height: 100dvh;');
    expect(criticalStyleSource).toContain('url("./src/assets/eonscar-command-bg.jpg")');
    expect(criticalStyleSource).toContain('@keyframes startup-uplink-progress');
    expect(criticalStyleSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(indexSource).toContain('rel="preload" as="image" href="./src/assets/eonscar-command-bg.jpg"');
    expect(indexSource).toContain('rel="preload" as="image" href="./src/assets/brand/eonscar-logo-transparent.png"');
    expect(stylesSource).not.toContain('#startup-loader');
    expect(stylesSource).not.toContain('.startup-loader__');
  });

  it('shows one quiet brand, one progress bar and one loading tip', () => {
    expect(indexSource.match(/id="startup-loader"/g)).toHaveLength(1);
    expect(indexSource).toContain('id="startup-loader" role="status"');
    expect(indexSource).toContain('aria-live="polite" aria-atomic="true" aria-hidden="false"');
    expect(indexSource).toContain('data-loader-variant="boot" data-loader-stage="boot"');
    expect(indexSource).toContain('<span class="startup-loader__sr-only">Connecting to EONSCAR account</span>');
    expect(indexSource).toContain('<img src="./src/assets/brand/eonscar-logo-transparent.png" alt="" />');
    expect(indexSource).toContain('<strong>EONSCAR</strong><span>EONSCAR REMEMBERS.</span>');
    expect(indexSource).not.toContain('RECLAMATION');
    expect(indexSource.match(/class="startup-loader__track"/g)).toHaveLength(1);
    expect(indexSource.match(/data-loader-tip/g)).toHaveLength(1);
    expect(indexSource).toContain('FIELD INTEL');
    expect(indexSource).not.toContain('LOADING PROFILE &amp; ACTIVE TIMELINE');
    expect(indexSource).not.toContain('TIMELINE DEPLOYMENT');
    expect(indexSource).not.toContain('01 · TIMELINE');
    expect(indexSource).not.toContain('02 · WORLD MAP');
    expect(indexSource).not.toContain('03 · EONSCAR');
    expect(indexSource).toContain('aria-hidden="false"');
    expect(mainSource).toContain("document.querySelector<HTMLElement>('#startup-loader')");
    expect(mainSource).toContain("showFreshLoadingTip('boot');");
    expect(mainSource).toContain("window.sessionStorage.setItem(LAST_LOADING_TIP_STORAGE_KEY, tip.id)");
    expect(mainSource).toContain('const BOOT_LOADER_MIN_VISIBLE_MS = 450;');
    const bootDismissal = mainSource.slice(
      mainSource.indexOf('async function dismissBootLoaderAfterReady()'),
      mainSource.indexOf('function worldEngineFromSession('),
    );
    expect(bootDismissal).toContain('BOOT_LOADER_MIN_VISIBLE_MS - (performance.now() - startupLoaderShownAt)');
    expect(bootDismissal).not.toContain('worldMapRenderer');
    expect(bootDismissal).not.toContain('waitForMapReady');
    expect(mainSource).toContain('showCommanderMenu(true);\n  await dismissBootLoaderAfterReady();');
    expect(mainSource).not.toContain('await renderer.firstFrameReady;');
  });

  it('refreshes one mode-aware tip only when an accepted deployment starts a new loading cycle', () => {
    const chooseCountryBody = worldUiSource.slice(
      worldUiSource.indexOf("case 'choose-country':"),
      worldUiSource.indexOf("case 'open-multiplayer':"),
    );
    expect(chooseCountryBody.indexOf('this.options.onCountryConfirmed?.(countryId);'))
      .toBeGreaterThan(chooseCountryBody.indexOf('if (!commandAccepted(result))'));
    const confirmationCallback = mainSource.slice(
      mainSource.indexOf('onCountryConfirmed:'),
      mainSource.indexOf('onInitialMapSynchronized:', mainSource.indexOf('onCountryConfirmed:')),
    );
    expect(confirmationCallback).toContain('showDeploymentLoader(countryId, scenarioConfigFromEngineV2(engine));');
    expect(confirmationCallback).toContain('void beginStoredCampaign(engine, countryId);');
    expect(mainSource).toContain("startupLoader.dataset.loaderVariant = 'deployment';");
    expect(mainSource).toContain("startupLoader.dataset.loaderStage = 'world';");
    expect(mainSource).toContain("const beginsNewLoadingCycle = startupLoaderState === 'idle';");
    expect(mainSource).toContain('if (beginsNewLoadingCycle) {\n    showFreshLoadingTip(loadingTipAudienceForModeV1(scenario.mode));\n  }');
    expect(mainSource).not.toContain('data-loader-country-flag');
    expect(mainSource).not.toContain('countryFlagHtml(country.id, country.sigil, true)');
    expect(mainSource).toContain("startupLoaderState: 'idle' | 'active' | 'complete' = startupLoader?.isConnected");
    expect(mainSource).toContain("startupLoader.classList.remove('is-hidden', 'is-ready')");
  });

  it('waits for the synchronized political map to be drawn and presented', () => {
    expect(worldUiSource).toContain('this.initialMapLoaderPaintPending = true;');
    expect(worldUiSource).toContain('&& this.initialMapLoaderPaintPending');
    expect(worldUiSource).toContain('queueFrame();');
    expect(worldUiSource).toContain('if (didSyncMap) mapBridge.sync();');
    expect(worldUiSource).toContain('this.options.onInitialMapSynchronized?.();');
    expect(mainSource).toContain('await renderer.waitForMapReady();');
    expect(mainSource).toContain('const STARTUP_LOADER_MIN_VISIBLE_MS = 2_800;');
    expect(mainSource).toContain("setDeploymentLoaderStage('map');");
    expect(mainSource).toContain("setDeploymentLoaderStage('eonscar');");
    expect(mainSource).toContain('STARTUP_LOADER_MIN_VISIBLE_MS - (performance.now() - startupLoaderShownAt)');
    expect(mainSource).toContain('window.setTimeout(resolve, minimumDelayRemaining)');
    expect(mainSource).toContain('await renderer.waitForNextFrame();');
    expect(mainSource).toContain('window.requestAnimationFrame(() => resolve())');
    expect(mainSource.indexOf('await renderer.waitForMapReady();'))
      .toBeLessThan(mainSource.indexOf('await renderer.waitForNextFrame();'));
    expect(mainSource.indexOf('minimumDelayRemaining'))
      .toBeLessThan(mainSource.indexOf('await renderer.waitForNextFrame();'));
    expect(globeSceneSource).toContain('return this.globeTexture.waitForReady();');
    expect(globeSceneSource.indexOf('for (const resolve of resolvers) resolve();'))
      .toBeGreaterThan(globeSceneSource.indexOf('this.renderer.render(this.scene, this.camera);'));
  });

  it('launches Survival on the selected flagship without the initial Rogue warning modal', () => {
    const campaignInitialization = mainSource.slice(
      mainSource.indexOf('async function beginStoredCampaign('),
      mainSource.indexOf('function persistProfileResult('),
    );
    const nationFirstLaunch = mainSource.slice(
      mainSource.indexOf('async function launchSoloScenarioForCountry('),
      mainSource.indexOf('function attachHostStatus('),
    );
    expect(campaignInitialization).toContain("if (scenario.mode === 'survival')");
    expect(campaignInitialization).toContain('engine.formSurvivalEmpire(countryId, commanderProfile.unlockedCountryIds)');
    expect(campaignInitialization).toContain('acknowledgePolarWarningV2(engine.state, countryId)');
    expect(campaignInitialization.indexOf('acknowledgePolarWarningV2(engine.state, countryId)'))
      .toBeGreaterThan(campaignInitialization.indexOf('engine.formSurvivalEmpire('));
    expect(campaignInitialization.indexOf('acknowledgePolarWarningV2(engine.state, countryId)'))
      .toBeLessThan(campaignInitialization.indexOf('stateSave: engine.save()'));
    expect(nationFirstLaunch).toContain('mountWorldUi(engine, false, activeControllerNames, countryId, false)');
    expect(nationFirstLaunch).toContain('void focusInitialFlagshipAfterMapReady(countryId);');
    expect(mainSource).toContain('await renderer.waitForMapReady();\n  renderer.focusCountry(countryId);');
  });

  it('keeps the timeout fallback valid while asynchronous flags settle', () => {
    expect(mainSource).toContain('startupLoaderFallbackTimer = window.setTimeout(');
    expect(mainSource).toContain("if (startupLoaderState !== 'active') return;");
    expect(mainSource).toContain('} finally {\n    dismissStartupLoader();');
  });

  it('is reusable for a later country choice and is not driven by normal gameplay updates', () => {
    expect(mainSource.match(/createWorldMapRenderer\(/g)).toHaveLength(1);
    expect(mainSource).toContain("if (startupLoaderState !== 'idle'");
    expect(mainSource).toContain("startupLoaderState = 'complete'");
    expect(mainSource).toContain("startupLoader.classList.add('is-hidden')");
    expect(mainSource).toContain("startupLoaderState = 'idle'");
    expect(mainSource).not.toContain('startupLoader.remove()');
    const scenarioBody = mainSource.slice(
      mainSource.indexOf('function launchSoloScenario('),
      mainSource.indexOf('function attachHostStatus('),
    );
    const legacyScenarioOnly = scenarioBody.slice(
      0,
      scenarioBody.indexOf('async function launchSoloScenarioForCountry('),
    );
    expect(legacyScenarioOnly).not.toContain('showDeploymentLoader');
    expect(scenarioBody).toContain('showDeploymentLoader(countryId, resolved.config)');
  });
});
