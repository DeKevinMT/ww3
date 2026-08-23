import './styles.css';
import { validateMap } from './game/data/worldMap';
import { createPhaserGame } from './game/map/config';
import { GuestGameSession, HostGameSession, type GameSessionEngineV2 } from './multiplayer/gameSession';
import {
  localCountryFromLobby,
  multiplayerControllerNamesFromLobby,
  multiplayerSeatsFromLobby,
} from './multiplayer/orchestration';
import type { PlayerId } from './sim/v2/types';
import { WorldEngineV2 } from './sim/v2/WorldEngineV2';
import {
  MultiplayerLobby,
  type MultiplayerGuestLaunch,
  type MultiplayerHostLaunch,
} from './ui/MultiplayerLobby';
import { MultiplayerSessionStatus } from './ui/MultiplayerSessionStatus';
import { IntroOpeningMetricsCacheV2, WorldUIV2 } from './ui/WorldUIV2';

const mapErrors = validateMap();
if (mapErrors.length > 0) throw new Error(`Invalid map:\n${mapErrors.join('\n')}`);

const requestedSeed = Number(new URLSearchParams(window.location.search).get('seed'));

function freshSeed(): number {
  if (Number.isInteger(requestedSeed) && requestedSeed > 0) return requestedSeed >>> 0;
  const randomSeed = new Uint32Array(1);
  window.crypto.getRandomValues(randomSeed);
  return randomSeed[0] || 1;
}

let activeEngine: WorldEngineV2 | undefined;
let activeUi: WorldUIV2 | undefined;
let activeLobby: MultiplayerLobby | undefined;
let activeSession: HostGameSession | GuestGameSession | undefined;
let activeSessionStatus: MultiplayerSessionStatus | undefined;
let unsubscribeSessionStatus: (() => void) | undefined;
let activeControllerNames: ReadonlyMap<PlayerId, string> = new Map();

createPhaserGame();

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
): void {
  if (activeEngine && activeEngine !== engine) activeEngine.stopClock();
  activeUi?.destroy();
  activeEngine = engine;
  activeUi = new WorldUIV2(engine, multiplayer
    ? { introOpen: false, multiplayer: true, controllerNames }
    : { onMultiplayerRequested: openMultiplayerLobby });
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
  const engine = new WorldEngineV2(freshSeed());
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
  activeControllerNames = controllerNames;
  activeSession = session;
  mountWorldUi(engine, true, controllerNames);
  attachHostStatus(session);
}

async function launchGuestGame(launch: MultiplayerGuestLaunch): Promise<void> {
  const seats = multiplayerSeatsFromLobby(launch.lobby);
  const controllerNames = multiplayerControllerNamesFromLobby(launch.lobby);
  const countryId = localCountryFromLobby(launch.lobby, launch.transport.peerId);
  const session = new GuestGameSession({
    transport: launch.transport,
    countryId,
    seatCount: seats.size,
    humanPlayerIds: [...seats.values()],
  });
  const accepted = session.acceptSnapshot(launch.snapshot);
  if (!accepted.accepted || !session.engine) {
    session.close(false);
    throw new Error(accepted.reason ?? 'The host snapshot could not be loaded.');
  }
  const engine = worldEngineFromSession(session.engine);

  activeLobby?.destroy(false);
  activeLobby = undefined;
  destroyActiveGame();
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
    preferredCountryId,
  });
  activeLobby = lobby;
}

const soloEngine = new WorldEngineV2(freshSeed());
activeEngine = soloEngine;
activeUi = new WorldUIV2(soloEngine, { onMultiplayerRequested: openMultiplayerLobby });
soloEngine.startClock();

window.addEventListener('beforeunload', () => {
  activeLobby?.destroy();
  activeLobby = undefined;
  destroyActiveGame();
}, { once: true });
