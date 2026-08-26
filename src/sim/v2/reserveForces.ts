import { clamp, round } from './balance';
import type { WorldContentV2 } from './content';

/**
 * Public 2025 reserve-personnel estimates, expressed in millions.
 *
 * The largest contemporary pools use Global Firepower's 2025 table as
 * reproduced by Worldostats. The remaining non-zero observations use the
 * public country table compiled from IISS Military Balance figures. National
 * definitions vary, so these are scenario anchors rather than exact strength
 * claims. The simulation subsequently applies its own common readiness cap.
 *
 * Sources (retrieved 2026-08-23):
 * https://worldostats.com/country-stats/reserve-military-by-country/
 * https://en.wikipedia.org/wiki/List_of_countries_by_number_of_military_and_paramilitary_personnel
 * Primary posture/readiness cross-checks:
 * https://www.defmin.fi/files/6009/Climate_Strategy_of_the_Finnish_Defence_2024.pdf
 * https://www.defense.gov/News/Transcripts/Transcript/Article/3704566/army-officials-hold-a-press-briefing-on-president-bidens-fiscal-2025-army-budget/
 * https://www.mindef.gov.sg/news-and-events/latest-releases/13jan26-pq2/
 * https://www.mnd.gov.tw/InformationServices/QDRFile/6/2/2025QDR%E8%8B%B1%E6%96%87%E7%89%88.pdf
 * https://www.nato.int/en/what-we-do/operations-and-missions/reserve-forces
 */
const REPORTED_TRAINED_RESERVES_MILLIONS: Readonly<Partial<Record<string, number>>> = Object.freeze({
  arm: 0.210,
  aus: 0.02145,
  aut: 0.1092,
  aze: 0.330,
  bel: 0.0059,
  bgr: 0.003,
  bih: 0.006,
  blr: 0.2895,
  blz: 0.00085,
  bra: 1.340,
  brn: 0.0007,
  btn: 0.060,
  can: 0.0291,
  che: 0.19645,
  chl: 0.0191,
  chn: 0.510,
  col: 0.03495,
  cub: 0.039,
  cyp: 0.060,
  deu: 0.0341,
  dnk: 0.0442,
  dza: 0.150,
  ecu: 0.118,
  egy: 0.479,
  esp: 0.0138,
  est: 0.0412,
  fin: 0.254,
  fra: 0.0381,
  gbr: 0.07045,
  grc: 0.22135,
  gtm: 0.06385,
  guy: 0.00067,
  hnd: 0.060,
  hrv: 0.0021,
  hun: 0.020,
  idn: 0.400,
  ind: 1.155,
  irl: 0.00405,
  irn: 0.350,
  isr: 0.465,
  ita: 0.0145,
  jam: 0.00258,
  jor: 0.065,
  jpn: 0.0559,
  kor: 3.100,
  kwt: 0.0237,
  lka: 0.0055,
  ltu: 0.01295,
  lva: 0.016,
  mar: 0.150,
  mda: 0.058,
  mex: 0.0815,
  mkd: 0.00485,
  mne: 0.0028,
  mng: 0.137,
  mys: 0.0536,
  nld: 0.00635,
  nor: 0.040,
  nzl: 0.00327,
  pak: 0.550,
  per: 0.188,
  phl: 1.400,
  pol: 0.0375,
  prk: 0.600,
  prt: 0.2117,
  pry: 0.1645,
  rou: 0.055,
  rus: 2.000,
  sgp: 0.2525,
  slv: 0.0099,
  srb: 0.05015,
  svn: 0.00095,
  swe: 0.0215,
  tha: 0.200,
  tjk: 0.020,
  tur: 0.3787,
  twn: 1.657,
  tza: 0.080,
  uga: 0.010,
  ukr: 2.500,
  usa: 0.7995,
  ven: 0.008,
  vnm: 5.000,
  zaf: 0.01505,
  zmb: 0.003,
});

/**
 * A country with no separately reported reserve still begins with a small
 * trained mobilisation cadre. This fulfils the all-country game rule without
 * treating police, untrained manpower or a missing observation as soldiers.
 */
export const INITIAL_RESERVE_CADRE_CAPACITY_SHARE_V2 = 0.02;

/**
 * Published pools often include former conscripts with very different recall
 * readiness. Only this common share enters the scenario as immediately
 * trained personnel; the rest remains outside the game's short war horizon.
 */
export const INITIAL_REPORTED_RESERVE_READY_SHARE_V2 = 0.55;
export const BELGIUM_OPENING_RESERVE_CAPACITY_SHARE_V2 = 0.35;

/** Real-world anchor, fitted into the shared 1x active-cap reserve rule. */
export function initialTrainedReserveManpowerV2(
  countryId: string,
  activeCapacity: number,
  content?: WorldContentV2,
): number {
  const capacity = Math.max(0, activeCapacity);
  if (capacity <= 0) return 0;
  // Random/custom scenarios derive reserves from their generated military
  // structure. They must never leak the real-country ID lookup above.
  if (content && content.metadata?.reserveProfile !== 'reported-2026') {
    const nation = content.nations[countryId as keyof typeof content.nations];
    if (!nation) return round(capacity * INITIAL_RESERVE_CADRE_CAPACITY_SHARE_V2, 9);
    const defenceBurden = nation.real.defenceSpending / Math.max(0.000001, nation.real.gdp);
    const burdenPosition = clamp((defenceBurden - 0.008) / (0.08 - 0.008), 0, 1);
    const reserveShare = clamp(
      0.04 + 0.42 * burdenPosition + 0.18 * clamp(nation.ambition, 0, 1),
      INITIAL_RESERVE_CADRE_CAPACITY_SHARE_V2,
      0.64,
    );
    return round(capacity * reserveShare, 9);
  }
  if (countryId === 'bel') {
    return round(capacity * BELGIUM_OPENING_RESERVE_CAPACITY_SHARE_V2, 9);
  }
  const reportedReady = Math.max(0, REPORTED_TRAINED_RESERVES_MILLIONS[countryId] ?? 0)
    * INITIAL_REPORTED_RESERVE_READY_SHARE_V2;
  const cadre = capacity * INITIAL_RESERVE_CADRE_CAPACITY_SHARE_V2;
  return round(clamp(Math.max(reportedReady, cadre), 0, capacity), 9);
}
