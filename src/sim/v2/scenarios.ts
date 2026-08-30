import { normalizeSeed } from '../../game/random';
import { V2_CONTENT_VERSION } from './balance';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import {
  LEGACY_RANDOM_WORLD_GENERATOR_VERSION_V2,
  RANDOM_WORLD_GENERATOR_VERSION_V2,
  createRandomWorldContentV2,
  randomWorldContentVersionV2,
} from './randomWorld';

export type GameModeV2 = 'standard-2026' | 'random-world' | 'survival';

export interface ScenarioConfigV2 {
  mode: GameModeV2;
  version: number;
  seed: number;
}

export interface ResolvedScenarioV2 {
  config: ScenarioConfigV2;
  content: WorldContentV2;
}

export const STANDARD_SCENARIO_VERSION_V2 = 1;
export const SURVIVAL_SCENARIO_VERSION_V2 = 1;
const LEGACY_STANDARD_CONTENT_VERSION_V2 = 'natural-earth-countries-2026-v7-greenland';

export function survivalContentVersionV2(version = SURVIVAL_SCENARIO_VERSION_V2): string {
  return `survival-v${version}@${V2_CONTENT_VERSION}`;
}

function createSurvivalWorldContentV2(version: number): WorldContentV2 {
  return Object.freeze({
    ...WORLD_CONTENT_V2,
    metadata: Object.freeze({
      ...WORLD_CONTENT_V2.metadata!,
      scenarioId: 'survival' as const,
      scenarioVersion: version,
      contentVersion: survivalContentVersionV2(version),
      startYear: 2096,
    }),
  });
}

type ScenarioConfigInputV2 = Omit<ScenarioConfigV2, 'version'> & { version?: number };
type SaveHeaderInputV2 = string | { readonly contentVersion?: unknown; readonly seed?: unknown };

export function normalizeScenarioConfigV2(input: ScenarioConfigInputV2): ScenarioConfigV2 {
  if (input.mode !== 'standard-2026' && input.mode !== 'random-world' && input.mode !== 'survival') {
    throw new Error(`Unsupported game mode: ${String(input.mode)}.`);
  }
  const version = input.version ?? (input.mode === 'random-world'
    ? RANDOM_WORLD_GENERATOR_VERSION_V2
    : input.mode === 'survival'
      ? SURVIVAL_SCENARIO_VERSION_V2
      : STANDARD_SCENARIO_VERSION_V2);
  const supportedVersion = input.mode === 'random-world'
    ? version === LEGACY_RANDOM_WORLD_GENERATOR_VERSION_V2
      || version === RANDOM_WORLD_GENERATOR_VERSION_V2
    : input.mode === 'survival'
      ? version === SURVIVAL_SCENARIO_VERSION_V2
      : version === STANDARD_SCENARIO_VERSION_V2;
  if (!Number.isInteger(version) || !supportedVersion) {
    const label = input.mode === 'random-world' ? 'Alternative Universe'
      : input.mode === 'standard-2026' ? 'Campaign' : 'Survival';
    throw new Error(`Unsupported ${label} scenario version ${String(version)}.`);
  }
  return { mode: input.mode, version, seed: normalizeSeed(input.seed) };
}

export function resolveScenarioV2(input: ScenarioConfigInputV2): ResolvedScenarioV2 {
  const config = normalizeScenarioConfigV2(input);
  return {
    config,
    content: config.mode === 'standard-2026'
      ? WORLD_CONTENT_V2
      : config.mode === 'survival'
        ? createSurvivalWorldContentV2(config.version)
        : createRandomWorldContentV2(config.seed, config.version),
  };
}

/** Canonical content identity used by state creation, save validation and replicas. */
export function contentVersionForWorldContentV2(content: WorldContentV2): string {
  return content.metadata?.contentVersion ?? V2_CONTENT_VERSION;
}

/** Reads only the self-describing save header. Authentication remains loadSaveV2's job. */
export function scenarioConfigFromSaveHeaderV2(input: SaveHeaderInputV2): ScenarioConfigV2 {
  let header: { readonly contentVersion?: unknown; readonly seed?: unknown };
  try {
    header = typeof input === 'string' ? JSON.parse(input) as typeof header : input;
  } catch {
    throw new Error('V2 save is not valid JSON.');
  }
  if (!header || typeof header !== 'object' || !Number.isFinite(header.seed)) {
    throw new Error('V2 save scenario header is invalid.');
  }
  const stateSeed = normalizeSeed(Number(header.seed));
  if (header.contentVersion === V2_CONTENT_VERSION
    || header.contentVersion === LEGACY_STANDARD_CONTENT_VERSION_V2) {
    return { mode: 'standard-2026', version: STANDARD_SCENARIO_VERSION_V2, seed: stateSeed };
  }
  if (typeof header.contentVersion !== 'string') {
    throw new Error('V2 save contentVersion is missing.');
  }
  if (header.contentVersion === survivalContentVersionV2()) {
    return {
      mode: 'survival',
      version: SURVIVAL_SCENARIO_VERSION_V2,
      seed: stateSeed,
    };
  }
  const match = /^random-world-v(\d+)@(.+):seed-(\d+)$/.exec(header.contentVersion);
  if (!match) throw new Error(`Unsupported V2 contentVersion: ${header.contentVersion}.`);
  const version = Number(match[1]);
  const baseContentVersion = match[2];
  const generatedSeed = normalizeSeed(Number(match[3]));
  if (baseContentVersion !== V2_CONTENT_VERSION
    && baseContentVersion !== LEGACY_STANDARD_CONTENT_VERSION_V2) {
    throw new Error(`Unsupported V2 contentVersion: ${header.contentVersion}.`);
  }
  const canonicalIdentity = baseContentVersion === V2_CONTENT_VERSION
    ? randomWorldContentVersionV2(generatedSeed, version)
    : `random-world-v${version}@${LEGACY_STANDARD_CONTENT_VERSION_V2}:seed-${generatedSeed}`;
  if (header.contentVersion !== canonicalIdentity) {
    throw new Error('Alternative Universe save scenario header is non-canonical.');
  }
  if (stateSeed !== generatedSeed) {
    throw new Error('Alternative Universe save seed does not match its generated content identity.');
  }
  return normalizeScenarioConfigV2({ mode: 'random-world', version, seed: generatedSeed });
}

export function scenarioConfigFromEngineV2(engine: {
  readonly content: WorldContentV2;
  readonly state: { readonly seed: number };
}): ScenarioConfigV2 {
  const metadata = engine.content.metadata;
  if (!metadata) throw new Error('Engine content has no scenario metadata.');
  const seed = metadata.generatedFromSeed ?? engine.state.seed;
  return normalizeScenarioConfigV2({
    mode: metadata.scenarioId,
    version: metadata.scenarioVersion,
    seed,
  });
}
