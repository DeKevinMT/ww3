import './styles.css';
import { validateMap } from './game/data/worldMap';
import { createWorldMapRenderer } from './game/map/createWorldMapRenderer';
import { GuestGameSession, HostGameSession, type GameSessionEngineV2 } from './multiplayer/gameSession';
import {
  localCountryFromLobby,
  multiplayerControllerNamesFromLobby,
  multiplayerSeatsFromLobby,
} from './multiplayer/orchestration';
import type { PlayerId } from './sim/v2/types';
import { WorldEngineV2 } from './sim/v2/WorldEngineV2';
import { V2_RULES_VERSION } from './sim/v2/balance';
import {
  normalizeScenarioConfigV2,
  resolveScenarioV2,
  scenarioConfigFromEngineV2,
  type GameModeV2,
  type ScenarioConfigV2,
} from './sim/v2/scenarios';
import {
  MultiplayerLobby,
  type MultiplayerGuestLaunch,
  type MultiplayerHostLaunch,
} from './ui/MultiplayerLobby';
import { MultiplayerSessionStatus } from './ui/MultiplayerSessionStatus';
import { IntroOpeningMetricsCacheV2, WorldUIV2 } from './ui/WorldUIV2';

const mapErrors = validateMap();
if (mapErrors.length > 0) throw new Error(`Invalid map:\n${mapErrors.join('\n')}`);

function randomSeed(): number {
  const randomSeed = new Uint32Array(1);
  window.crypto.getRandomValues(randomSeed);
  return randomSeed[0] || 1;
}

function initialScenarioFromLocation(): ScenarioConfigV2 {
  const parameters = new URLSearchParams(window.location.search);
  const requestedSeed = Number(parameters.get('seed'));
  const requestedModeParameter = parameters.get('mode');
  const requestedMode: GameModeV2 = requestedModeParameter === 'alternative-universe'
    || requestedModeParameter === 'random-world'
    ? 'random-world'
    : 'standard-2026';
  return normalizeScenarioConfigV2({
    mode: requestedMode,
    seed: Number.isInteger(requestedSeed) && requestedSeed > 0
      ? requestedSeed
      : randomSeed(),
  });
}

function publishScenarioToLocation(scenario: ScenarioConfigV2): void {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(scenario.seed));
  if (scenario.mode === 'random-world') url.searchParams.set('mode', 'alternative-universe');
  else url.searchParams.delete('mode');
  window.history.replaceState(null, '', url);
}

function sameScenario(left: ScenarioConfigV2, right: ScenarioConfigV2): boolean {
  return left.mode === right.mode && left.version === right.version && left.seed === right.seed;
}

let activeEngine: WorldEngineV2 | undefined;
let activeUi: WorldUIV2 | undefined;
let activeLobby: MultiplayerLobby | undefined;
let activeSession: HostGameSession | GuestGameSession | undefined;
let activeSessionStatus: MultiplayerSessionStatus | undefined;
let unsubscribeSessionStatus: (() => void) | undefined;
let activeControllerNames: ReadonlyMap<PlayerId, string> = new Map();
let activeScenario = initialScenarioFromLocation();

const startupLoader = document.querySelector<HTMLElement>('#startup-loader');
const gameVersionBadge = document.createElement('aside');
const compactGameVersion = V2_RULES_VERSION.match(/v\d+(?:\.\d+)*/i)?.[0] ?? V2_RULES_VERSION;
gameVersionBadge.className = 'game-version-badge';
gameVersionBadge.textContent = compactGameVersion.toUpperCase();
gameVersionBadge.setAttribute('aria-label', 'Frontier Command ' + compactGameVersion);
document.body.append(gameVersionBadge);
const worldMapRenderer = createWorldMapRenderer();
let startupLoaderState: 'idle' | 'active' | 'complete' = 'idle';
let startupLoaderFallbackTimer: number | undefined;

function showStartupLoader(): void {
  if (startupLoaderState !== 'idle' || !startupLoader?.isConnected) return;
  startupLoaderState = 'active';
  startupLoader.classList.remove('is-hidden', 'is-ready');
  startupLoader.setAttribute('aria-hidden', 'false');
  // A failed renderer must never leave the confirmed game permanently covered.
  startupLoaderFallbackTimer = window.setTimeout(dismissStartupLoader, 12_000);
}

function dismissStartupLoader(): void {
  if (startupLoaderState !== 'active' || !startupLoader?.isConnected) return;
  startupLoaderState = 'complete';
  if (startupLoaderFallbackTimer !== undefined) {
    window.clearTimeout(startupLoaderFallbackTimer);
    startupLoaderFallbackTimer = undefined;
  }
  startupLoader.classList.add('is-ready');
  startupLoader.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    if (!startupLoader.isConnected) return;
    startupLoader.classList.add('is-hidden');
    startupLoader.classList.remove('is-ready');
    startupLoaderState = 'idle';
  }, 260);
}

async function dismissStartupLoaderAfterMapFrame(): Promise<void> {
  if (startupLoaderState !== 'active') return;
  try {
    const renderer = await worldMapRenderer;
    // The political sync initially paints the base immediately, while SVG
    // flags settle asynchronously into one batched atlas redraw. Do not expose
    // that intermediate map underneath the loader.
    await renderer.waitForMapReady();
    if (startupLoaderState !== 'active') return;
    // The subsequent WebGL frame uploads and draws the completed atlas.
    await renderer.waitForNextFrame();
    // Let the browser present that framebuffer before fading the cover away.
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  } finally {
    dismissStartupLoader();
  }
}

function worldEngineFromSession(engine: GameSessionEngineV2): WorldEngineV2 {
  if (!(engine instanceof WorldEngineV2)) throw new Error('The multiplayer snapshot did not create a WorldEngineV2 replica.');
  return engine;
}

function destroyActiveGame(closeSession = true): void {
  unsubscribeSessionStatus?.();
  unsubscribeSessionStatus = undefined;
  activeSessionStatus?.destroy();
  activeSessionStatus = undefined;
  activeUi?.destroy();
  activeUi = undefined;
  activeEngine?.stopClock();
  activeEngine = undefined;
  const session = activeSession;
  activeSession = undefined;
  session?.close(closeSession);
  activeControllerNames = new Map();
}

function mountWorldUi(
  engine: WorldEngineV2,
  multiplayer: boolean,
  controllerNames: ReadonlyMap<PlayerId, string> = activeControllerNames,
  initialPreviewCountryId?: PlayerId,
): void {
  if (activeEngine && activeEngine !== engine) activeEngine.stopClock();
  activeUi?.destroy();
  activeEngine = engine;
  activeUi = new WorldUIV2(engine, multiplayer
    ? { introOpen: false, multiplayer: true, controllerNames }
    : {
      initialPreviewCountryId,
      onCountryConfirmed: showStartupLoader,
      onInitialMapSynchronized: () => { void dismissStartupLoaderAfterMapFrame(); },
      onMultiplayerRequested: openMultiplayerLobby,
      scenarioConfig: scenarioConfigFromEngineV2(engine),
      onScenarioModeRequested: (mode) => launchSoloScenario({ mode, seed: randomSeed() }),
      onScenarioRerollRequested: (preferredCountryId) => launchSoloScenario({
        mode: activeScenario.mode,
        seed: randomSeed(),
      }, preferredCountryId),
      onNewGameRequested: () => launchSoloScenario({
        mode: activeScenario.mode,
        seed: randomSeed(),
      }),
    });
}

function launchSoloScenario(
  input: Pick<ScenarioConfigV2, 'mode' | 'seed'>,
  preferredCountryId?: PlayerId,
): void {
  if (activeLobby || activeSession) return;
  const resolved = resolveScenarioV2(input);
  destroyActiveGame();
  activeScenario = resolved.config;
  publishScenarioToLocation(activeScenario);
  const engine = new WorldEngineV2(activeScenario.seed, resolved.content);
  mountWorldUi(engine, false, activeControllerNames, preferredCountryId);
  engine.startClock();
}

function attachHostStatus(session: HostGameSession): void {
  activeSessionStatus = new MultiplayerSessionStatus();
  unsubscribeSessionStatus = session.subscribe({
    onStatus: (status) => activeSessionStatus?.update(status),
  });
}

function attachGuestStatus(session: GuestGameSession): void {
  activeSessionStatus = new MultiplayerSessionStatus();
  unsubscribeSessionStatus = session.subscribe({
    onStatus: (status) => activeSessionStatus?.update(status),
    onCommandResult: (event) => activeSessionStatus?.showCommandResult(event),
    onSnapshot: ({ engine }) => {
      if (activeSession !== session) return;
      mountWorldUi(worldEngineFromSession(engine), true, activeControllerNames);
    },
  });
}

async function launchHostGame(launch: MultiplayerHostLaunch): Promise<void> {
  const seats = multiplayerSeatsFromLobby(launch.lobby);
  const controllerNames = multiplayerControllerNamesFromLobby(launch.lobby);
  const hostCountryId = localCountryFromLobby(launch.lobby, launch.transport.hostPeerId);
  if (!sameScenario(launch.scenario, launch.lobby.scenario)) {
    throw new Error('The host launch scenario no longer matches the lobby.');
  }
  const scenario = resolveScenarioV2(launch.scenario);
  const engine = new WorldEngineV2(scenario.config.seed, scenario.content);
  const countrySelection = engine.chooseCountry(hostCountryId);
  engine.setClockAuthority(false);
  if (!countrySelection.accepted) {
    engine.stopClock();
    throw new Error(countrySelection.reason ?? 'The host country could not be selected.');
  }
  const session = new HostGameSession({ engine, transport: launch.transport, seats });
  if (session.hostCountryId !== hostCountryId) {
    session.close(false);
    throw new Error('The host lobby seat changed during campaign launch.');
  }
  const started = session.start();
  if (!started.accepted) {
    session.close(false);
    throw new Error(started.reason ?? 'The host session could not start.');
  }

  activeLobby?.destroy(false);
  activeLobby = undefined;
  destroyActiveGame();
  activeScenario = scenario.config;
  publishScenarioToLocation(activeScenario);
  activeControllerNames = controllerNames;
  activeSession = session;
  mountWorldUi(engine, true, controllerNames);
  attachHostStatus(session);
}

async function launchGuestGame(launch: MultiplayerGuestLaunch): Promise<void> {
  const seats = multiplayerSeatsFromLobby(launch.lobby);
  const controllerNames = multiplayerControllerNamesFromLobby(launch.lobby);
  const countryId = localCountryFromLobby(launch.lobby, launch.transport.peerId);
  if (!sameScenario(launch.scenario, launch.lobby.scenario)) {
    throw new Error('The guest launch scenario no longer matches the lobby.');
  }
  const scenario = resolveScenarioV2(launch.scenario);
  const session = new GuestGameSession({
    transport: launch.transport,
    countryId,
    seatCount: seats.size,
    humanPlayerIds: [...seats.values()],
    content: scenario.content,
  });
  const accepted = session.acceptSnapshot(launch.snapshot);
  if (!accepted.accepted || !session.engine) {
    session.close(false);
    throw new Error(accepted.reason ?? 'The host snapshot could not be loaded.');
  }
  const engine = worldEngineFromSession(session.engine);
  const snapshotScenario = scenarioConfigFromEngineV2(engine);
  if (!sameScenario(snapshotScenario, scenario.config)) {
    session.close(false);
    throw new Error('The host snapshot does not match the lobby game mode and seed.');
  }

  activeLobby?.destroy(false);
  activeLobby = undefined;
  destroyActiveGame();
  activeScenario = scenario.config;
  publishScenarioToLocation(activeScenario);
  activeControllerNames = controllerNames;
  activeSession = session;
  mountWorldUi(engine, true, controllerNames);
  attachGuestStatus(session);
}

function openMultiplayerLobby(preferredCountryId?: PlayerId): void {
  if (activeLobby || activeSession) return;
  const pausedEngine = activeEngine;
  if (!pausedEngine) return;
  const previousSpeed = pausedEngine?.state.speed;
  pausedEngine?.setSpeed(0);
  const lobby = new MultiplayerLobby({
    onClose: () => {
      if (activeLobby !== lobby) return;
      activeLobby = undefined;
      if (pausedEngine && !activeSession && activeEngine === pausedEngine && previousSpeed !== undefined) {
        pausedEngine.setSpeed(previousSpeed);
      }
    },
    onHostLaunch: launchHostGame,
    onGuestLaunch: launchGuestGame,
    openingMetrics: new IntroOpeningMetricsCacheV2().read(pausedEngine),
    scenarioConfig: scenarioConfigFromEngineV2(pausedEngine),
    preferredCountryId,
  });
  activeLobby = lobby;
}

launchSoloScenario(activeScenario);

void worldMapRenderer.catch((error: unknown) => {
  dismissStartupLoader();
  window.setTimeout(() => { throw error; });
});

window.addEventListener('beforeunload', () => {
  activeLobby?.destroy();
  activeLobby = undefined;
  destroyActiveGame();
}, { once: true });
