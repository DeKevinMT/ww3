import type {
  BudgetPolicyV2,
  ResearchAllocationsV2,
  ResearchBranchV2,
  ResearchEffectV2,
  ResearchProgressByBranchV2,
  TerrainType,
} from './types';

export const V2_RULES_VERSION = 'frontier-command-v2.81-parallel-research';
export const V2_CONTENT_VERSION = 'natural-earth-countries-2026-v8-antarctica-survival';
export const V2_MAP_ID = 'natural-earth-countries-2026';
/** One authoritative simulation tick advances the visible world by one day. */
export const V2_CALENDAR_DAYS_PER_TICK = 1;
export const V2_CALENDAR_DAYS_PER_YEAR = 365;
export const V2_TICK_DURATION_MS = 1_000;
export const V2_MAX_CATCH_UP_TICKS = 8;

export const RAPID_RECRUITMENT_COOLDOWN_TICKS = 104;
/** Emergency peacetime recruiting is priced per million soldiers before ATK/DEF quality. */
export const RAPID_RECRUITMENT_COST_MULTIPLIER = 400;
/** A targeted Research Surge is a rare four-year national effort. */
export const RESEARCH_SURGE_COOLDOWN_TICKS = 208;
/** One costly push advances exactly one chosen national research program. */
export const RESEARCH_SURGE_PROGRESS_WEEKS = 52;
/** A Surge consumes more than half a year of structural public revenue before empire scaling. */
export const RESEARCH_SURGE_COST_REVENUE_WEEKS = 8;
export const RESEARCH_SURGE_TERRITORY_SCALE = 0.12;
export const RESEARCH_SURGE_POPULATION_SCALE = 0.08;
/** A manual information campaign is a major national investment, not an instant diplomacy button. */
export const PROPAGANDA_DURATION_TICKS = 52;
export const PROPAGANDA_COOLDOWN_TICKS = 104;
export const PROPAGANDA_COST_REVENUE_WEEKS = 10;
export const PROPAGANDA_MIN_COST_BILLIONS = 0.25;
export const PROPAGANDA_TERRITORY_LOG_SCALE = 0.18;
export const PROPAGANDA_POPULATION_LOG_SCALE = 0.08;
export const PROPAGANDA_TOTAL_SUSPICION_REDUCTION = 18;
/** Manual buttons use an opening-country quote and scale only with prior uses. */
export const MANUAL_ACTION_BASE_DISCOUNT = 0.85;
export const MANUAL_RAPID_RECRUITMENT_COST_GROWTH = 1.25;
export const MANUAL_RESEARCH_SURGE_COST_GROWTH = 1.30;
export const MANUAL_PROPAGANDA_COST_GROWTH = 1.35;
/** Healthy countries preserve their whole trained army and always rebuild toward full capacity. */
export const AI_HEALTHY_ARMY_TARGET = 1;
export const AI_SEVERE_DEBT_REVENUE_WEEKS = 26;
/** A one-week overdraft remains a recoverable liquidity event rather than a systemic crisis. */
export const DEBT_RECOVERY_GRACE_REVENUE_WEEKS = 1;
/** A full year of ordinary revenue in debt marks the critical end of the progressive curve. */
export const DEBT_CRITICAL_REVENUE_WEEKS = 52;
/** Existing debt starts accruing a small carrying premium only after two revenue-weeks. */
export const DEBT_CARRYING_PREMIUM_START_REVENUE_WEEKS = 2;
export const DEBT_CARRYING_PREMIUM_FULL_REVENUE_WEEKS = 8;
export const DEBT_CARRYING_PREMIUM_BASE_RATE = 0.0005;
export const DEBT_CARRYING_PREMIUM_RECOVERY_RATE = 0.0015;
export const DEBT_CARRYING_PREMIUM_CRITICAL_RATE = 0.002;
export const DEBT_CARRYING_PREMIUM_MAX_REVENUE_SHARE = 0.25;
export const DEBT_NEW_BORROWING_PREMIUM = 0.10;
/** Debt makes imported food progressively dearer without penalising a brief overdraft. */
export const DEBT_IMPORT_COST_RECOVERY_BONUS = 0.30;
export const DEBT_IMPORT_COST_CRITICAL_BONUS = 0.20;
/** Discretionary programmes contract gradually while mandatory survival costs remain real. */
export const DEBT_PROGRAM_PENALTY_PEACE_RECOVERY = 0.22;
export const DEBT_PROGRAM_PENALTY_PEACE_CRITICAL = 0.12;
export const DEBT_PROGRAM_PENALTY_WAR_RECOVERY = 0.18;
export const DEBT_PROGRAM_PENALTY_WAR_CRITICAL = 0.10;
export const DEBT_PROGRAM_ENVELOPE_FLOOR_PEACE = 0.35;
export const DEBT_PROGRAM_ENVELOPE_FLOOR_WAR = 0.45;
/** Only a catastrophic, genuinely unaffordable force may shrink, and then over decades. */
export const EXTREME_CRISIS_FOOD_COVERAGE = 0.50;
export const EXTREME_CRISIS_FOOD_RESERVE_WEEKS = 0.25;
export const EXTREME_CRISIS_MAX_UPKEEP_FUNDING = 0.50;
export const EXTREME_CRISIS_DEMOBILIZATION_RATE = 0.0005;
/** Even an extreme fiscal collapse preserves one quarter of live capacity as a home guard. */
export const EXTREME_CRISIS_HOME_GUARD_CAPACITY_SHARE = 0.25;
/**
 * Active field armies refill from the current effective cap, never from an
 * opening benchmark. The fixed rates keep the pacing controller-neutral and
 * deliberately avoid any hidden low-readiness acceleration curve.
 */
export const PEACE_ARMY_REFILL_CAPACITY_RATE_V2 = 0.01;
/** Compatibility export: national recruitment is frozen in every live war. */
export const SURVIVAL_REAR_ARMY_REFILL_CAPACITY_RATE_V2 = 0;
/** Retired personnel-pool constants retained as neutral compatibility exports. */
export const PASSIVE_RECRUITMENT_CAPACITY_RATE = 0.00135;
/**
 * One smooth 0–100% peacetime recovery curve. A nearly empty army has the
 * largest training need; the acceleration fades cubically toward ordinary
 * training as readiness approaches full strength, with no threshold mode.
 */
export const PEACE_READINESS_RECOVERY_MAX_MULTIPLIER = 5;
export const PEACE_READINESS_RECOVERY_CURVE_EXPONENT = 3;
/** Smaller maximum armies complete the same readiness rebuild somewhat sooner. */
export const RECRUITMENT_SIZE_REFERENCE_CAPACITY = 0.10;
export const RECRUITMENT_SIZE_SCALING_EXPONENT = 0.10;
export const RECRUITMENT_SIZE_SPEED_MIN = 0.85;
export const RECRUITMENT_SIZE_SPEED_MAX = 1.10;
export const PASSIVE_RECRUITMENT_TRAINING_BONUS = 0.02;
/** Cash-rich countries can trade a large permanent bill for faster training. */
export const UPKEEP_OVERFUNDING_MAX_RATIO = 1.25;
/** The maximum is approached smoothly across twelve revenue-weeks above reserve. */
export const UPKEEP_OVERFUNDING_FULL_SURPLUS_WEEKS = 12;
/** All former reserve constants are zero: only territorial active armies exist. */
export const TRAINED_RESERVE_CAPACITY_MULTIPLIER = 0;
export const TRAINED_RESERVE_ACTIVE_READY_RATIO = 0;
export const TRAINED_RESERVE_PEACETIME_BASE_TRICKLE_FACTOR = 0;
export const TRAINED_RESERVE_PEACETIME_TRICKLE_FACTOR = 0;
export const TRAINED_RESERVE_DEPLOYMENT_THROUGHPUT_MULTIPLIER = 0;
export const TRAINED_RESERVE_WARTIME_TRAINING_FACTOR = 0;
export const TRAINED_RESERVE_TRAINING_COST_MULTIPLIER = 0;
export const RESERVE_TRAINING_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL = 0;
export const RESERVE_TRAINING_RESEARCH_EFFECTIVE_CEILING = 0;
export const RESERVE_TRAINING_RESEARCH_HALF_SATURATION = 0;
export const RESERVE_MOBILIZATION_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL = 0;
export const RESERVE_MOBILIZATION_RESEARCH_EFFECTIVE_CEILING = 0;
export const RESERVE_MOBILIZATION_RESEARCH_HALF_SATURATION = 0;
/**
 * Peace is the efficient rebuild window: fresh formations recover quickly and
 * at a modest 15% fast-track premium. War freezes national recruitment; it
 * cannot create fresh active manpower.
 */
export const PEACE_RECRUITMENT_ACCELERATION_MULTIPLIER = 4;
export const PEACE_RECRUITMENT_ACCELERATION_COST_MULTIPLIER = 1.15;
/** No hidden universal defender layer; terrain and visible logistics provide positional defence. */
export const DEFENDER_POSITION_MULTIPLIER = 1;
/** Prepared firing positions also improve defender counter-fire without duplicating the full shield bonus. */
export const DEFENDER_COUNTERFIRE_MULTIPLIER = 1.15;
/**
 * Civilian harm follows the total violence of a battle, not only the winning
 * side's damage. Both populations pay a substantial price; the invaded
 * territory remains more exposed because the fighting happens on its land.
 */
export const DEFENDER_CIVILIAN_LOSS_INTENSITY = 0.90;
export const DEFENDER_CIVILIAN_LOSS_POPULATION_CAP = 0.004;
export const ATTACKER_CIVILIAN_LOSS_INTENSITY = 0.55;
export const ATTACKER_CIVILIAN_LOSS_POPULATION_CAP = 0.0025;
/** Keeps comparable battles near a 1.6:1 defender/attacker civilian-loss floor. */
export const ATTACKER_CIVILIAN_LOSS_DEFENDER_SHARE = 0.625;
/**
 * Casualties scale linearly with committed combat pressure. A sub-linear
 * exponent made a huge army take more absolute losses merely because its
 * own percentage-loss floor was multiplied by more soldiers.
 */
export const COMBAT_POWER_RATIO_EXPONENT = 1;
/**
 * Converts effective opposing combat pressure into raw manpower damage.
 * Every soldier physically present on the front contributes. The shared
 * frontline resolver applies the single 10%-of-Empire-cap ceiling afterwards.
 * A 1.25% peer baseline keeps ordinary exchanges visible below that ceiling.
 */
export const COMBAT_DAMAGE_EFFECTIVENESS = 0.0125;
/**
 * A single field engagement can remove at most ten percent of a side's full
 * Empire army capacity. The actual armies stationed on the two border
 * territories still generate the hit and remain the local overkill bound.
 */
export const COMBAT_HIT_EMPIRE_CAP_SHARE_V2 = 0.10;
/** Individual pulses use a much wider ±25% band than the former ±6%. */
export const BATTLE_DAMAGE_VARIANCE_HALF_RANGE_V2 = 0.25;
/** Expected damage starts slightly above the old baseline and rises through year one. */
export const BATTLE_DAMAGE_MEAN_START_V2 = 1.05;
export const BATTLE_DAMAGE_MEAN_MAX_V2 = 1.15;
export const BATTLE_DAMAGE_ESCALATION_WEEKS_V2 = 52;

export function battleDamageMeanV2(warAgeWeeks: number): number {
  const progress = clamp(
    Math.max(0, Number.isFinite(warAgeWeeks) ? warAgeWeeks : 0)
      / BATTLE_DAMAGE_ESCALATION_WEEKS_V2,
    0,
    1,
  );
  return BATTLE_DAMAGE_MEAN_START_V2
    + (BATTLE_DAMAGE_MEAN_MAX_V2 - BATTLE_DAMAGE_MEAN_START_V2)
      * progress;
}

/** One deterministic RNG draw plus the live war-age escalation curve. */
export function battleDamageVarianceV2(randomDraw: number, warAgeWeeks: number): number {
  const draw = clamp(Number.isFinite(randomDraw) ? randomDraw : 0.5, 0, 1);
  return battleDamageMeanV2(warAgeWeeks)
    + (2 * draw - 1) * BATTLE_DAMAGE_VARIANCE_HALF_RANGE_V2;
}
/** Offensive formations take a modest extra exposure penalty in every exchange. */
export const ATTACKER_MILITARY_LOSS_MULTIPLIER = 1.08;
/** Front-planning threshold for viability and initiative reassessment; it never adds casualties. */
export const COMBAT_ROUTE_STRENGTH_RATIO = 0.05;
/** Defensive research saturates at +20%; level 20 reaches +10%. */
export const DEFENSE_RESEARCH_MAX_BONUS = 0.20;
export const DEFENSE_RESEARCH_HALF_SATURATION = 20;
export function effectiveDefenseStatV2(rawDefense: number): number {
  // This is the player-facing DEF stat. Keep it fully linear so the number in
  // the UI continues to show every real quality and research improvement.
  return Math.max(0, rawDefense);
}
/** The displayed DEF number contributes 75% of its former battlefield weight. */
export const COMBAT_DEFENSE_BASE_EFFECT_V2 = 0.75;
/** Relative DEF advantages bend logarithmically beyond opposing ATK parity. */
export const COMBAT_DEFENSE_RELATIVE_SOFTNESS_V2 = 8;
/**
 * Universal combat-only ceiling for a DEF advantage over incoming ATK.
 * The asymptote applies to nations, mastery, APEX and the Rogue AI alike;
 * terrain, positioning and supply remain separate real multipliers.
 */
export const COMBAT_DEFENSE_RELATIVE_EFFECT_MAX_V2 = 4;
/**
 * Convert the unchanged displayed DEF stat into combat-only protection. The
 * curve is relative to opposing ATK, so equal technological growth preserves
 * peer balance. Every point remains useful, while an exceptional DEF advantage
 * gains progressively less battlefield leverage above parity.
 */
export function combatDefenseEffectV2(
  displayedDefense: number,
  opposingAttack: number,
): number {
  const defense = Math.max(0, Number.isFinite(displayedDefense) ? displayedDefense : 0);
  const attack = Math.max(0, Number.isFinite(opposingAttack) ? opposingAttack : 0);
  if (defense <= 0 || attack <= 0) return defense * COMBAT_DEFENSE_BASE_EFFECT_V2;
  const relativeDefense = defense / attack;
  if (relativeDefense <= 1) return defense * COMBAT_DEFENSE_BASE_EFFECT_V2;
  const compressedRatio = 1 + COMBAT_DEFENSE_RELATIVE_SOFTNESS_V2 * Math.log1p(
    (relativeDefense - 1) / COMBAT_DEFENSE_RELATIVE_SOFTNESS_V2,
  );
  const boundedRatio = 1 + (COMBAT_DEFENSE_RELATIVE_EFFECT_MAX_V2 - 1) * (
    1 - Math.exp(
      -(compressedRatio - 1) / (COMBAT_DEFENSE_RELATIVE_EFFECT_MAX_V2 - 1),
    )
  );
  return attack * boundedRatio * COMBAT_DEFENSE_BASE_EFFECT_V2;
}
/** A fresh entrant cannot claim a force another war already destroyed. */
export const CAPTURE_MIN_CONTRIBUTION_SHARE = 0.10;
/** A local formation at one percent readiness capitulates after the next battle pulse. */
export const LOCAL_FORMATION_CAPITULATION_MAX_FILL_V2 = 0.01;
/** Every accepted declaration immediately commits one percent of the attacker's deployed army. */
export const WAR_DECLARATION_ATTACKER_LOSS_SHARE = 0.01;
/**
 * A front that has been decisively dominated for half a year can force the
 * last under-strength formation to surrender. This replaces gradual territorial
 * progress tracking with one explicit campaign endpoint; the territory remains with
 * its defender until all of these conditions are met.
 */
export const DECISIVE_SURRENDER_MIN_FRONT_TICKS = 26;
export const DECISIVE_SURRENDER_MAX_DEFENDER_FILL = 0.125;
export const DECISIVE_SURRENDER_MIN_FORCE_RATIO = 4;
export const DECISIVE_SURRENDER_MIN_CUMULATIVE_LOSS_SHARE = 0.80;
export const DECISIVE_SURRENDER_MIN_MOMENTUM = 0.50;
export const BATTLE_INTERVAL_TICKS = 2;
/** Declared wars spend their first two months mobilising at the border before combat begins. */
export const WAR_MOBILIZATION_TICKS = 8;
export const STALE_WAR_TICKS = 26;
export const TRUCE_TICKS = 26;
/** Human-player alliance invitations remain actionable for half a year. */
export const ALLIANCE_OFFER_DURATION_TICKS = 26;
/** A revenge claim is useful for at most one year after it is triggered. */
export const WAR_REVENGE_WINDOW_TICKS = 52;
/** A capture pauses both armies long enough to secure supply before the next objective. */
export const WAR_CAPTURE_CONSOLIDATION_TICKS = 8;
/** Even a live, contested campaign must resolve within five campaign years. */
export const WAR_CAMPAIGN_MAX_TICKS = 260;
/** A victor this depleted consolidates its gain instead of chaining another assault. */
export const WAR_CAMPAIGN_MIN_CONTINUE_FILL_RATIO = 0.18;
/** Multi-war empires need substantially more field strength to keep advancing. */
export const WAR_CAMPAIGN_MULTI_WAR_MIN_CONTINUE_FILL_RATIO = 0.40;
/** Severe domestic exhaustion makes the victor consolidate its latest conquest. */
export const WAR_CAMPAIGN_CONSOLIDATE_FATIGUE = 80;
/** AI invaders at or below this live deployed/capacity ratio must leave offensive wars. */
export const AI_OFFENSIVE_EXHAUSTION_ARMY_FILL_RATIO = 0.10;
/** Active combat freezes the national training pipeline completely. */
export const WAR_RECRUITMENT_THROUGHPUT_FACTOR = 0;
/** Ending the final front leaves a short, gradually fading economic-recovery tail. */
export const POST_WAR_TRANSITION_FATIGUE = 8;
/** Peacetime clears operational fatigue at roughly 17.2 points per year. */
export const PEACE_FATIGUE_RECOVERY_PER_WEEK = 0.33;
/**
 * Territorial conquest is a national undertaking even after the shooting
 * stops. A tiny acquisition starts with twenty fatigue points; a conquest as
 * large as half the attacker's resulting population reaches the bounded
 * thirty-point ceiling. Ordinary peacetime recovery therefore takes roughly
 * 1.5-2.3 years before the separate post-war transition is counted.
 */
export const CONQUEST_WAR_FATIGUE_MIN = 20;
export const CONQUEST_WAR_FATIGUE_MAX = 30;
export const CONQUEST_WAR_FATIGUE_FULL_SCALE_SHARE = 0.50;
/** Food is measured in million-person-weeks; healthy countries target a three-month buffer. */
export const FOOD_TARGET_WEEKS = 12;
/** Even the most fragile opening keeps roughly five live-demand weeks in reserve. */
export const FOOD_OPENING_RESERVE_MIN_WEEKS = 5;
/** Storage starts with national infrastructure and expands materially with landmass. */
export const FOOD_STORAGE_BASE_WEEKS = 12;
/** Every country has room for at least two months of its own live national demand. */
export const FOOD_STORAGE_MIN_WEEKS = 8;
export const FOOD_STORAGE_MILLIONS_PER_KM2 = 0.00002;
/** Land, wealth, traits and Food Systems may expand storage up to nine months. */
export const FOOD_MAX_STOCK_WEEKS = 36;
export const FOOD_PRODUCTION_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL = 0.01;
export const FOOD_PRODUCTION_RESEARCH_EFFECTIVE_CEILING = 35;
export const FOOD_PRODUCTION_RESEARCH_HALF_SATURATION = 20;
export const FOOD_STORAGE_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL = 0.015;
export const FOOD_STORAGE_RESEARCH_EFFECTIVE_CEILING = 30;
export const FOOD_STORAGE_RESEARCH_HALF_SATURATION = 15;
export const FOOD_DOMESTIC_COST_PER_MILLION = 0.0006;
export const FOOD_IMPORT_COST_PER_MILLION = 0.0018;
/** Food is material, but leaves a viable programme budget in low-income African openings. */
export const FOOD_COST_GLOBAL_MULTIPLIER = 1.05;
/** National farm/processing capacity takes five years to complete a full-scale transition. */
export const FOOD_DOMESTIC_CAPACITY_RAMP_WEEKS = 260;
/**
 * A conquered civilian food network is not loot that vanishes with the old
 * government. Sixty percent of the local stores survives the fighting and
 * stays with the people; the rest represents spoilage, evacuation and route
 * damage during the handover.
 */
export const FOOD_CONQUEST_LOCAL_STOCK_RETENTION_SHARE = 0.60;
/** Genuine food danger may temporarily redirect every live development dollar. */
export const FOOD_DEVELOPMENT_PAUSE_COVERAGE = 0.98;
export const FOOD_DEVELOPMENT_PAUSE_RESERVE_WEEKS = 2;
export const FOOD_DEVELOPMENT_PAUSE_DRAIN_SHARE = 0.02;
export const FOOD_DEVELOPMENT_PAUSE_CRITICAL_RESERVE_WEEKS = 0.50;
/** Export receipts carry a small premium over the stable world-market baseline. */
export const FOOD_EXPORT_PRICE_MULTIPLIER = 1.08;
/** Stable world-market reference, independent of the exporter's war and inefficiency costs. */
export const FOOD_EXPORT_MARKET_PRICE_LEVEL = 1.20;
/** Local price levels keep food meaningful in rich economies without crushing low-income ones. */
export const FOOD_PRICE_LEVEL_FLOOR = 0.75;
export const FOOD_PRICE_LEVEL_PER_WEALTH_THOUSAND = 0.03;
/** Above $100k GDP/capita, prices keep rising at one quarter of the normal slope. */
export const FOOD_PRICE_LEVEL_SOFTENING_THRESHOLD = 100;
export const FOOD_PRICE_LEVEL_POST_THRESHOLD_SLOPE_SHARE = 0.25;
export const FOOD_SHORTAGE_POPULATION_LOSS = 0.00085;
/** Empty reserves can add up to six percentage points of annual mortality in a live shortage. */
export const FOOD_EMPTY_RESERVE_ANNUAL_MORTALITY_MAX = 0.06;
/** Extra starvation mortality begins once reserves fall below 10% of their safe target. */
export const FOOD_MORTALITY_RESERVE_START_SHARE = 0.10;
/**
 * National IQ is a bounded gameplay proxy derived from existing economic and
 * institutional content. It is not a scientific psychometric claim.
 */
export const NATIONAL_IQ_SCORE_MIN = 80;
export const NATIONAL_IQ_SCORE_NEUTRAL = 100;
/** Opening country data remains capped at 108; long-run education research may exceed it modestly. */
export const NATIONAL_IQ_SCORE_MAX = 108;
export const NATIONAL_IQ_EFFECTIVE_SCORE_MAX = 112;
/** Education research approaches +8 IQ points but can never push the live score above 112. */
export const NATIONAL_IQ_RESEARCH_MAX_BONUS = 8;
export const NATIONAL_IQ_RESEARCH_HALF_SATURATION = 5;
export const NATIONAL_IQ_GDP_PER_CAPITA_FLOOR = 500;
export const NATIONAL_IQ_GDP_PER_CAPITA_CEILING = 100_000;
export const NATIONAL_IQ_INSTITUTIONAL_CAPACITY_FLOOR = 0.2;
export const NATIONAL_IQ_INSTITUTIONAL_CAPACITY_CEILING = 18;
export const NATIONAL_IQ_PROXY_GDP_WEIGHT = 0.75;
export const NATIONAL_IQ_PROXY_INSTITUTION_WEIGHT = 0.25;
/** GDP per capita remains primary, while IQ now carries a clearly material 35% share. */
export const NATIONAL_QUALITY_GDP_WEIGHT = 0.65;
export const NATIONAL_QUALITY_IQ_WEIGHT = 0.35;
/** Total opening combat-quality spread around the neutral readiness baseline. */
export const NATIONAL_QUALITY_COMBAT_SPAN = 0.06;
/**
 * Live national combat systems make prosperity and IQ materially important on
 * top of the local force quality carried by soldiers. The 1.3 span gives the
 * poorest/lowest-IQ and richest/opening-IQ systems 0.35x and 1.65x quality;
 * Education research can raise the latter smoothly to 1.715x at IQ 112.
 */
export const NATIONAL_COMBAT_SYSTEM_QUALITY_SPAN = 1.3;
/** A higher ceiling leaves room for already-rich countries to keep modernising. */
export const NATIONAL_COMBAT_GDP_PER_CAPITA_FLOOR = 500;
export const NATIONAL_COMBAT_GDP_PER_CAPITA_CEILING = 250_000;
/** IQ changes how efficiently completed research becomes battlefield capability. */
export const NATIONAL_COMBAT_RESEARCH_CONVERSION_MIN = 0.75;
export const NATIONAL_COMBAT_RESEARCH_CONVERSION_MAX = 1.25;
/** Economy & Science modernises both ATK and DEF with diminishing returns. */
export const NATIONAL_COMBAT_ECONOMY_RESEARCH_MAX_BONUS = 0.30;
export const NATIONAL_COMBAT_ECONOMY_RESEARCH_HALF_SATURATION = 25;
/** Bounded per-IQ-point effects used by the live national systems. */
export const NATIONAL_IQ_ECONOMY_GROWTH_PER_POINT = 0.002;
export const NATIONAL_IQ_RESEARCH_PER_POINT = 0.003;
export const NATIONAL_IQ_LOGISTICS_PER_POINT = 0.0025;
export const NATIONAL_IQ_POPULATION_GROWTH_PER_POINT = 0.0025;
/** A healthy economy grows slowly by itself; investment, research and food move the live rate. */
export const ECONOMY_BASE_ANNUAL_GROWTH = 0.003;
/** Productive investment matters, but normal countries no longer compound at arcade-like rates. */
export const ECONOMY_INVESTMENT_GROWTH_MULTIPLIER = 0.22;
export const ECONOMY_RESEARCH_GROWTH_PER_LEVEL = 0.0006;
export const ECONOMY_FOOD_SURPLUS_MAX_BONUS = 0.001;
export const ECONOMY_FOOD_SHORTAGE_MAX_DRAG = 0.03;
export const ECONOMY_ANNUAL_GROWTH_MIN = -0.06;
export const ECONOMY_ANNUAL_GROWTH_MAX = 0.045;
/** Food access is rebuilt slowly through infrastructure and economic research. */
export const FOOD_ACCESS_RESEARCH_RELIEF_PER_LEVEL = 0.025;
/** Very large populations add nonlinear distribution, storage and import pressure. */
export const FOOD_POPULATION_PRESSURE_RATE = 0.035;
export const FOOD_POPULATION_PRESSURE_SCALE = 250;
export const FOOD_POPULATION_PRESSURE_POWER = 1.15;
/** Human mass armies become an increasingly expensive food/logistics choice. */
export const FOOD_ARMY_LOGISTICS_RATE = 1.50;
export const FOOD_ARMY_LOGISTICS_SCALE = 2;
export const FOOD_ARMY_LOGISTICS_POWER = 1.35;
/** Deep economy/logistics research can move the ceiling, never erase it. */
export const FOOD_PRESSURE_RESEARCH_RELIEF_PER_LEVEL = 0.05;
/**
 * Each land-equivalent active operation disrupts twelve percent of the food
 * logistics chain before supply research. The same bounded pressure raises
 * demand, wastes imports and slightly reduces last-mile civilian delivery.
 */
export const FOOD_WAR_LOGISTICS_PRESSURE_PER_LOAD = 0.12;
export const FOOD_WAR_LOGISTICS_PRESSURE_MAX = 0.55;
export const FOOD_WAR_DEMAND_SHARE_OF_PRESSURE = 0.20;
export const FOOD_WAR_SUPPLY_RELIEF_PER_LEVEL = 0.025;
/** Civilian population drives military volume; quality remains a separate per-soldier stat. */
export const ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE = 0.00145;
/** Existing real armies fit with a modest 25% professional expansion ceiling. */
export const ARMY_CAPACITY_INITIAL_FORCE_FLOOR = 1.25;
export const WAR_ACCESS_COST_MULTIPLIER = {
  land: 1,
  naval: 1.65,
} as const;
/** Starting a campaign is accessible; sustaining its weekly operations is the real economic commitment. */
export const WAR_MOBILIZATION_COST_FACTOR = 0.35;
/** Active fronts are a real surcharge outside the ordinary national budget. */
export const WAR_OPERATION_REVENUE_SHARE = 0.07;
export const WAR_OPERATION_COST_PER_MILLION = 0.07;
/** Repeat campaigns strain the same treasury and logistics network; the softened surcharge is bounded at +20%. */
export const WAR_FATIGUE_OPERATION_COST_PER_POINT = 0.0075;
export const WAR_FATIGUE_OPERATION_COST_MAX_BONUS = 0.20;
/** Sea battles create less sustained national fatigue than equivalent ground contact. */
export const NAVAL_BATTLE_FATIGUE_MULTIPLIER = 0.45;
export const WAR_ACCESS_OPERATION_MULTIPLIER = {
  land: 1,
  naval: 1.35,
} as const;
export const WAR_ACCESS_SUPPLY_MULTIPLIER = {
  land: 1,
  // Even a short sea crossing is an expedition: it can be sustained, but it
  // never projects the same weekly combat mass as a contiguous land front.
  naval: 0.85,
} as const;
/** Naval routes remain usable at global range, but distance increasingly taxes fleets and supply. */
export const NAVAL_ROUTE_BASE_DISTANCE_KM = 1_500;
export const NAVAL_ROUTE_MAX_DISTANCE_KM = 9_000;
/** Long deployments acquire an additional, non-plateauing operating-cost tail beyond this point. */
export const NAVAL_ROUTE_LONG_DISTANCE_THRESHOLD_KM = 5_000;
export const NAVAL_ROUTE_LONG_DISTANCE_COST_PER_5K_KM = 0.55;
export const NAVAL_ROUTE_OPERATION_MULTIPLIER_MAX = 2.15;
/** A prepared global expedition keeps a viable, deliberately limited supply corridor. */
export const NAVAL_ROUTE_SUPPLY_MULTIPLIER_MIN = 0.70;

/**
 * Equivalent-radius proxy for the domestic distance between a country's
 * distributed forces and its border/port. Square-root area keeps continental
 * states meaningfully harder to move through without letting area dominate.
 */
export const COUNTRY_INTERIOR_DISTANCE_RADIUS_SHARE_V2 = 0.65;
export const COUNTRY_INTERIOR_DISTANCE_FULL_PRESSURE_KM_V2 = 1_500;
export const COUNTRY_INTERIOR_OPERATION_MULTIPLIER_MAX_V2 = 1.25;

export function countryInteriorLogisticsDistanceKmV2(landAreaKm2: number): number {
  const safeArea = Number.isFinite(landAreaKm2) ? Math.max(0, landAreaKm2) : 0;
  return round(COUNTRY_INTERIOR_DISTANCE_RADIUS_SHARE_V2 * Math.sqrt(safeArea / Math.PI), 3);
}

export function countryInteriorOperationMultiplierV2(landAreaKm2: number): number {
  const distanceKm = countryInteriorLogisticsDistanceKmV2(landAreaKm2);
  const pressure = smoothstep(25, COUNTRY_INTERIOR_DISTANCE_FULL_PRESSURE_KM_V2, distanceKm);
  return round(1 + (COUNTRY_INTERIOR_OPERATION_MULTIPLIER_MAX_V2 - 1) * pressure, 9);
}

export function navalRouteDistancePressureV2(distanceKm?: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm === undefined) return 0;
  return smoothstep(
    0,
    1,
    (Math.max(0, distanceKm) - NAVAL_ROUTE_BASE_DISTANCE_KM)
      / (NAVAL_ROUTE_MAX_DISTANCE_KM - NAVAL_ROUTE_BASE_DISTANCE_KM),
  );
}

export function warAccessOperationMultiplierV2(
  access: 'land' | 'naval',
  distanceKm?: number,
): number {
  if (access === 'land') return WAR_ACCESS_OPERATION_MULTIPLIER.land;
  const pressure = navalRouteDistancePressureV2(distanceKm);
  const safeDistanceKm = Number.isFinite(distanceKm) && distanceKm !== undefined
    ? Math.max(0, distanceKm) : 0;
  // The original smooth shoulder remains useful for ordinary regional routes,
  // while a linear global-range tail prevents Pacific operations from becoming
  // effectively identical once the bounded supply curve reaches 9,000 km.
  const longDistanceCost = Math.max(0, safeDistanceKm - NAVAL_ROUTE_LONG_DISTANCE_THRESHOLD_KM)
    / 5_000 * NAVAL_ROUTE_LONG_DISTANCE_COST_PER_5K_KM;
  return round(WAR_ACCESS_OPERATION_MULTIPLIER.naval
    + (NAVAL_ROUTE_OPERATION_MULTIPLIER_MAX - WAR_ACCESS_OPERATION_MULTIPLIER.naval) * pressure
    + longDistanceCost, 9);
}

export function warAccessSupplyMultiplierV2(
  access: 'land' | 'naval',
  distanceKm?: number,
): number {
  if (access === 'land') return WAR_ACCESS_SUPPLY_MULTIPLIER.land;
  const pressure = navalRouteDistancePressureV2(distanceKm);
  return round(WAR_ACCESS_SUPPLY_MULTIPLIER.naval
    - (WAR_ACCESS_SUPPLY_MULTIPLIER.naval - NAVAL_ROUTE_SUPPLY_MULTIPLIER_MIN) * pressure, 9);
}
export const WAR_ACCESS_ASSAULT_MULTIPLIER = {
  land: 1,
  naval: 1,
} as const;
export const WAR_ACCESS_CASUALTY_MULTIPLIER = {
  land: 1,
  naval: 1,
} as const;
/** Strategic deterrence affects conventional attack power; nuclear strikes are not simulated. */
export const NUCLEAR_POWER_ATTACK_BONUS_PER_LEVEL = 0.04;
/** First researched tier cost; later tiers compound so established nuclear powers still progress slowly. */
export const NUCLEAR_POWER_BREAKTHROUGHS_PER_LEVEL = 12;
export const NUCLEAR_POWER_TIER_COST_GROWTH = 1.50;
export const NUCLEAR_POWER_MAX_LEVEL = 5;

export function nuclearPowerTierCostV2(tier: number): number {
  return Math.round(NUCLEAR_POWER_BREAKTHROUGHS_PER_LEVEL
    * NUCLEAR_POWER_TIER_COST_GROWTH ** Math.max(0, tier - 1));
}

export const AI_DECISION_INTERVAL = 8;
/** Existing crises get time to develop before the wider 2026 order starts fracturing. */
export const AI_FIRST_WAR_TICK = 78;
/** At this visible Suspicion level every adjacent AI receives an alert review lane. */
export const AI_HIGH_SUSPICION_REACTION_THRESHOLD = 80;

/** Smooth high-alert signal shared by declaration, budget and logistics planning. */
export function aiHighSuspicionAlertV2(globalThreat: number): number {
  return smoothstep(65, 90, clamp(globalThreat, 0, 100));
}

/** Bounded readiness signal for moving existing troops toward exposed borders. */
export function aiBorderPreSupplyPriorityV2(
  globalThreat: number,
  activeWarCount: number,
): number {
  const suspicionAlert = aiHighSuspicionAlertV2(globalThreat);
  const warLoad = clamp(Math.max(0, activeWarCount) / 2, 0, 1);
  return clamp(0.85 * suspicionAlert + 0.30 * warLoad, 0, 1);
}
/** New expansion wars are meaningful events, not something the world opens every few weeks. */
export const AI_GLOBAL_WAR_COOLDOWN = 91;
/** Established great powers strongly prefer proxy/regional expansion over a
 * direct peer war during the first fifty campaign years. It is an aversion,
 * not a hard diplomatic lock. */
export const AI_MAJOR_POWER_AVOIDANCE_TICKS = 52 * 50;
/** A sustained AI-vs-AI war can still attract a bounded regional intervention. */
export const AI_REGIONAL_ESCALATION_COOLDOWN = 104;
export const AI_REGIONAL_ESCALATION_MIN_AGE = 52;
export const AI_REGIONAL_ESCALATION_MIN_BATTLES = 8;
export const AI_REGIONAL_ESCALATION_EXTRA_WAR_CAP = 0;
/** A threatened player must fight alone long enough for neighbours to assess the invasion. */
export const AI_DEFENSIVE_AID_MIN_AGE = 39;
export const AI_DEFENSIVE_AID_MIN_BATTLES = 6;
export const AI_DEFENSIVE_AID_AGGRESSOR_RATIO = 1.75;
/** Defensive intervention stays more responsive than optional expansion. */
export const AI_DEFENSIVE_AID_COOLDOWN = 78;

/**
 * The world is a self-running conflict sandbox. Capacity rises as the campaign
 * matures, creating a plausible slide from regional crises toward a broad
 * world war without bypassing any country's money, fatigue or route checks.
 */
export function aiActiveWarCapV2(livingNations: number, tick: number): number {
  const worldScale = Math.max(1, Math.ceil(Math.max(1, livingNations) / 100));
  const eraBonus = tick >= 1_560 ? 2 : tick >= 520 ? 1 : 0;
  return Math.min(4, Math.max(2, worldScale + eraBonus));
}

/** Every country reviews the same stored budget and research mix every eight weeks. */
export const NATIONAL_AI_REVIEW_TICKS = AI_DECISION_INTERVAL;
/** IQ only changes response by a few percentage points per review. */
export const NATIONAL_AI_ALLOCATION_STEP_MIN = 2;
export const NATIONAL_AI_ALLOCATION_STEP_MAX = 4;
/** Small, bounded execution gain or loss per point around IQ 100. */
export const NATIONAL_AI_EFFICIENCY_PER_IQ_POINT = 0.0025;
/** Shared cash-runway policy; selecting a country grants no reserve advantage. */
export const NATIONAL_AI_PEACE_RESERVE_WEEKS = 8;
/** Universal public administration and operating burden: exactly 30% of ordinary tax revenue. */
export const BASE_OPERATING_COST_TAX_REVENUE_SHARE = 0.30;
/** Administrative research improves collection modestly and can trim operations to no less than 25%. */
export const TAX_EFFICIENCY_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL = 0.003;
export const TAX_EFFICIENCY_RESEARCH_EFFECTIVE_CEILING = 30;
export const TAX_EFFICIENCY_RESEARCH_HALF_SATURATION = 20;
export const OPERATING_EFFICIENCY_RESEARCH_REDUCTION_PER_EFFECTIVE_LEVEL = 0.0025;
export const OPERATING_EFFICIENCY_RESEARCH_EFFECTIVE_CEILING = 20;
export const OPERATING_EFFICIENCY_RESEARCH_HALF_SATURATION = 15;
export const BASE_OPERATING_COST_MIN_TAX_REVENUE_SHARE = 0.25;
export const NATIONAL_AI_WAR_BASE_RUNWAY_WEEKS = 6;
export const NATIONAL_AI_WAR_FRONT_RUNWAY_WEEKS = 2;
/** Better national decision quality builds a slightly deeper emergency buffer. */
export const NATIONAL_AI_RESERVE_IQ_MULTIPLIER_MIN = 0.90;
export const NATIONAL_AI_RESERVE_IQ_MULTIPLIER_MAX = 1.10;
/** Uncommitted ordinary cashflow is retained instead of feeding one-off AI purchases. */
export const NATIONAL_AI_PEACE_FREE_CASHFLOW_SHARE_MIN = 0.12;
export const NATIONAL_AI_PEACE_FREE_CASHFLOW_SHARE_MAX = 0.16;
export const NATIONAL_AI_WAR_FREE_CASHFLOW_SHARE_MIN = 0.14;
export const NATIONAL_AI_WAR_FREE_CASHFLOW_SHARE_MAX = 0.18;
/** Even a fully funded peacetime reserve keeps a small continuing emergency contribution. */
export const NATIONAL_AI_FUNDED_FREE_CASHFLOW_SHARE = 0.05;
/** Cash above ten percent of live controlled GDP is an investable long-run national surplus. */
export const AI_EXCESS_TREASURY_GDP_THRESHOLD_SHARE = 0.10;
/** The surplus draw reaches full speed only after another five percent of GDP accumulates. */
export const AI_EXCESS_TREASURY_RAMP_GDP_SHARE = 0.05;
/** At most two percent of the actual surplus and one quarter of weekly revenue is invested per week. */
export const AI_EXCESS_TREASURY_WEEKLY_SURPLUS_RATE = 0.02;
export const AI_EXCESS_TREASURY_WEEKLY_REVENUE_CAP = 0.25;
/** Productive non-military investment always retains both research and development capacity. */
export const AI_EXCESS_TREASURY_RESEARCH_SHARE_MIN = 0.35;
export const AI_EXCESS_TREASURY_RESEARCH_SHARE_MAX = 0.65;

/** A conquest exposes ten percent of its surviving potential immediately. */
export const CONQUEST_INITIAL_INTEGRATION_SHARE = 0.10;
/** Every unfinished integration costs 3% of its frozen conquest GDP per year. */
export const INTEGRATION_ADMINISTRATION_ANNUAL_OUTPUT_SHARE = 0.03;
export const WEEKS_PER_YEAR = 52;

/**
 * The simulation deliberately keeps its established per-tick balance after a
 * tick became one visible day. Convert a legacy 52-tick growth rate before
 * presenting it as a true 365-day calendar-year projection.
 */
export function calendarAnnualGrowthRateV2(legacyAnnualRate: number): number {
  if (!Number.isFinite(legacyAnnualRate)) return 0;
  const ticksPerCalendarYear = V2_CALENDAR_DAYS_PER_YEAR / V2_CALENDAR_DAYS_PER_TICK;
  return Math.max(0, 1 + legacyAnnualRate) ** (ticksPerCalendarYear / WEEKS_PER_YEAR) - 1;
}

/** Calendar-year projection for a legacy 52-tick attrition rate. */
export function calendarAnnualLossRateV2(legacyAnnualLossRate: number): number {
  if (!Number.isFinite(legacyAnnualLossRate)) return 0;
  const ticksPerCalendarYear = V2_CALENDAR_DAYS_PER_YEAR / V2_CALENDAR_DAYS_PER_TICK;
  const boundedLoss = clamp(legacyAnnualLossRate, 0, 1);
  return 1 - (1 - boundedLoss) ** (ticksPerCalendarYear / WEEKS_PER_YEAR);
}
/** A minimum guard slice crosses the border after decisive conquest. */
export const CONQUEST_GUARD_MIN_TRANSFER_SHARE = 0.02;
/** A fresh conquest may commit up to 10% of its surviving source as a real one-year guard. */
export const CONQUEST_CAPTURE_GUARD_MAX_TRANSFER_SHARE = 0.10;
export const CONQUEST_CAPTURE_GUARD_TICKS = 52;
/** Permanent defensive mergers are an exceptional, late containment response. */
export const DEFENSIVE_FEDERATION_THREAT = 86;
export const DEFENSIVE_FEDERATION_COOLDOWN_TICKS = 416;

export const DEFAULT_BUDGET_V2: Readonly<BudgetPolicyV2> = {
  military: 35,
  research: 15,
  development: 50,
};

export const RESEARCH_BRANCHES: readonly ResearchBranchV2[] = [
  'population-recruitment',
  'military-industry',
  'advanced-weapons',
  'defensive-systems',
  'logistics-medicine',
  'economy-science',
  'food-systems',
  'reserve-doctrine',
  'public-administration',
  'education-intelligence',
];

/** Every unfinished program receives 3%; allocations divide the remaining 70%. */
export const RESEARCH_PASSIVE_FUNDING_SHARE = 0.03;
export const RESEARCH_ALLOCATED_FUNDING_SHARE = 0.70;
export const RESEARCH_COST_GROWTH = 1.18;
/** Parallel auto-research is intentionally slower than the former manual focus. */
export const RESEARCH_BASE_COST_SCALE = 0.55;
/** Each of five categories receives 16%; portfolio administration absorbs 20%. */
export const RESEARCH_CATEGORY_OUTPUT_SHARE = 0.16;
export const RESEARCH_MASTERY_POWER = 1;
/** Larger research systems need proportionally larger programs, within a firm band. */
export const RESEARCH_COST_CAPACITY_REFERENCE = 12;
export const RESEARCH_COST_CAPACITY_MIN_MULTIPLIER = 0.55;
export const RESEARCH_COST_CAPACITY_MAX_MULTIPLIER = 1.50;
/** Institutional output blends national research capacity with the smaller IQ modifier. */
export const RESEARCH_INSTITUTION_CAPACITY_BASE_MIN = 0.90;
export const RESEARCH_INSTITUTION_CAPACITY_BASE_MAX = 1.13;
export const RESEARCH_INSTITUTION_MULTIPLIER_MIN = 0.85;
export const RESEARCH_INSTITUTION_MULTIPLIER_MAX = 1.15;
/** A twelve-upgrade technology gap earns the complete bounded catch-up bonus. */
export const RESEARCH_CATCH_UP_FULL_GAP = 12;
export const RESEARCH_CATCH_UP_MAX_BONUS = 0.35;

export const DEFAULT_RESEARCH_ALLOCATIONS_V2: Readonly<ResearchAllocationsV2> = {
  'population-recruitment': 0,
  'military-industry': 40,
  'advanced-weapons': 0,
  'defensive-systems': 0,
  'logistics-medicine': 0,
  'economy-science': 60,
  'food-systems': 0,
  'reserve-doctrine': 0,
  'public-administration': 0,
  'education-intelligence': 0,
};

export const RESEARCH_BRANCH_BASE_RP: Readonly<Record<ResearchBranchV2, number>> = {
  'population-recruitment': 22,
  'military-industry': 24,
  'advanced-weapons': 24,
  'defensive-systems': 24,
  'logistics-medicine': 22,
  'economy-science': 22,
  'food-systems': 26,
  'reserve-doctrine': 30,
  'public-administration': 34,
  /** Roughly six ordinary first-tier programs: a real multi-decade national investment. */
  'education-intelligence': 144,
};

export const RESEARCH_BRANCH_EFFECTS: Readonly<Record<ResearchBranchV2, readonly ResearchEffectV2[]>> = {
  'population-recruitment': ['population-growth', 'training', 'research-speed'],
  'military-industry': ['force-capacity', 'reinforcement-efficiency'],
  'advanced-weapons': ['attack', 'reinforcement-efficiency'],
  'defensive-systems': ['defense', 'casualty-reduction'],
  'logistics-medicine': ['recovery', 'supply'],
  'economy-science': ['economy-growth', 'research-speed', 'research-efficiency'],
  // The stable branch id keeps authenticated saves and multiplayer snapshots
  // compatible; its gameplay is now military sustainment, not civilian food.
  'food-systems': ['supply', 'recovery', 'operating-efficiency'],
  // The stable branch id preserves saves and multiplayer protocol. Its live
  // effects now improve direct active-army training and field-force capacity.
  'reserve-doctrine': ['training', 'force-capacity'],
  'public-administration': ['tax-efficiency', 'operating-efficiency'],
  'education-intelligence': ['iq-increase'],
};

export const EMPTY_RESEARCH_EFFECT_LEVELS: Readonly<Record<ResearchEffectV2, number>> = {
  attack: 0,
  defense: 0,
  'force-capacity': 0,
  'reinforcement-efficiency': 0,
  'casualty-reduction': 0,
  recovery: 0,
  supply: 0,
  training: 0,
  'economy-growth': 0,
  'population-growth': 0,
  'research-speed': 0,
  'research-efficiency': 0,
  'food-production': 0,
  'food-storage': 0,
  'reserve-training': 0,
  'reserve-mobilization': 0,
  'tax-efficiency': 0,
  'operating-efficiency': 0,
  'iq-increase': 0,
};

export const EMPTY_RESEARCH_BREAKTHROUGHS: Readonly<Record<ResearchBranchV2, number>> = {
  'population-recruitment': 0,
  'military-industry': 0,
  'advanced-weapons': 0,
  'defensive-systems': 0,
  'logistics-medicine': 0,
  'economy-science': 0,
  'food-systems': 0,
  'reserve-doctrine': 0,
  'public-administration': 0,
  'education-intelligence': 0,
};

export const EMPTY_RESEARCH_PROGRESS: Readonly<ResearchProgressByBranchV2> = {
  'population-recruitment': 0,
  'military-industry': 0,
  'advanced-weapons': 0,
  'defensive-systems': 0,
  'logistics-medicine': 0,
  'economy-science': 0,
  'food-systems': 0,
  'reserve-doctrine': 0,
  'public-administration': 0,
  'education-intelligence': 0,
};

export function validResearchAllocationsV2(value: unknown): value is ResearchAllocationsV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...RESEARCH_BRANCHES].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  return RESEARCH_BRANCHES.every((branch) => Number.isInteger(record[branch])
    && Number(record[branch]) >= 0 && Number(record[branch]) <= 100)
    && RESEARCH_BRANCHES.reduce((sum, branch) => sum + Number(record[branch]), 0) === 100;
}

export function copyResearchAllocationsV2(value: ResearchAllocationsV2): ResearchAllocationsV2 {
  return Object.fromEntries(RESEARCH_BRANCHES.map((branch) => [branch, value[branch]])) as ResearchAllocationsV2;
}

export function researchFundingShareV2(allocations: ResearchAllocationsV2, branch: ResearchBranchV2): number {
  return RESEARCH_PASSIVE_FUNDING_SHARE + RESEARCH_ALLOCATED_FUNDING_SHARE * allocations[branch] / 100;
}

export const TERRAIN_DEFENSE_MODIFIER: Readonly<Record<TerrainType, number>> = {
  plains: 0.96,
  desert: 1,
  coastal: 1.04,
  arctic: 1.09,
  jungle: 1.12,
  urban: 1.14,
  mountain: 1.18,
};

/** Physical movement and supply-chain throughput on a front. */
export const TERRAIN_SUPPLY_MODIFIER: Readonly<Record<TerrainType, number>> = {
  plains: 1.06,
  urban: 1.05,
  coastal: 1.08,
  desert: 0.89,
  mountain: 0.87,
  jungle: 0.85,
  arctic: 0.82,
};

/** Recurring expense of sustaining an operation through the target terrain. */
export const TERRAIN_OPERATION_COST_MODIFIER: Readonly<Record<TerrainType, number>> = {
  plains: 0.96,
  coastal: 0.96,
  urban: 1.08,
  desert: 1.13,
  jungle: 1.16,
  mountain: 1.17,
  arctic: 1.20,
};

/** Domestic food capacity on top of the calibrated real-world opening anchor. */
export const TERRAIN_FOOD_PRODUCTION_MODIFIER: Readonly<Record<TerrainType, number>> = {
  plains: 1.08,
  jungle: 1.04,
  coastal: 1.03,
  mountain: 0.96,
  urban: 0.94,
  desert: 0.88,
  arctic: 0.82,
};

/** Signed annual GDP-growth percentage-point adjustment, not an opening-GDP rewrite. */
export const TERRAIN_ECONOMY_GROWTH_ADJUSTMENT: Readonly<Record<TerrainType, number>> = {
  urban: 0.004,
  coastal: 0.003,
  plains: 0.0005,
  jungle: -0.001,
  mountain: -0.0015,
  desert: -0.002,
  arctic: -0.003,
};

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** Canonical local-force threshold shared by battle resolution and front scheduling. */
export function localFormationCapitulationThresholdV2(capacity: number): number {
  return round(
    Math.max(0, capacity) * LOCAL_FORMATION_CAPITULATION_MAX_FILL_V2,
    9,
  );
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const unit = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return unit * unit * (3 - 2 * unit);
}

/**
 * Cash at or below the national reserve target never unlocks overfunding.
 * A deeper buffer raises the upkeep target gradually and deterministically.
 */
export function upkeepFundingTargetRatioV2(
  treasury: number,
  reserveTarget: number,
  weeklyRevenue: number,
): number {
  const safeTreasury = Math.max(0, Number.isFinite(treasury) ? treasury : 0);
  const safeTarget = Math.max(0, Number.isFinite(reserveTarget) ? reserveTarget : 0);
  const safeRevenue = Math.max(0.001, Number.isFinite(weeklyRevenue) ? weeklyRevenue : 0);
  const surplusWeeks = Math.max(0, safeTreasury - safeTarget) / safeRevenue;
  const activation = smoothstep(
    0,
    UPKEEP_OVERFUNDING_FULL_SURPLUS_WEEKS,
    surplusWeeks,
  );
  return 1 + (UPKEEP_OVERFUNDING_MAX_RATIO - 1) * activation;
}

export interface ExcessTreasuryInvestmentV2 {
  threshold: number;
  excess: number;
  activation: number;
  weeklyDraw: number;
}

export interface EffectiveTreasuryReserveTargetV2 {
  /** Ordinary cash runway selected by the national treasury policy. */
  operatingTarget: number;
  /** Long-horizon liquidity that prevents GDP-scale cash piles from being treated as free money. */
  strategicTarget: number;
  /** Single source of truth for spending, previews and the HUD. */
  effectiveTarget: number;
}

/**
 * Builds one truthful shared reserve target from national tax plus the exact
 * APEX contribution. APEX has no private treasury or separate shortfall.
 */
export function effectiveTreasuryReserveTargetV2(
  weeklyRevenue: number,
  reserveWeeks: number,
  controlledOutput: number,
): EffectiveTreasuryReserveTargetV2 {
  const safeRevenue = Math.max(0, Number.isFinite(weeklyRevenue) ? weeklyRevenue : 0);
  const safeReserveWeeks = Math.max(0, Number.isFinite(reserveWeeks) ? reserveWeeks : 0);
  const safeOutput = Math.max(0, Number.isFinite(controlledOutput) ? controlledOutput : 0);
  const operatingTarget = safeRevenue * safeReserveWeeks;
  const strategicTarget = safeOutput * AI_EXCESS_TREASURY_GDP_THRESHOLD_SHARE;
  return {
    operatingTarget,
    strategicTarget,
    effectiveTarget: Math.max(operatingTarget, strategicTarget),
  };
}

/**
 * Pure GDP-scaled surplus curve for recurring autonomous investment. Its
 * threshold is supplied explicitly by the same reserve calculation shown to
 * the player. The smooth five-percent-GDP ramp and two independent caps
 * prevent windfall spending while accumulated cash supplies all memory.
 */
export function excessTreasuryInvestmentV2(
  treasury: number,
  controlledOutput: number,
  weeklyRevenue: number,
  reserveTarget: number,
): ExcessTreasuryInvestmentV2 {
  const safeTreasury = Math.max(0, Number.isFinite(treasury) ? treasury : 0);
  const safeOutput = Math.max(0, Number.isFinite(controlledOutput) ? controlledOutput : 0);
  const safeRevenue = Math.max(0, Number.isFinite(weeklyRevenue) ? weeklyRevenue : 0);
  const threshold = Math.max(0, Number.isFinite(reserveTarget) ? reserveTarget : 0);
  const excess = Math.max(0, safeTreasury - threshold);
  const rampWidth = safeOutput * AI_EXCESS_TREASURY_RAMP_GDP_SHARE;
  const activation = rampWidth > 0 ? smoothstep(0, rampWidth, excess) : 0;
  return {
    threshold,
    excess,
    activation,
    weeklyDraw: Math.min(
      excess,
      excess * AI_EXCESS_TREASURY_WEEKLY_SURPLUS_RATE,
      safeRevenue * AI_EXCESS_TREASURY_WEEKLY_REVENUE_CAP * activation,
    ),
  };
}

export interface DebtPressureV2 {
  /** Outstanding debt measured in ordinary weekly tax revenue. */
  debtWeeks: number;
  /** Smooth pressure from the one-week grace point through the severe 26-week threshold. */
  recovery: number;
  /** Additional pressure between severe debt and one full revenue-year of debt. */
  critical: number;
}

/**
 * One deterministic debt curve shared by finance and food costs. It is derived
 * from the live treasury and therefore adds no persisted timer or multiplayer
 * state. A brief overdraft receives a genuine grace band; long debt compounds
 * through the systems the country already has to fund.
 */
export function debtPressureV2(treasuryWeeks: number): DebtPressureV2 {
  const finiteWeeks = Number.isFinite(treasuryWeeks) ? treasuryWeeks : 0;
  const debtWeeks = Math.max(0, -finiteWeeks);
  return {
    debtWeeks,
    recovery: smoothstep(
      DEBT_RECOVERY_GRACE_REVENUE_WEEKS,
      AI_SEVERE_DEBT_REVENUE_WEEKS,
      debtWeeks,
    ),
    critical: smoothstep(
      AI_SEVERE_DEBT_REVENUE_WEEKS,
      DEBT_CRITICAL_REVENUE_WEEKS,
      debtWeeks,
    ),
  };
}

/** Converts uncapped research levels into a still-improving, diminishing effective level. */
export function diminishingResearchLevelV2(level: number, ceiling = 40, halfSaturation = 20): number {
  const safeLevel = Math.max(0, level);
  return ceiling * safeLevel / (safeLevel + halfSaturation);
}
