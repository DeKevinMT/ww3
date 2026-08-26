import type { BattleEventV2, WorldChangeV2 } from '../sim/v2/types';

export const FIGHT_AUDIO_MAX_OVERLAP = 2;
export const FIGHT_AUDIO_COOLDOWN_MS = 900;
export const PLAYER_FIGHT_GAIN_NEAR = 0.82;
export const PLAYER_FIGHT_GAIN_FAR = 0.09;
export const AI_FIGHT_GAIN_MAX = 0.065;
export const AI_FIGHT_MIN_FOCUS = 0.82;
export const PLAYER_WAR_ACTIVE_COMBAT_DELAY_MS = 3_680;
export const PLAYER_LOSS_AUDIO_COOLDOWN_MS = 2_500;
export const AMBIENT_MUSIC_VOLUME = 0.055;

export const GAME_AMBIENT_MUSIC = Object.freeze({
  title: 'War Room Drift',
  fileName: 'war-room-drift-ambient.wav',
  durationSeconds: 144.84,
  sourceLabel: 'User-provided audio',
});

export const GAME_AUDIO_SOURCES = Object.freeze({
  fight: Object.freeze({
    title: 'Distant Tank Shots.flac',
    fileName: 'Distant Tank Shots.flac',
    durationSeconds: 18,
    author: 'qubodup',
    sourceUrl: 'https://freesound.org/people/qubodup/sounds/184275/',
    licenseLabel: 'CC0 / public domain',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  }),
  victory: Object.freeze({
    title: 'Radio Chatter: “Enemy down.”',
    fileName: '163626__twisterman__radio-chatter-enemy-down.wav',
    durationSeconds: 1.267,
    author: 'twisterman',
    sourceUrl: 'https://freesound.org/people/twisterman/sounds/163626/',
    licenseLabel: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  }),
  prepare: Object.freeze({
    title: 'target acquired.wav',
    fileName: '106314__timkahn__target-acquired.wav',
    durationSeconds: 2.293,
    author: 'tim.kahn',
    sourceUrl: 'https://freesound.org/people/tim.kahn/sounds/106314/',
    licenseLabel: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  }),
  active: Object.freeze({
    title: 'GO GO GO.wav',
    fileName: '276859__nidal8585__go-go-go.wav',
    durationSeconds: 3.28,
    author: 'Nidal8585',
    sourceUrl: 'https://freesound.org/people/Nidal8585/sounds/276859/',
    licenseLabel: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  }),
  distress: Object.freeze({
    title: 'radio_alarm_distress_signal.mp3',
    fileName: '347586__matteusnova__radio_alarm_distress_signal.mp3',
    durationSeconds: 8.184,
    author: 'MatteusNova',
    sourceUrl: 'https://freesound.org/people/MatteusNova/sounds/347586/',
    licenseLabel: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  }),
  loss: Object.freeze({
    title: 'Warrior Death Cry - British Male',
    fileName: '417539__theuncertainman__warrior-death-cry-british-male.wav',
    durationSeconds: 1.602,
    author: 'theuncertainman',
    sourceUrl: 'https://freesound.org/people/theuncertainman/sounds/417539/',
    licenseLabel: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  }),
});

export const GAME_AUDIO_CREDITS = Object.freeze(Object.values(GAME_AUDIO_SOURCES));

interface GameAudioAssetUrls {
  fight?: string;
  victory?: string;
  prepare?: string;
  active?: string;
  distress?: string;
  loss?: string;
  ambient?: string;
}

interface AmbientAudioElementLike {
  src: string;
  preload: string;
  loop: boolean;
  volume: number;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
  removeAttribute?(name: string): void;
  load?(): void;
}

interface AudioBufferLike {
  readonly duration: number;
}

interface AudioParamLike {
  value: number;
}

interface GainNodeLike {
  readonly gain: AudioParamLike;
  connect(destination: unknown): unknown;
  disconnect(): void;
}

interface BufferSourceNodeLike {
  buffer: AudioBufferLike | null;
  onended: (() => void) | null;
  connect(destination: unknown): unknown;
  disconnect(): void;
  start(when?: number): void;
}

interface AudioContextLike {
  readonly destination: unknown;
  readonly state: string;
  createGain(): GainNodeLike;
  createBufferSource(): BufferSourceNodeLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  resume(): Promise<void>;
}

interface GameAudioBuffers {
  fight: AudioBufferLike;
  victory: AudioBufferLike;
  prepare: AudioBufferLike;
  active: AudioBufferLike;
  distress: AudioBufferLike;
  loss: AudioBufferLike;
}

type RadioCue = Exclude<keyof GameAudioBuffers, 'fight'>;

interface AudioVoice {
  readonly gain: GainNodeLike;
  active: boolean;
  kind?: 'player' | 'ai' | 'radio';
}

export interface GameAudioPresentationContext {
  /** The country controlled by this client, including multiplayer viewers. */
  viewerPlayerId?: string;
  /** 0 when the battle is off-screen, 1 when it is centred in the current view. */
  battleFocus?: number;
  /** Every human seat, used to keep the AI-elimination distress strictly AI-vs-AI. */
  humanPlayerIds?: readonly string[];
}

export interface AudioScreenPoint {
  x: number;
  y: number;
}

/**
 * Cheap DOM-space proximity used at an audio event boundary. This deliberately
 * does no work in the Three.js render loop and treats a hidden/back-side battle
 * (no projected points) as completely out of focus.
 */
export function battleScreenFocus(
  points: readonly (AudioScreenPoint | undefined)[],
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (viewportWidth <= 0 || viewportHeight <= 0) return 0;
  const visible = points.filter((point): point is AudioScreenPoint => Boolean(point));
  if (visible.length === 0) return 0;
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;
  const maxDistance = Math.max(1, Math.hypot(centerX, centerY));
  return visible.reduce((best, point) => {
    const distance = Math.hypot(point.x - centerX, point.y - centerY);
    return Math.max(best, Math.max(0, Math.min(1, 1 - distance / maxDistance)));
  }, 0);
}

export interface GameAudioDependencies {
  interactionTarget?: EventTarget;
  now?: () => number;
  fetchArrayBuffer?: (url: string) => Promise<ArrayBuffer>;
  createAudioContext?: () => AudioContextLike;
  createAmbientAudio?: (url: string) => AmbientAudioElementLike;
  setTimeout?: (callback: () => void, milliseconds: number) => number;
  clearTimeout?: (timer: number) => void;
}

function defaultAudioContext(): AudioContextLike {
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) throw new Error('Web Audio is unavailable in this browser.');
  return new AudioContextConstructor() as unknown as AudioContextLike;
}

function defaultAmbientAudio(url: string): AmbientAudioElementLike {
  return new Audio(url);
}

async function fetchAudioArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio asset request failed (${response.status}).`);
  return response.arrayBuffer();
}

function assertApprovedDuration(buffer: AudioBufferLike, expectedSeconds: number, fileName: string): void {
  // A small tolerance permits decoder/sample rounding, while rejecting shortened
  // previews or accidentally substituted files before they ever reach playback.
  if (Math.abs(buffer.duration - expectedSeconds) > 0.06) {
    throw new Error(`${fileName} does not match its approved full duration.`);
  }
}

function battleKey(battle: BattleEventV2): string {
  return `${battle.warId}:${battle.sourceId}:${battle.targetId}:${battle.tick}`;
}

function matchupKey(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join(':');
}

function victoryKey(change: WorldChangeV2, viewerPlayerId?: string): string | undefined {
  const outcome = change.reason === 'war-outcome' ? change.warOutcome : undefined;
  if (!outcome || outcome.result !== 'victory') return undefined;
  if (!viewerPlayerId || outcome.humanId !== viewerPlayerId) return undefined;
  return `war:${outcome.warId}:${outcome.endedTick}`;
}

function clampFocus(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value!));
}

function playerFightGain(focus: number): number {
  const shapedFocus = focus * focus;
  return PLAYER_FIGHT_GAIN_FAR
    + (PLAYER_FIGHT_GAIN_NEAR - PLAYER_FIGHT_GAIN_FAR) * shapedFocus;
}

function aiFightGain(focus: number): number {
  const focusedRange = Math.max(0, Math.min(1,
    (focus - AI_FIGHT_MIN_FOCUS) / Math.max(0.001, 1 - AI_FIGHT_MIN_FOCUS),
  ));
  return AI_FIGHT_GAIN_MAX * (0.55 + focusedRange * 0.45);
}

/**
 * DOM/Web-Audio adapter for simulation events. It intentionally owns no game
 * state: WorldUI forwards already-confirmed changes and the adapter only plays
 * cached presentation assets outside the Three.js render loop.
 */
export class GameAudioController {
  private readonly now: () => number;
  private readonly fetchArrayBuffer: (url: string) => Promise<ArrayBuffer>;
  private readonly createAudioContext: () => AudioContextLike;
  private readonly createAmbientAudio: (url: string) => AmbientAudioElementLike;
  private readonly interactionTarget?: EventTarget;
  private readonly setTimer: (callback: () => void, milliseconds: number) => number;
  private readonly clearTimer: (timer: number) => void;
  private mountCount = 0;
  private armed = false;
  private activated = false;
  private context?: AudioContextLike;
  private ambientAudio?: AmbientAudioElementLike;
  private loadPromise?: Promise<GameAudioBuffers | undefined>;
  private buffers?: GameAudioBuffers;
  private readonly fightVoices: AudioVoice[] = [];
  private radioVoice?: AudioVoice;
  private readonly radioQueue: Array<{ cue: RadioCue; key: string; onStart?: () => void }> = [];
  private readonly delayedFightTimers = new Map<string, number>();
  private readonly preparedPlayerMatchups = new Set<string>();
  private readonly seenActivePlayerWars = new Set<string>();
  private readonly lastFightRequestAt: Record<'player' | 'ai', number> = {
    player: Number.NEGATIVE_INFINITY,
    ai: Number.NEGATIVE_INFINITY,
  };
  private readonly seenFightKeys = new Set<string>();
  private readonly seenRadioKeys = new Set<string>();
  private lastPlayerLossAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly assets: GameAudioAssetUrls,
    dependencies: GameAudioDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => performance.now());
    this.fetchArrayBuffer = dependencies.fetchArrayBuffer ?? fetchAudioArrayBuffer;
    this.createAudioContext = dependencies.createAudioContext ?? defaultAudioContext;
    this.createAmbientAudio = dependencies.createAmbientAudio ?? defaultAmbientAudio;
    this.interactionTarget = dependencies.interactionTarget
      ?? (typeof window === 'undefined' ? undefined : window);
    this.setTimer = dependencies.setTimeout
      ?? ((callback, milliseconds) => window.setTimeout(callback, milliseconds));
    this.clearTimer = dependencies.clearTimeout ?? ((timer) => window.clearTimeout(timer));
  }

  get available(): boolean {
    return Object.keys(GAME_AUDIO_SOURCES).every(
      (cue) => Boolean(this.assets[cue as keyof GameAudioAssetUrls]),
    );
  }

  mount(): void {
    this.mountCount += 1;
    if (this.mountCount !== 1) return;
    this.armFirstInteraction();
  }

  unmount(): void {
    this.mountCount = Math.max(0, this.mountCount - 1);
    if (this.mountCount > 0) return;
    this.disarmFirstInteraction();
    this.stopAmbient();
    this.resetSession();
  }

  resetSession(): void {
    for (const timer of this.delayedFightTimers.values()) this.clearTimer(timer);
    this.delayedFightTimers.clear();
    this.preparedPlayerMatchups.clear();
    this.seenActivePlayerWars.clear();
    this.radioQueue.length = 0;
    this.seenFightKeys.clear();
    this.seenRadioKeys.clear();
    this.lastFightRequestAt.player = Number.NEGATIVE_INFINITY;
    this.lastFightRequestAt.ai = Number.NEGATIVE_INFINITY;
    this.lastPlayerLossAt = Number.NEGATIVE_INFINITY;
  }

  async whenLoaded(): Promise<boolean> {
    return Boolean(await this.loadPromise);
  }

  async handleWorldChange(
    change: WorldChangeV2,
    presentation: GameAudioPresentationContext = {},
  ): Promise<void> {
    if (this.mountCount === 0 || !this.activated || !this.available) return;
    const plays: Promise<boolean>[] = [];
    if (change.battle) {
      const battle = change.battle;
      const playerWar = presentation.viewerPlayerId
        ? battle.attackerId === presentation.viewerPlayerId
          || battle.defenderId === presentation.viewerPlayerId
        : true;
      const focus = clampFocus(presentation.battleFocus, playerWar ? 1 : 0);
      if (playerWar) {
        const match = matchupKey(battle.attackerId, battle.defenderId);
        this.preparedPlayerMatchups.delete(match);
        if (!this.seenActivePlayerWars.has(battle.warId)) {
          this.remember(this.seenActivePlayerWars, battle.warId);
          plays.push(this.requestRadio('active', `active:${battle.warId}`, () => {
            this.scheduleFight(
              battle,
              'player',
              playerFightGain(focus),
              PLAYER_WAR_ACTIVE_COMBAT_DELAY_MS,
            );
          }));
        } else {
          plays.push(this.requestFight(battle, 'player', playerFightGain(focus)));
        }
        if (battle.conquered && battle.defenderId === presentation.viewerPlayerId) {
          plays.push(this.requestPlayerLoss(`battle-loss:${battleKey(battle)}`));
        }
      } else if (focus >= AI_FIGHT_MIN_FOCUS) {
        plays.push(this.requestFight(battle, 'ai', aiFightGain(focus)));
      }
    }
    if (change.reason === 'nation-defeated' && change.defeatedId) {
      if (change.defeatedId === presentation.viewerPlayerId) {
        plays.push(this.requestPlayerLoss(`player-eliminated:${change.defeatedId}`));
      } else if (change.victorId) {
        const humans = new Set(presentation.humanPlayerIds ?? []);
        if (!humans.has(change.victorId) && !humans.has(change.defeatedId)) {
          plays.push(this.requestRadio(
            'distress',
            `ai-eliminated:${change.victorId}:${change.defeatedId}`,
          ));
        }
      }
    }
    const victory = victoryKey(change, presentation.viewerPlayerId);
    if (victory) plays.push(this.requestRadio('victory', victory));
    await Promise.all(plays);
  }

  async handlePlayerWarPrepared(
    attackerId: string,
    defenderId: string,
    key: string,
  ): Promise<void> {
    if (this.mountCount === 0 || !this.activated || !this.available) return;
    this.preparedPlayerMatchups.add(matchupKey(attackerId, defenderId));
    await this.requestRadio('prepare', `prepare:${key}`);
  }

  private readonly onFirstInteraction = (): void => {
    if (this.activated) return;
    this.activated = true;
    this.disarmFirstInteraction();
    this.startAmbientOnce();
    if (this.available) void this.loadOnce();
  };

  private startAmbientOnce(): void {
    const url = this.assets.ambient;
    if (!url || this.ambientAudio) return;
    try {
      const player = this.createAmbientAudio(url);
      player.preload = 'auto';
      player.loop = true;
      player.volume = AMBIENT_MUSIC_VOLUME;
      this.ambientAudio = player;
      void player.play().catch(() => {
        // Autoplay policy or a missing optional ambience asset must never
        // affect simulation, input or the separately cached SFX layer.
      });
    } catch {
      // Optional ambient presentation stays inert when media is unavailable.
    }
  }

  private stopAmbient(): void {
    const player = this.ambientAudio;
    this.ambientAudio = undefined;
    if (!player) return;
    try { player.pause(); } catch { /* best-effort presentation cleanup */ }
    try { player.currentTime = 0; } catch { /* source may not be seekable */ }
    try { player.removeAttribute?.('src'); } catch { /* optional DOM cleanup */ }
    try { player.load?.(); } catch { /* release any remaining media handle */ }
  }

  private armFirstInteraction(): void {
    if (this.armed || this.activated || !this.interactionTarget) return;
    this.armed = true;
    this.interactionTarget.addEventListener('pointerdown', this.onFirstInteraction, { capture: true, passive: true });
    this.interactionTarget.addEventListener('keydown', this.onFirstInteraction, { capture: true });
  }

  private disarmFirstInteraction(): void {
    if (!this.armed || !this.interactionTarget) return;
    this.armed = false;
    this.interactionTarget.removeEventListener('pointerdown', this.onFirstInteraction, true);
    this.interactionTarget.removeEventListener('keydown', this.onFirstInteraction, true);
  }

  private loadOnce(): Promise<GameAudioBuffers | undefined> {
    if (this.loadPromise) return this.loadPromise;
    const fightUrl = this.assets.fight;
    const victoryUrl = this.assets.victory;
    const prepareUrl = this.assets.prepare;
    const activeUrl = this.assets.active;
    const distressUrl = this.assets.distress;
    const lossUrl = this.assets.loss;
    if (!fightUrl || !victoryUrl || !prepareUrl || !activeUrl || !distressUrl || !lossUrl) {
      this.loadPromise = Promise.resolve(undefined);
      return this.loadPromise;
    }
    this.loadPromise = (async () => {
      try {
        const context = this.context ??= this.createAudioContext();
        if (context.state === 'suspended') await context.resume();
        const [fightData, victoryData, prepareData, activeData, distressData, lossData] = await Promise.all([
          this.fetchArrayBuffer(fightUrl),
          this.fetchArrayBuffer(victoryUrl),
          this.fetchArrayBuffer(prepareUrl),
          this.fetchArrayBuffer(activeUrl),
          this.fetchArrayBuffer(distressUrl),
          this.fetchArrayBuffer(lossUrl),
        ]);
        const [fight, victory, prepare, active, distress, loss] = await Promise.all([
          context.decodeAudioData(fightData),
          context.decodeAudioData(victoryData),
          context.decodeAudioData(prepareData),
          context.decodeAudioData(activeData),
          context.decodeAudioData(distressData),
          context.decodeAudioData(lossData),
        ]);
        assertApprovedDuration(fight, GAME_AUDIO_SOURCES.fight.durationSeconds, GAME_AUDIO_SOURCES.fight.fileName);
        assertApprovedDuration(victory, GAME_AUDIO_SOURCES.victory.durationSeconds, GAME_AUDIO_SOURCES.victory.fileName);
        assertApprovedDuration(prepare, GAME_AUDIO_SOURCES.prepare.durationSeconds, GAME_AUDIO_SOURCES.prepare.fileName);
        assertApprovedDuration(active, GAME_AUDIO_SOURCES.active.durationSeconds, GAME_AUDIO_SOURCES.active.fileName);
        assertApprovedDuration(distress, GAME_AUDIO_SOURCES.distress.durationSeconds, GAME_AUDIO_SOURCES.distress.fileName);
        assertApprovedDuration(loss, GAME_AUDIO_SOURCES.loss.durationSeconds, GAME_AUDIO_SOURCES.loss.fileName);
        this.buffers = { fight, victory, prepare, active, distress, loss };
        this.createVoicePool(context);
        return this.buffers;
      } catch {
        // Missing/invalid sources leave audio inert. In particular, there is no
        // preview fallback: only the approved originals may reach playback.
        return undefined;
      }
    })();
    return this.loadPromise;
  }

  private createVoicePool(context: AudioContextLike): void {
    if (this.fightVoices.length > 0) return;
    for (let index = 0; index < FIGHT_AUDIO_MAX_OVERLAP; index += 1) {
      const gain = context.createGain();
      gain.gain.value = 1;
      gain.connect(context.destination);
      this.fightVoices.push({ gain, active: false });
    }
    const radioGain = context.createGain();
    radioGain.gain.value = 1;
    radioGain.connect(context.destination);
    this.radioVoice = { gain: radioGain, active: false };
  }

  private scheduleFight(
    battle: BattleEventV2,
    kind: 'player' | 'ai',
    gain: number,
    delayMs: number,
  ): void {
    const key = battleKey(battle);
    if (this.seenFightKeys.has(key) || this.delayedFightTimers.has(key)) return;
    const timer = this.setTimer(() => {
      this.delayedFightTimers.delete(key);
      void this.requestFight(battle, kind, gain);
    }, delayMs);
    this.delayedFightTimers.set(key, timer);
  }

  private async requestPlayerLoss(key: string): Promise<boolean> {
    const requestedAt = this.now();
    if (requestedAt - this.lastPlayerLossAt < PLAYER_LOSS_AUDIO_COOLDOWN_MS) return false;
    this.lastPlayerLossAt = requestedAt;
    return this.requestRadio('loss', key);
  }

  private async requestFight(
    battle: BattleEventV2,
    kind: 'player' | 'ai',
    gain: number,
  ): Promise<boolean> {
    const key = battleKey(battle);
    const requestedAt = this.now();
    if (this.seenFightKeys.has(key)
      || requestedAt - this.lastFightRequestAt[kind] < FIGHT_AUDIO_COOLDOWN_MS) return false;
    if (kind === 'ai' && this.fightVoices.some((voice) => voice.active && voice.kind === 'ai')) return false;
    this.remember(this.seenFightKeys, key);
    this.lastFightRequestAt[kind] = requestedAt;
    const buffers = this.buffers ?? await this.loadOnce();
    if (!buffers) return false;
    if (kind === 'ai' && this.fightVoices.some((voice) => voice.active && voice.kind === 'ai')) return false;
    const voice = this.fightVoices.find((candidate) => !candidate.active);
    return voice ? this.playBuffer(voice, buffers.fight, gain, kind) : false;
  }

  private async requestRadio(
    cue: RadioCue,
    key: string,
    onStart?: () => void,
  ): Promise<boolean> {
    if (this.seenRadioKeys.has(key)) return false;
    this.remember(this.seenRadioKeys, key);
    const buffers = this.buffers ?? await this.loadOnce();
    if (!buffers || !this.radioVoice) return false;
    if (this.radioVoice.active) {
      if (this.radioQueue.length < 6) this.radioQueue.push({ cue, key, onStart });
      return false;
    }
    return this.playRadio(cue, onStart);
  }

  private playRadio(cue: RadioCue, onStart?: () => void): boolean {
    const buffer = this.buffers?.[cue];
    if (!buffer || !this.radioVoice) return false;
    onStart?.();
    return this.playBuffer(this.radioVoice, buffer, 1, 'radio', () => {
      const next = this.radioQueue.shift();
      if (next) this.playRadio(next.cue, next.onStart);
    });
  }

  private playBuffer(
    voice: AudioVoice,
    buffer: AudioBufferLike,
    gain: number,
    kind: AudioVoice['kind'],
    onEnded?: () => void,
  ): boolean {
    const context = this.context;
    if (!context) return false;
    // AudioBufferSourceNode is one-shot by Web Audio design. The decoded buffer,
    // AudioContext and fixed gain/player voices are cached; no HTMLAudio element
    // or gain node is allocated for an event.
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(voice.gain);
    voice.gain.gain.value = gain;
    voice.active = true;
    voice.kind = kind;
    source.onended = () => {
      voice.active = false;
      voice.kind = undefined;
      source.onended = null;
      source.disconnect();
      onEnded?.();
    };
    source.start(0);
    return true;
  }

  private remember(collection: Set<string>, value: string): void {
    collection.add(value);
    if (collection.size <= 128) return;
    const oldest = collection.values().next().value as string | undefined;
    if (oldest) collection.delete(oldest);
  }

}

const BUNDLED_AUDIO_ASSETS = import.meta.glob([
  './assets/Distant Tank Shots.flac',
  './assets/163626__twisterman__radio-chatter-enemy-down.wav',
  './assets/106314__timkahn__target-acquired.wav',
  './assets/276859__nidal8585__go-go-go.wav',
  './assets/347586__matteusnova__radio_alarm_distress_signal.mp3',
  './assets/417539__theuncertainman__warrior-death-cry-british-male.wav',
  './assets/war-room-drift-ambient.wav',
], {
  eager: true,
  import: 'default',
  query: '?url&no-inline',
}) as Readonly<Record<string, string>>;

/** Singleton survives UI remounts so each original is fetched/decoded at most once. */
export const worldGameAudio = new GameAudioController({
  fight: BUNDLED_AUDIO_ASSETS[`./assets/${GAME_AUDIO_SOURCES.fight.fileName}`],
  victory: BUNDLED_AUDIO_ASSETS[`./assets/${GAME_AUDIO_SOURCES.victory.fileName}`],
  prepare: BUNDLED_AUDIO_ASSETS[`./assets/${GAME_AUDIO_SOURCES.prepare.fileName}`],
  active: BUNDLED_AUDIO_ASSETS[`./assets/${GAME_AUDIO_SOURCES.active.fileName}`],
  distress: BUNDLED_AUDIO_ASSETS[`./assets/${GAME_AUDIO_SOURCES.distress.fileName}`],
  loss: BUNDLED_AUDIO_ASSETS[`./assets/${GAME_AUDIO_SOURCES.loss.fileName}`],
  ambient: BUNDLED_AUDIO_ASSETS[`./assets/${GAME_AMBIENT_MUSIC.fileName}`],
});

// WorldUIV2 is imported during application bootstrap, before the country or
// multiplayer lobby can receive input. Arm once here so the very first trusted
// interaction starts the single fetch/decode pass, even when UI instances are
// later replaced between lobbies, scenarios or multiplayer snapshots.
if (typeof window !== 'undefined') worldGameAudio.mount();
