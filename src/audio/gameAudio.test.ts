import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BattleEventV2, WarOutcomeV2 } from '../sim/v2/types';
import {
  AI_ELIMINATION_DISTRESS_DURATION_SHARE,
  AI_ELIMINATION_DISTRESS_FADE_SECONDS,
  AI_FIGHT_GAIN_MAX,
  AI_FIGHT_MIN_FOCUS,
  AMBIENT_MUSIC_VOLUME,
  battleScreenFocus,
  DEFAULT_GAME_AUDIO_MIX,
  FIGHT_AUDIO_COOLDOWN_MS,
  FIGHT_AUDIO_MAX_OVERLAP,
  GameAudioController,
  GAME_AMBIENT_MUSIC,
  GAME_AUDIO_CREDITS,
  GAME_AUDIO_SETTINGS_STORAGE_KEY,
  GAME_AUDIO_SOURCES,
  PLAYER_LOSS_AUDIO_COOLDOWN_MS,
  PLAYER_FIGHT_GAIN_FAR,
  PLAYER_FIGHT_GAIN_NEAR,
  RADIO_AUDIO_MAX_OVERLAP,
  WAR_END_FIGHT_FADE_SECONDS,
} from './gameAudio';

class FakeSource {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;
  started = false;
  stoppedAt: number | undefined;
  connect(): void {}
  disconnect(): void {}
  start(): void { this.started = true; }
  stop(when?: number): void { this.stoppedAt = when; }
  finish(): void { this.onended?.(); }
}

class FakeGain {
  readonly automation: Array<{ kind: 'cancel' | 'set' | 'ramp'; value?: number; time: number }> = [];
  readonly gain = {
    value: 0,
    cancelScheduledValues: (time: number) => { this.automation.push({ kind: 'cancel', time }); },
    setValueAtTime: (value: number, time: number) => {
      this.gain.value = value;
      this.automation.push({ kind: 'set', value, time });
    },
    linearRampToValueAtTime: (value: number, time: number) => {
      this.gain.value = value;
      this.automation.push({ kind: 'ramp', value, time });
    },
  };
  connect(): void {}
  disconnect(): void {}
}

class FakeAudioContext {
  readonly destination = {};
  readonly state = 'suspended';
  currentTime = 10;
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];
  readonly decodedByteLengths: number[] = [];
  resumeCalls = 0;
  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  async decodeAudioData(data: ArrayBuffer): Promise<{ duration: number }> {
    this.decodedByteLengths.push(data.byteLength);
    const durations: Readonly<Record<number, number>> = {
      18: 18, 127: 1.267, 229: 2.293, 328: 3.28, 818: 8.184, 160: 1.602,
    };
    return { duration: durations[data.byteLength] ?? 0 };
  }
  async resume(): Promise<void> { this.resumeCalls += 1; }
}

class FakeAmbientAudio {
  src: string;
  preload = '';
  loop = false;
  volume = 1;
  currentTime = 12;
  playCalls = 0;
  pauseCalls = 0;
  loadCalls = 0;
  constructor(url: string) { this.src = url; }
  async play(): Promise<void> { this.playCalls += 1; }
  pause(): void { this.pauseCalls += 1; }
  removeAttribute(name: string): void { if (name === 'src') this.src = ''; }
  load(): void { this.loadCalls += 1; }
}

function battle(overrides: Partial<BattleEventV2> = {}): BattleEventV2 {
  return {
    warId: 'war-1', source: 'source', target: 'target', attacker: 'aaa', defender: 'bbb',
    sourceId: 'source', targetId: 'target', attackerId: 'aaa', defenderId: 'bbb',
    attackerLosses: 1, defenderLosses: 1, attackerPopulationLoss: 0,
    defenderPopulationLoss: 0, populationLoss: 0, economyLoss: 0,
    capturedPopulation: 0, capturedEconomy: 0, treasurySeized: 0, conquered: false,
    terrain: 'plains', tactic: 'assault', phase: 'assault', attackerPower: 1,
    defenderPower: 1, operation: 'balanced-advance', attackerSupply: 1,
    defenderSupply: 1, momentum: 0, supportingForces: 0, tick: 10,
    ...overrides,
  } as BattleEventV2;
}

function setup() {
  const interactionTarget = new EventTarget();
  const context = new FakeAudioContext();
  const fetches: string[] = [];
  const ambientPlayers: FakeAmbientAudio[] = [];
  let now = 1_000;
  const controller = new GameAudioController(
    {
      fight: '/fight.flac', victory: '/victory.wav', prepare: '/prepare.wav',
      active: '/active.wav', distress: '/distress.mp3', loss: '/loss.wav',
      ambient: '/ambient.wav',
    },
    {
      interactionTarget,
      now: () => now,
      fetchArrayBuffer: async (url) => {
        fetches.push(url);
        const byteLengths: Readonly<Record<string, number>> = {
          '/fight.flac': 18, '/victory.wav': 127, '/prepare.wav': 229,
          '/active.wav': 328, '/distress.mp3': 818, '/loss.wav': 160,
        };
        return new ArrayBuffer(byteLengths[url] ?? 0);
      },
      createAudioContext: () => context,
      createAmbientAudio: (url) => {
        const player = new FakeAmbientAudio(url);
        ambientPlayers.push(player);
        return player;
      },
    },
  );
  controller.mount();
  return {
    controller, context, fetches, ambientPlayers,
    activate: async () => {
      interactionTarget.dispatchEvent(new Event('pointerdown'));
      await controller.whenLoaded();
    },
    advance: (milliseconds: number) => { now += milliseconds; },
  };
}

function gitBlobSha(bytes: Uint8Array): string {
  const header = Buffer.from(`blob ${bytes.byteLength}\0`);
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function flacDurationSeconds(bytes: Uint8Array): number {
  expect(Buffer.from(bytes.subarray(0, 4)).toString('ascii')).toBe('fLaC');
  let streamInfo = 0n;
  for (const value of bytes.subarray(18, 26)) streamInfo = (streamInfo << 8n) | BigInt(value);
  const sampleRate = Number(streamInfo >> 44n);
  const totalSamples = Number(streamInfo & 0xfffffffffn);
  return totalSamples / sampleRate;
}

function wavDurationSeconds(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(Buffer.from(bytes.subarray(0, 4)).toString('ascii')).toBe('RIFF');
  expect(Buffer.from(bytes.subarray(8, 12)).toString('ascii')).toBe('WAVE');
  const byteRate = view.getUint32(28, true);
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunk = Buffer.from(bytes.subarray(offset, offset + 4)).toString('ascii');
    const size = view.getUint32(offset + 4, true);
    if (chunk === 'data') return size / byteRate;
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV data chunk is missing.');
}

describe('game audio presentation adapter', () => {
  it('starts one cached ambient loop at the 20% default and releases it on unmount', async () => {
    expect(AMBIENT_MUSIC_VOLUME).toBe(0.2);
    expect(DEFAULT_GAME_AUDIO_MIX.music).toBe(0.2);
    const { controller, ambientPlayers, activate } = setup();
    expect(ambientPlayers).toHaveLength(0);
    await activate();
    await activate();
    expect(ambientPlayers).toHaveLength(1);
    expect(ambientPlayers[0]).toMatchObject({
      src: '/ambient.wav',
      preload: 'auto',
      loop: true,
      volume: AMBIENT_MUSIC_VOLUME,
      playCalls: 1,
    });
    controller.unmount();
    expect(ambientPlayers[0]).toMatchObject({
      src: '', currentTime: 0, pauseCalls: 1, loadCalls: 1,
    });
  });

  it('persists independent music, effects and voice controls', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const first = new GameAudioController({}, { storage });
    first.setAudioChannelVolume('music', 0.35);
    first.setAudioChannelVolume('effects', 0.6);
    first.setAudioChannelVolume('voice', 0.45);
    expect(first.getAudioMix()).toEqual({ music: 0.35, effects: 0.6, voice: 0.45 });
    expect(JSON.parse(values.get(GAME_AUDIO_SETTINGS_STORAGE_KEY)!)).toEqual({
      music: 0.35, effects: 0.6, voice: 0.45,
    });
    const restored = new GameAudioController({}, { storage });
    expect(restored.getAudioMix()).toEqual({ music: 0.35, effects: 0.6, voice: 0.45 });
  });

  it('loads and decodes all six approved originals once, only after interaction', async () => {
    const { controller, context, fetches, activate } = setup();
    await controller.handleWorldChange({ reason: 'battle', battle: battle() });
    expect(fetches).toEqual([]);

    await activate();
    expect(fetches).toEqual([
      '/fight.flac', '/victory.wav', '/prepare.wav', '/active.wav', '/distress.mp3', '/loss.wav',
    ]);
    expect(context.decodedByteLengths).toEqual([18, 127, 229, 328, 818, 160]);
    expect(context.resumeCalls).toBe(1);

    await controller.handleWorldChange({ reason: 'battle', battle: battle() });
    await controller.handleWorldChange({ reason: 'battle', battle: battle({ tick: 11 }) });
    expect(fetches).toHaveLength(6);
    expect(context.decodedByteLengths).toHaveLength(6);
  });

  it('plays accepted land/naval battles through a capped pooled fight voice', async () => {
    const { controller, context, activate, advance } = setup();
    await activate();
    await controller.handleWorldChange(
      { reason: 'battle', battle: battle({ tick: 10 }) },
      { viewerPlayerId: 'aaa', humanPlayerIds: ['aaa'] },
    );
    expect(context.sources.map((source) => source.buffer?.duration)).toEqual([3.28, 18]);
    context.sources[0]!.finish();
    advance(FIGHT_AUDIO_COOLDOWN_MS);
    await controller.handleWorldChange(
      { reason: 'battle', battle: battle({ tick: 11, operation: 'naval-invasion' }) },
      { viewerPlayerId: 'aaa', humanPlayerIds: ['aaa'] },
    );
    advance(FIGHT_AUDIO_COOLDOWN_MS);
    await controller.handleWorldChange(
      { reason: 'battle', battle: battle({ tick: 12 }) },
      { viewerPlayerId: 'aaa', humanPlayerIds: ['aaa'] },
    );
    const fights = context.sources.filter((source) => source.buffer?.duration === 18);
    expect(fights).toHaveLength(FIGHT_AUDIO_MAX_OVERLAP);
    expect(fights.every((source) => source.started)).toBe(true);
  });

  it('deduplicates simultaneous battle pulses with the short cooldown', async () => {
    const { controller, context, activate, advance } = setup();
    await activate();
    const ai = { viewerPlayerId: 'viewer', humanPlayerIds: ['viewer'], battleFocus: 1 };
    await controller.handleWorldChange({ reason: 'battle', battle: battle({ tick: 10 }) }, ai);
    await controller.handleWorldChange({ reason: 'battle', battle: battle({ tick: 10 }) }, ai);
    advance(FIGHT_AUDIO_COOLDOWN_MS - 1);
    await controller.handleWorldChange({ reason: 'battle', battle: battle({ tick: 11 }) }, ai);
    expect(context.sources).toHaveLength(1);
  });

  it('uses the victory recording only once at a fully won war outcome', async () => {
    const { controller, context, activate, advance } = setup();
    await activate();
    const player = { viewerPlayerId: 'aaa', humanPlayerIds: ['aaa'] };
    await controller.handleWorldChange({ reason: 'battle', battle: battle() }, player);
    expect(context.sources.map((source) => source.buffer?.duration)).toEqual([3.28, 18]);
    context.sources[0]!.finish();
    context.sources[1]!.finish();

    advance(FIGHT_AUDIO_COOLDOWN_MS);
    await controller.handleWorldChange({ reason: 'conquest', battle: battle({ conquered: true, tick: 11 }) }, player);
    expect(context.sources.map((source) => source.buffer?.duration)).toEqual([3.28, 18, 18]);
    context.sources[2]!.finish();
    await controller.handleWorldChange({
      reason: 'war-outcome',
      warOutcome: {
        warId: 'war-2', endedTick: 20, result: 'victory', humanId: 'aaa',
      } as WarOutcomeV2,
    }, player);
    expect(context.sources.at(-1)?.buffer?.duration).toBe(1.267);

    context.sources.at(-1)!.finish();
    await controller.handleWorldChange({
      reason: 'war-outcome',
      warOutcome: {
        warId: 'war-2', endedTick: 20, result: 'victory', humanId: 'aaa',
      } as WarOutcomeV2,
    }, { viewerPlayerId: 'aaa' });
    expect(context.sources.filter((source) => source.buffer?.duration === 1.267)).toHaveLength(1);
  });

  it('softly fades only the concluded war combat voice', async () => {
    const { controller, context, activate, advance } = setup();
    await activate();
    const player = { viewerPlayerId: 'aaa', humanPlayerIds: ['aaa'] };
    await controller.handleWorldChange(
      { reason: 'battle', battle: battle({ warId: 'war-ending', tick: 20 }) },
      player,
    );
    context.sources[0]!.finish();
    advance(FIGHT_AUDIO_COOLDOWN_MS);
    await controller.handleWorldChange(
      { reason: 'battle', battle: battle({ warId: 'war-continuing', tick: 21 }) },
      player,
    );

    await controller.handleWorldChange({
      reason: 'war-outcome',
      warOutcome: {
        warId: 'war-ending', endedTick: 22, result: 'territorial-gain', humanId: 'aaa',
      } as WarOutcomeV2,
    }, player);

    expect(context.gains[0]!.automation.at(-1)).toEqual({
      kind: 'ramp', value: 0, time: context.currentTime + WAR_END_FIGHT_FADE_SECONDS,
    });
    expect(context.sources[1]!.stoppedAt)
      .toBeCloseTo(context.currentTime + WAR_END_FIGHT_FADE_SECONDS + 0.05, 4);
    expect(context.sources[2]!.stoppedAt).toBeUndefined();
  });

  it('attenuates player battles by screen focus without mutating the source asset', async () => {
    const { controller, context, activate, advance } = setup();
    await activate();
    await controller.handleWorldChange(
      { reason: 'battle', battle: battle({ tick: 20 }) },
      { viewerPlayerId: 'aaa', battleFocus: 1 },
    );
    expect(context.sources.map((source) => source.buffer?.duration)).toEqual([3.28, 18]);
    const nearGain = context.gains[0]!.gain.value;
    expect(nearGain).toBeCloseTo(PLAYER_FIGHT_GAIN_NEAR, 4);
    context.sources[0]!.finish();
    context.sources[1]!.finish();

    advance(FIGHT_AUDIO_COOLDOWN_MS);
    await controller.handleWorldChange(
      { reason: 'battle', battle: battle({ tick: 21 }) },
      { viewerPlayerId: 'aaa', battleFocus: 0 },
    );
    expect(context.gains[0]!.gain.value).toBeCloseTo(PLAYER_FIGHT_GAIN_FAR, 4);
    expect(context.sources[2]!.buffer?.duration).toBe(18);
    expect(context.gains[0]!.gain.value).toBeLessThan(nearGain);
  });

  it('keeps AI wars silent unless centred, very quiet, and limited to one voice', async () => {
    const { controller, context, activate, advance } = setup();
    await activate();
    const aiBattle = (tick: number) => battle({
      tick, attackerId: 'ccc', defenderId: 'ddd', attacker: 'ccc', defender: 'ddd',
    });

    await controller.handleWorldChange(
      { reason: 'battle', battle: aiBattle(30) },
      { viewerPlayerId: 'aaa', battleFocus: AI_FIGHT_MIN_FOCUS - 0.01 },
    );
    expect(context.sources).toHaveLength(0);

    await controller.handleWorldChange(
      { reason: 'battle', battle: aiBattle(31) },
      { viewerPlayerId: 'aaa', battleFocus: 1 },
    );
    expect(context.sources).toHaveLength(1);
    expect(context.gains[0]!.gain.value).toBeCloseTo(AI_FIGHT_GAIN_MAX, 4);

    advance(FIGHT_AUDIO_COOLDOWN_MS);
    await controller.handleWorldChange(
      { reason: 'battle', battle: aiBattle(32) },
      { viewerPlayerId: 'aaa', battleFocus: 1 },
    );
    expect(context.sources).toHaveLength(1);

    context.sources[0]!.finish();
    await controller.handleWorldChange(
      { reason: 'battle', battle: aiBattle(33) },
      { viewerPlayerId: 'aaa', battleFocus: 1 },
    );
    expect(context.sources).toHaveLength(2);
    expect(context.gains[0]!.gain.value).toBeLessThan(PLAYER_FIGHT_GAIN_FAR);
  });

  it('never plays victory for a different viewer or a non-victory conclusion', async () => {
    const { controller, context, activate } = setup();
    await activate();
    await controller.handleWorldChange({
      reason: 'war-outcome',
      warOutcome: {
        warId: 'war-other', endedTick: 50, result: 'victory', humanId: 'bbb',
      } as WarOutcomeV2,
    }, { viewerPlayerId: 'aaa' });
    await controller.handleWorldChange({
      reason: 'war-outcome',
      warOutcome: {
        warId: 'war-gain', endedTick: 51, result: 'territorial-gain', humanId: 'aaa',
      } as WarOutcomeV2,
    }, { viewerPlayerId: 'aaa' });
    expect(context.sources).toHaveLength(0);
  });

  it('plays prepare, GO and first combat immediately without a shared queue', async () => {
    const { controller, context, activate } = setup();
    await activate();
    await controller.handlePlayerWarPrepared('aaa', 'bbb', 'declare-1');
    expect(context.sources.map((source) => source.buffer?.duration)).toEqual([2.293]);

    await controller.handleWorldChange(
      { reason: 'battle', battle: battle({ warId: 'war-prepared', tick: 40 }) },
      { viewerPlayerId: 'aaa', humanPlayerIds: ['aaa'] },
    );
    expect(context.sources.map((source) => source.buffer?.duration)).toEqual([2.293, 3.28, 18]);
    expect(context.sources.every((source) => source.started)).toBe(true);
  });

  it('caps radio overlap without queueing a third line for later playback', async () => {
    const { controller, context, activate } = setup();
    await activate();
    await controller.handlePlayerWarPrepared('aaa', 'bbb', 'declare-pool');
    await controller.handleWorldChange(
      { reason: 'battle', battle: battle({ warId: 'war-pool', tick: 41 }) },
      { viewerPlayerId: 'aaa', humanPlayerIds: ['aaa'] },
    );
    expect(context.sources.filter((source) => source.buffer?.duration !== 18))
      .toHaveLength(RADIO_AUDIO_MAX_OVERLAP);

    await controller.handleWorldChange({
      reason: 'war-outcome',
      warOutcome: {
        warId: 'war-pool', endedTick: 42, result: 'victory', humanId: 'aaa',
      } as WarOutcomeV2,
    }, { viewerPlayerId: 'aaa' });
    expect(context.sources.filter((source) => source.buffer?.duration === 1.267)).toHaveLength(0);

    context.sources.find((source) => source.buffer?.duration === 2.293)!.finish();
    expect(context.sources.filter((source) => source.buffer?.duration === 1.267)).toHaveLength(0);
  });

  it('keeps elimination cues mutually exclusive for local players and AI-only wars', async () => {
    const { controller, context, activate, advance } = setup();
    await activate();
    await controller.handleWorldChange(
      { reason: 'nation-defeated', victorId: 'ccc', defeatedId: 'ddd' },
      { viewerPlayerId: 'aaa', humanPlayerIds: ['aaa'] },
    );
    expect(context.sources.map((source) => source.buffer?.duration)).toEqual([8.184]);
    const distressDuration = GAME_AUDIO_SOURCES.distress.durationSeconds
      * AI_ELIMINATION_DISTRESS_DURATION_SHARE;
    const distressGain = context.gains[FIGHT_AUDIO_MAX_OVERLAP]!;
    expect(distressGain.automation.at(-2)).toEqual({
      kind: 'set', value: 1,
      time: context.currentTime + distressDuration - AI_ELIMINATION_DISTRESS_FADE_SECONDS,
    });
    expect(distressGain.automation.at(-1)).toEqual({
      kind: 'ramp', value: 0, time: context.currentTime + distressDuration,
    });
    expect(context.sources[0]!.stoppedAt).toBeCloseTo(
      context.currentTime + distressDuration + 0.02,
      4,
    );
    context.sources[0]!.finish();

    await controller.handleWorldChange(
      { reason: 'nation-defeated', victorId: 'aaa', defeatedId: 'eee' },
      { viewerPlayerId: 'aaa', humanPlayerIds: ['aaa'] },
    );
    expect(context.sources).toHaveLength(1);

    advance(PLAYER_LOSS_AUDIO_COOLDOWN_MS);
    await controller.handleWorldChange(
      { reason: 'nation-defeated', victorId: 'ccc', defeatedId: 'aaa' },
      { viewerPlayerId: 'aaa', humanPlayerIds: ['aaa'] },
    );
    expect(context.sources.map((source) => source.buffer?.duration)).toEqual([8.184, 1.602]);
    expect(context.sources.filter((source) => source.buffer?.duration === 8.184)).toHaveLength(1);
  });

  it('uses the loss cry only for a confirmed local defensive conquest and deduplicates elimination', async () => {
    const { controller, context, activate, advance } = setup();
    await activate();
    const presentation = { viewerPlayerId: 'bbb', humanPlayerIds: ['bbb'] };
    await controller.handleWorldChange(
      { reason: 'battle', battle: battle({ warId: 'war-loss', tick: 60 }) },
      presentation,
    );
    expect(context.sources.map((source) => source.buffer?.duration)).toEqual([3.28, 18]);
    context.sources[0]!.finish();
    context.sources[1]!.finish();

    advance(FIGHT_AUDIO_COOLDOWN_MS);
    await controller.handleWorldChange(
      { reason: 'conquest', battle: battle({ warId: 'war-loss', tick: 61, conquered: true }) },
      presentation,
    );
    expect(context.sources.some((source) => source.buffer?.duration === 1.602)).toBe(true);
    const lossCount = context.sources.filter((source) => source.buffer?.duration === 1.602).length;
    await controller.handleWorldChange(
      { reason: 'nation-defeated', victorId: 'aaa', defeatedId: 'bbb' },
      presentation,
    );
    expect(context.sources.filter((source) => source.buffer?.duration === 1.602)).toHaveLength(lossCount);
  });

  it('resets event deduplication without scheduling deferred combat', async () => {
    const { controller, context, activate } = setup();
    await activate();
    await controller.handleWorldChange(
      { reason: 'battle', battle: battle({ warId: 'war-reset', tick: 70 }) },
      { viewerPlayerId: 'aaa', humanPlayerIds: ['aaa'] },
    );
    expect(context.sources.map((source) => source.buffer?.duration)).toEqual([3.28, 18]);
    controller.resetSession();
    context.sources.forEach((source) => source.finish());
    await controller.handleWorldChange(
      { reason: 'battle', battle: battle({ warId: 'war-reset', tick: 70 }) },
      { viewerPlayerId: 'aaa', humanPlayerIds: ['aaa'] },
    );
    expect(context.sources.map((source) => source.buffer?.duration)).toEqual([3.28, 18, 3.28, 18]);
  });

  it('derives focus from visible screen-space battle anchors', () => {
    expect(battleScreenFocus([], 1_000, 800)).toBe(0);
    expect(battleScreenFocus([{ x: 500, y: 400 }], 1_000, 800)).toBe(1);
    expect(battleScreenFocus([{ x: 0, y: 0 }], 1_000, 800)).toBeCloseTo(0, 4);
    expect(battleScreenFocus([undefined, { x: 500, y: 400 }], 1_000, 800)).toBe(1);
  });

  it('stays inert rather than substituting previews when originals are absent', async () => {
    const interactionTarget = new EventTarget();
    let fetchCount = 0;
    const controller = new GameAudioController({}, {
      interactionTarget,
      fetchArrayBuffer: async () => {
        fetchCount += 1;
        return new ArrayBuffer(0);
      },
    });
    controller.mount();
    interactionTarget.dispatchEvent(new Event('keydown'));
    await controller.handleWorldChange({ reason: 'conquest', battle: battle({ conquered: true }) });
    expect(controller.available).toBe(false);
    expect(fetchCount).toBe(0);
  });

  it('keeps the required attribution wording and canonical links', () => {
    expect(GAME_AUDIO_CREDITS).toHaveLength(6);
    expect(GAME_AUDIO_SOURCES.victory.sourceUrl).toBe('https://freesound.org/people/twisterman/sounds/163626/');
    expect(GAME_AUDIO_SOURCES.victory.licenseUrl).toBe('https://creativecommons.org/licenses/by/3.0/');
    expect(JSON.stringify(GAME_AUDIO_CREDITS)).not.toContain('chripei');
    expect(JSON.stringify(GAME_AUDIO_CREDITS)).not.toContain('165492');
  });

  it('ships the exact full approved binaries', () => {
    const fight = readFileSync(new URL('./assets/Distant Tank Shots.flac', import.meta.url));
    const victory = readFileSync(new URL('./assets/163626__twisterman__radio-chatter-enemy-down.wav', import.meta.url));
    const prepare = readFileSync(new URL('./assets/106314__timkahn__target-acquired.wav', import.meta.url));
    const active = readFileSync(new URL('./assets/276859__nidal8585__go-go-go.wav', import.meta.url));
    const distress = readFileSync(new URL('./assets/347586__matteusnova__radio_alarm_distress_signal.mp3', import.meta.url));
    const loss = readFileSync(new URL('./assets/417539__theuncertainman__warrior-death-cry-british-male.wav', import.meta.url));
    const ambient = readFileSync(new URL('./assets/war-room-drift-ambient.wav', import.meta.url));
    expect(fight.byteLength).toBe(906_472);
    expect(victory.byteLength).toBe(223_710);
    expect(prepare.byteLength).toBe(404_668);
    expect(active.byteLength).toBe(584_512);
    expect(distress.byteLength).toBe(264_226);
    expect(loss.byteLength).toBe(615_320);
    expect(ambient.byteLength).toBe(6_387_488);
    expect(gitBlobSha(fight)).toBe('329419c71ceb7c7433968c79b5ba989d14183959');
    expect(flacDurationSeconds(fight)).toBe(18);
    expect(wavDurationSeconds(victory)).toBeCloseTo(1.267, 2);
    expect(wavDurationSeconds(prepare)).toBeCloseTo(2.293, 2);
    expect(wavDurationSeconds(active)).toBeCloseTo(3.28, 2);
    expect(wavDurationSeconds(loss)).toBeCloseTo(1.602, 2);
    expect(wavDurationSeconds(ambient)).toBeCloseTo(GAME_AMBIENT_MUSIC.durationSeconds, 2);
    expect(new DataView(ambient.buffer, ambient.byteOffset, ambient.byteLength).getUint16(22, true)).toBe(1);
    expect(new DataView(ambient.buffer, ambient.byteOffset, ambient.byteLength).getUint32(24, true)).toBe(22_050);
    expect(Buffer.from(distress.subarray(0, 3)).toString('ascii')).toBe('ID3');
    expect(existsSync(new URL('./assets/VICTORY CRY REVERB 1.wav', import.meta.url))).toBe(false);
  });
});
