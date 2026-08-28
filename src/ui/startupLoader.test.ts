import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import globeSceneSource from '../game/map/three/ThreeGlobeScene.ts?raw';
import mainSource from '../main.ts?raw';
import worldUiSource from './WorldUIV2.ts?raw';

const indexSource = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const criticalStyleStart = indexSource.indexOf('<style id="startup-critical-css">');
const criticalStyleEnd = indexSource.indexOf('</style>', criticalStyleStart);
const criticalStyleSource = indexSource.slice(criticalStyleStart, criticalStyleEnd);

describe('post-selection map loader', () => {
  it('paints a complete dark loader before modules or application CSS are available', () => {
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
    expect(criticalStyleSource).toContain('@keyframes startup-map-progress');
    expect(criticalStyleSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesSource).not.toContain('#startup-loader');
    expect(stylesSource).not.toContain('.startup-loader__');
  });

  it('shows a short initial loader before revealing the country picker', () => {
    expect(indexSource.match(/id="startup-loader"/g)).toHaveLength(1);
    expect(indexSource).toContain('id="startup-loader" role="status"');
    expect(indexSource).toContain('aria-live="polite" aria-atomic="true" aria-hidden="false"');
    expect(indexSource).toContain('<span class="startup-loader__sr-only">Loading Frontier Command</span>');
    expect(indexSource).toContain('aria-hidden="false"');
    expect(mainSource).toContain("document.querySelector<HTMLElement>('#startup-loader')");
    expect(mainSource).toContain('const INTRO_LOADER_MIN_VISIBLE_MS = 2_000;');
    expect(mainSource).toContain('void dismissIntroLoaderAfterReady();');
    expect(mainSource).toContain('INTRO_LOADER_MIN_VISIBLE_MS - (performance.now() - startupLoaderShownAt)');
    expect(mainSource).not.toContain('await renderer.firstFrameReady;');
  });

  it('activates only after an accepted country confirmation', () => {
    const chooseCountryBody = worldUiSource.slice(
      worldUiSource.indexOf("case 'choose-country':"),
      worldUiSource.indexOf("case 'open-multiplayer':"),
    );
    expect(chooseCountryBody.indexOf('this.options.onCountryConfirmed?.(countryId);'))
      .toBeGreaterThan(chooseCountryBody.indexOf('if (!commandAccepted(result))'));
    expect(mainSource).toContain('onCountryConfirmed: showStartupLoader');
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
    expect(scenarioBody).not.toContain('startupLoader');
  });
});
