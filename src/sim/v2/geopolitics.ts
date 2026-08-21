import type { PlayerId } from './types';

/**
 * Directional, deliberately bounded strategic interests. These are nudges in
 * the normal target score, never orders, claims, war gates or scripted events.
 */
const STRATEGIC_INTERESTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  rus: {
    ukr: 22, geo: 18, kaz: 14, mda: 13, arm: 12, aze: 10,
    uzb: 9, tkm: 8, kgz: 8, tjk: 7, est: 5, lva: 5, ltu: 5,
  },
  chn: { twn: 24, mng: 11, vnm: 9, phl: 8, btn: 7, jpn: 6, kor: 4 },
  usa: { grl: 19, cub: 8 },
  prk: { kor: 24, jpn: 7 },
  kor: { prk: 19 },
  ind: { pak: 20, bgd: 5, lka: 4 },
  pak: { ind: 20, afg: 6 },
  tur: { syr: 10, irq: 6, arm: 6, cyp: 5, grc: 4 },
  irn: { isr: 17, irq: 7, sau: 6, aze: 5 },
  isr: { psx: 22, lbn: 11, syr: 9, irn: 8 },
  sau: { yem: 9, irn: 7 },
};

/** Positive values mean cooperation is more plausible; negative values mean rivalry. */
const STRATEGIC_ALIGNMENTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  prk: { rus: 14, chn: 9, kor: -18, jpn: -10, usa: -10 },
  rus: { prk: 14, blr: 16, chn: 10, ukr: -16, geo: -9 },
  chn: { rus: 10, prk: 9, twn: -18, usa: -7, jpn: -7 },
  usa: { can: 12, gbr: 12, jpn: 11, kor: 11, aus: 10, chn: -7, prk: -10 },
  kor: { usa: 11, jpn: 8, prk: -18 },
  jpn: { usa: 11, kor: 8, prk: -10, chn: -7 },
  blr: { rus: 16 },
};

export function strategicInterestScoreV2(attackerId: PlayerId, targetId: PlayerId): number {
  return STRATEGIC_INTERESTS[attackerId]?.[targetId] ?? 0;
}

export function strategicAlignmentScoreV2(leftId: PlayerId, rightId: PlayerId): number {
  const direct = STRATEGIC_ALIGNMENTS[leftId]?.[rightId];
  if (direct !== undefined) return direct;
  return STRATEGIC_ALIGNMENTS[rightId]?.[leftId] ?? 0;
}

/** Target-score guidance combines directional interests with soft alliance friction. */
export function geopoliticalTargetGuidanceV2(attackerId: PlayerId, targetId: PlayerId): number {
  const interest = strategicInterestScoreV2(attackerId, targetId);
  const alignment = strategicAlignmentScoreV2(attackerId, targetId);
  return interest - 2.0 * Math.max(0, alignment) + 0.40 * Math.max(0, -alignment);
}

/**
 * Seeded strategic uncertainty keeps geopolitics replayable while preserving
 * exact deterministic saves/replays for a given campaign seed.
 */
export function campaignStrategicVariationV2(
  seed: number,
  tick: number,
  attackerId: PlayerId,
  targetId: PlayerId,
): number {
  let hash = (seed ^ Math.imul(Math.floor(tick / 8) + 1, 0x9e3779b1)) >>> 0;
  const key = `${attackerId}>${targetId}`;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 0x85ebca6b) >>> 0;
    hash ^= hash >>> 13;
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0xc2b2ae35) >>> 0;
  return (hash / 0xffff_ffff - 0.5) * 20;
}
