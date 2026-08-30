import './CampaignReport.css';

import {
  MAX_COUNTRY_MASTERY_LEVEL,
  commanderLevelFromXpV1,
  commanderXpForLevelV1,
  countryMasteryLevelFromXpV1,
  countryMasteryXpForLevelV1,
  type CountryMasteryV1,
} from '../meta/commanderProfile';
import type { CampaignLifecycleSnapshotV1 } from '../meta/campaignLifecycle';
import { countryFlagHtml } from './countryFlags';

export interface CampaignReportCountryV1 {
  name: string;
  shortName?: string;
  sigil?: string;
  cssColor?: string;
}

export interface CampaignMasteryProjectionV1 {
  xpBefore: number;
  xpAfter: number;
  xpEarned: number;
  levelBefore: number;
  levelAfter: number;
  levelsGained: number;
  levelStartXp: number;
  nextLevelXp: number;
  progress: number;
  xpToNextLevel: number;
}

export interface CommanderProgressBeforeSettlementV1 {
  xp: number;
  level: number;
  /** Unspent points immediately before this campaign was settled. */
  talentPointsAvailable?: number;
}

export interface CommanderProgressProjectionV1 {
  xpBefore: number;
  xpAfter: number;
  xpEarned: number;
  levelBefore: number;
  levelAfter: number;
  levelsGained: number;
  talentPointsEarned: number;
  talentPointsAfter?: number;
  levelStartXp: number;
  nextLevelXp: number;
  progress: number;
  xpToNextLevel: number;
}

export interface CampaignReportRenderInputV1 {
  snapshot: CampaignLifecycleSnapshotV1;
  country: CampaignReportCountryV1;
  /** Account-wide empire flag; the played nation remains the report's command identity. */
  flagCountryId?: string;
  masteryBeforeSettlement: Pick<CountryMasteryV1, 'xp' | 'level'>;
  commanderBeforeSettlement?: CommanderProgressBeforeSettlementV1;
  unlockedCountries?: readonly {
    countryId: string;
    name: string;
  }[];
}

export interface CampaignReportOptionsV1 extends CampaignReportRenderInputV1 {
  host?: HTMLElement;
  onReturnToMainMenu: () => void;
}

const OUTCOME_COPY = {
  victory: {
    title: 'Victory secured.',
  },
  defeat: {
    title: 'Timeline complete.',
  },
  surrender: {
    title: 'Timeline ended.',
  },
} as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!);
}

function safeColor(value?: string): string {
  return value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#6bddf2';
}

function whole(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.max(0, value));
}

function signed(value: number): string {
  return value > 0 ? `+${whole(value)}` : value < 0 ? `−${whole(Math.abs(value))}` : '0';
}

function personnel(millions: number): string {
  const value = Math.max(0, millions);
  if (value >= 1) return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}M`;
  if (value >= 0.001) return `${whole(value * 1_000)}K`;
  return whole(value * 1_000_000);
}

function modeLabel(snapshot: CampaignLifecycleSnapshotV1): string {
  if (snapshot.mode === 'standard-2026') return 'Campaign';
  if (snapshot.mode === 'random-world') return 'Alternative Universe';
  return 'Survival';
}

export function createCampaignMasteryProjectionV1(
  mastery: Pick<CountryMasteryV1, 'xp' | 'level'>,
  xpEarned: number,
): CampaignMasteryProjectionV1 {
  const xpBefore = Math.max(0, Math.floor(Number(mastery.xp) || 0));
  const earned = Math.max(0, Math.floor(Number(xpEarned) || 0));
  const xpAfter = xpBefore + earned;
  const levelBefore = countryMasteryLevelFromXpV1(xpBefore);
  const levelAfter = countryMasteryLevelFromXpV1(xpAfter);
  const levelStartXp = countryMasteryXpForLevelV1(levelAfter);
  const nextLevelXp = levelAfter >= MAX_COUNTRY_MASTERY_LEVEL
    ? levelStartXp
    : countryMasteryXpForLevelV1(levelAfter + 1);
  const progress = levelAfter >= MAX_COUNTRY_MASTERY_LEVEL
    ? 1
    : Math.max(0, Math.min(1, (xpAfter - levelStartXp) / Math.max(1, nextLevelXp - levelStartXp)));
  return {
    xpBefore,
    xpAfter,
    xpEarned: earned,
    levelBefore,
    levelAfter,
    levelsGained: levelAfter - levelBefore,
    levelStartXp,
    nextLevelXp,
    progress,
    xpToNextLevel: levelAfter >= MAX_COUNTRY_MASTERY_LEVEL
      ? 0 : Math.max(0, nextLevelXp - xpAfter),
  };
}

export function createCommanderProgressProjectionV1(
  commander: CommanderProgressBeforeSettlementV1,
  xpEarned: number,
): CommanderProgressProjectionV1 {
  const xpBefore = Math.max(0, Math.floor(Number(commander.xp) || 0));
  const earned = Math.max(0, Math.floor(Number(xpEarned) || 0));
  const xpAfter = xpBefore + earned;
  const levelBefore = commanderLevelFromXpV1(xpBefore);
  const levelAfter = commanderLevelFromXpV1(xpAfter);
  const levelStartXp = commanderXpForLevelV1(levelAfter);
  const nextLevelXp = commanderXpForLevelV1(levelAfter + 1);
  const progress = Math.max(0, Math.min(
    1,
    (xpAfter - levelStartXp) / Math.max(1, nextLevelXp - levelStartXp),
  ));
  const levelsGained = levelAfter - levelBefore;
  const availableBefore = Number.isFinite(commander.talentPointsAvailable)
    ? Math.max(0, Math.floor(Number(commander.talentPointsAvailable)))
    : undefined;
  return {
    xpBefore,
    xpAfter,
    xpEarned: earned,
    levelBefore,
    levelAfter,
    levelsGained,
    talentPointsEarned: levelsGained,
    ...(availableBefore === undefined ? {} : { talentPointsAfter: availableBefore + levelsGained }),
    levelStartXp,
    nextLevelXp,
    progress,
    xpToNextLevel: Math.max(0, nextLevelXp - xpAfter),
  };
}

export function renderCampaignReportHtmlV1(input: CampaignReportRenderInputV1): string {
  const { snapshot, country } = input;
  const copy = OUTCOME_COPY[snapshot.outcome];
  const mastery = createCampaignMasteryProjectionV1(
    input.masteryBeforeSettlement,
    snapshot.reward.masteryXp,
  );
  const flag = countryFlagHtml(
    input.flagCountryId ?? snapshot.countryId,
    escapeHtml(country.sigil ?? country.shortName?.slice(0, 2).toUpperCase() ?? '•'),
    true,
  );
  const warRecordNote = snapshot.warRecord.complete ? 'COMPLETE RECORD' : 'RECORDED RESULTS';
  const lossesNote = snapshot.militaryLossesComplete ? 'CAMPAIGN TOTAL' : 'VERIFIED LOSSES';
  const masteryLevelLabel = mastery.levelsGained > 0
    ? `LEVEL ${mastery.levelBefore} → ${mastery.levelAfter}`
    : `LEVEL ${mastery.levelAfter}`;
  const masteryTarget = mastery.levelAfter >= MAX_COUNTRY_MASTERY_LEVEL
    ? 'MAXIMUM MASTERY REACHED'
    : `${whole(mastery.xpToNextLevel)} XP TO LEVEL ${mastery.levelAfter + 1}`;
  const commander = input.commanderBeforeSettlement
    ? createCommanderProgressProjectionV1(
      input.commanderBeforeSettlement,
      snapshot.reward.commanderXp,
    )
    : undefined;
  const commanderLevelLabel = commander
    ? commander.levelsGained > 0
      ? `LEVEL ${commander.levelBefore} → ${commander.levelAfter}`
      : `LEVEL ${commander.levelAfter}`
    : 'ACCOUNT EXPERIENCE';
  const commanderTarget = commander
    ? `${whole(commander.xpToNextLevel)} XP TO LEVEL ${commander.levelAfter + 1}`
    : 'Applied to your persistent APEX intelligence';
  const talentNote = commander?.talentPointsEarned
    ? `<em>+${whole(commander.talentPointsEarned)} TALENT POINT${commander.talentPointsEarned === 1 ? '' : 'S'}</em>`
    : commander?.talentPointsAfter !== undefined
      ? `<em>${whole(commander.talentPointsAfter)} TALENT POINT${commander.talentPointsAfter === 1 ? '' : 'S'} AVAILABLE</em>`
      : '';
  const eligibilityNote = snapshot.rewardEligible
    ? ''
    : '<p class="campaign-report__eligibility">Alternative Universe grants no Nation Mastery XP, APEX XP, Credits or nation unlocks.</p>';
  const accountFooter = snapshot.outcome === 'defeat' || snapshot.outcome === 'surrender'
    ? '<div class="campaign-report__apex-return"><span>APEX · TEMPORAL RETURN</span><small>“This timeline is lost—not our war. I will take us back with everything we learned. Next time, we arrive stronger.”</small></div>'
    : snapshot.rewardEligible
      ? `<div><span>TIMELINE INTELLIGENCE SAVED</span><small>${snapshot.mode === 'standard-2026'
        ? 'APEX returned earned APEX XP, Nation Mastery XP and Credits to the origin point.'
        : 'APEX returned earned APEX XP and Nation Mastery XP to the origin point.'}</small></div>`
      : '';
  const creditLabel = snapshot.mode === 'standard-2026'
    ? `+${whole(snapshot.reward.creditsEarned)}` : '0';
  const creditNote = snapshot.mode === 'standard-2026'
    ? snapshot.reward.creditsEarned > 0
      ? 'Earned from meaningful Campaign activity'
      : 'No qualifying Campaign activity recorded'
    : snapshot.mode === 'survival'
      ? 'Survival awards XP and Mastery, but no Credits'
      : 'Alternative Universe has no account rewards';
  const unlockedAccess = snapshot.mode === 'standard-2026'
    && (input.unlockedCountries?.length ?? 0) > 0
    ? `<section class="campaign-report__signal-purges" aria-label="New nations unlocked"><div><span>CAMPAIGN VICTORY UNLOCKS</span><strong>${input.unlockedCountries!.length} ${input.unlockedCountries!.length === 1 ? 'NATION' : 'NATIONS'} ADDED</strong></div><ul>${input.unlockedCountries!.map((country) => `<li><b>${escapeHtml(country.name)}</b><span>UNLOCKED · READY IN ALL MODES</span></li>`).join('')}</ul></section>`
    : '';

  return `<div class="campaign-report campaign-report--${snapshot.outcome}" role="dialog" aria-modal="true" aria-labelledby="campaign-report-title" style="--campaign-country:${safeColor(country.cssColor)}">
    <div class="campaign-report__atmosphere" aria-hidden="true"></div>
    <main class="campaign-report__card">
      <header class="campaign-report__header">
        <div class="campaign-report__flag country-flag" aria-hidden="true">${flag}</div>
        <div>
          <span class="campaign-report__eyebrow">FINAL TIMELINE REPORT · ${escapeHtml(modeLabel(snapshot))}</span>
          <h1 id="campaign-report-title">${copy.title}</h1>
        </div>
        <div class="campaign-report__nation">
          <span>COMMAND</span>
          <strong>${escapeHtml(country.name)}</strong>
          <small>WEEK ${whole(snapshot.terminalTick)}</small>
        </div>
      </header>

      <section class="campaign-report__reward-row" aria-label="Campaign progression">
        <article class="campaign-report__mastery">
          <div class="campaign-report__mastery-heading">
            <div><span>COUNTRY MASTERY</span><strong>${masteryLevelLabel}</strong></div>
            <b>+${whole(mastery.xpEarned)} XP</b>
          </div>
          <div class="campaign-report__mastery-track" role="progressbar" aria-label="Country mastery progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(mastery.progress * 100)}"><i style="width:${Math.round(mastery.progress * 100)}%"></i></div>
          <small>${masteryTarget}</small>
        </article>
        <article class="campaign-report__mastery campaign-report__commander">
          <div class="campaign-report__mastery-heading">
            <div><span>APEX LEVEL</span><strong>${commanderLevelLabel}</strong></div>
            <b>+${whole(snapshot.reward.commanderXp)} XP</b>
          </div>
          ${commander ? `<div class="campaign-report__mastery-track" role="progressbar" aria-label="APEX level progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(commander.progress * 100)}"><i style="width:${Math.round(commander.progress * 100)}%"></i></div>` : '<div class="campaign-report__mastery-track is-unresolved" aria-hidden="true"><i></i></div>'}
          <div class="campaign-report__commander-foot"><small>${commanderTarget}</small>${talentNote}</div>
        </article>
        <article class="campaign-report__credits">
          <span>COMMAND CREDITS</span>
          <strong>${creditLabel}</strong>
          <small>${creditNote}</small>
        </article>
      </section>
      ${eligibilityNote}
      ${unlockedAccess}

      <section class="campaign-report__stats" aria-label="Campaign statistics">
        <article><span>WEEKS SURVIVED</span><strong>${whole(snapshot.weeksSurvived)}</strong><small>${Math.floor(snapshot.weeksSurvived / 52)} years in command</small></article>
        <article><span>LIBERATION DELTA</span><strong class="${snapshot.territoryDelta < 0 ? 'is-negative' : snapshot.territoryDelta > 0 ? 'is-positive' : ''}">${signed(snapshot.territoryDelta)}</strong><small>${snapshot.currentTerritoryIds.length} held · ${snapshot.territoriesGainedIds.length} liberated · ${snapshot.territoriesLostIds.length} lost</small></article>
        <article><span>WAR RECORD</span><strong>${whole(snapshot.warsWon)}–${whole(snapshot.warsLost)}</strong><small>${warRecordNote}</small></article>
        <article><span>ROGUE WAVE</span><strong>${whole(snapshot.highestSurvivalWave)}</strong></article>
        <article><span>MILITARY LOSSES</span><strong>${personnel(snapshot.militaryLosses)}</strong><small>${lossesNote}</small></article>
        <article><span>CAMPAIGN SCORE</span><strong>${whole(snapshot.reward.score)}</strong></article>
      </section>

      <footer class="campaign-report__footer">
        ${accountFooter}
        <button type="button" data-campaign-report-action="main-menu" autofocus>Return to main menu</button>
      </footer>
    </main>
  </div>`;
}

/** Fullscreen, self-contained campaign settlement surface. */
export class CampaignReportV1 {
  private readonly host: HTMLElement;
  private returned = false;

  constructor(private readonly options: CampaignReportOptionsV1) {
    const host = options.host ?? document.querySelector<HTMLElement>('#hud');
    if (!host) throw new Error('CampaignReportV1 requires a host element or #hud.');
    this.host = host;
    this.host.classList.add('campaign-report-host');
    this.host.addEventListener('click', this.onClick);
    this.host.innerHTML = renderCampaignReportHtmlV1(options);
    queueMicrotask(() => {
      this.host.querySelector<HTMLButtonElement>('[data-campaign-report-action="main-menu"]')?.focus();
    });
  }

  destroy(): void {
    this.host.removeEventListener('click', this.onClick);
    this.host.classList.remove('campaign-report-host');
    this.host.innerHTML = '';
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-campaign-report-action="main-menu"]')
      : null;
    if (!target || this.returned) return;
    this.returned = true;
    this.options.onReturnToMainMenu();
  };
}
