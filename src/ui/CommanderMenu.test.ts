import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  STARTER_COUNTRY_ID,
  commanderMaxIntegrityV1,
  commanderXpForLevelV1,
  countryMasteryXpForLevelV1,
  countryUnlockQuoteV1,
  createCommanderProfileV1,
  emptyCommanderTalentsV1,
  grantStarterCountriesV1,
  recordCampaignDefeatedCountriesV1,
  resolveCountryLoadoutV1,
  type CommanderDoctrineV1,
  type CommanderProfileV1,
} from '../meta/commanderProfile';
import type { StoredCampaignV1 } from '../meta/commanderStorage';
import commanderMenuSource from './CommanderMenu.ts?raw';
import {
  CommanderMenuV1,
  commanderLevelProgressV1,
  commanderTalentEffectCopyV1,
  countryMasteredMilitaryPowerV1,
  countryMasteryTrackEffectCopyV1,
  countryUpgradeEffectCopyV1,
  nextCommanderProgressionTargetV1,
  ordinalV1,
  renderCommanderTalentBranchesV1,
  strongestUnlockedCountryIdV1,
  type CommanderCountryCatalogEntryV1,
  type CommanderMenuOptionsV1,
} from './CommanderMenu';

const stylesSource = readFileSync(new URL('./CommanderMenu.css', import.meta.url), 'utf8');

function testCountry(
  id: string,
  name: string,
  strengthRank: number,
  strategicAccess: readonly { countryId: string; kind: 'land' | 'naval' }[] = [],
): CommanderCountryCatalogEntryV1 {
  return {
    id,
    name,
    shortName: name,
    continent: 'Test Continent',
    subregion: 'Test Region',
    cssColor: '#123456',
    sigil: id.slice(0, 2).toUpperCase(),
    militaryPower: 100,
    strategicAccess,
    opening: {
      attack: 2 + (197 - strengthRank) / 100,
      defense: 2.2 + (197 - strengthRank) / 100,
      iq: 80,
      armyManpower: 0.01,
      armyCapacity: 0.02,
      trainedReserves: 0.003,
      population: 1,
      economy: 10,
      treasury: 2,
      economicGrowth: 1.5,
      populationGrowth: 0.6,
      gdpPerCapita: 0.01,
    },
    quote: countryUnlockQuoteV1(id, strengthRank, 196),
  };
}

interface CommanderMenuTestHooks {
  profile?: Partial<CommanderProfileV1>;
  onStartMode?: (mode: string, countryId: string, replaceExistingCampaign: boolean) => void;
  onMultiplayerRequested?: (mode: string, countryId: string) => void;
  onSurrenderCampaign?: () => void;
  onSelectDoctrine?: (doctrine: CommanderDoctrineV1) => void;
  onRespec?: () => void;
  campaign?: StoredCampaignV1;
  multiplayerResume?: CommanderMenuOptionsV1['multiplayerResume'];
  onResumeMultiplayer?: () => void;
  onDiscardMultiplayerResume?: () => void;
  onAllocateCountryMasteryPoint?: CommanderMenuOptionsV1['onAllocateCountryMasteryPoint'];
  onRespecCountryMastery?: CommanderMenuOptionsV1['onRespecCountryMastery'];
  onAllocateCommanderTalent?: CommanderMenuOptionsV1['onAllocateCommanderTalent'];
  onSelectEmpireFlag?: CommanderMenuOptionsV1['onSelectEmpireFlag'];
  onAcknowledgeCampaignProgressionTutorial?: CommanderMenuOptionsV1['onAcknowledgeCampaignProgressionTutorial'];
}

function mountCommanderMenuForTest(
  onResetAccount = vi.fn(),
  hooks: CommanderMenuTestHooks = {},
) {
  const listeners = new Map<string, (event: Event) => void>();
  const classNames = new Set<string>();
  const scrollRegions = new Map<string, FakeElement>();
  let renderedHtml = '';
  let activeElement: FakeElement | null = null;
  const pageScroll = { top: 0, left: 0 };
  const focusCalls: Array<{ key: string; preventScroll: boolean }> = [];
  const datasetFromAttributes = (attributes: string): DOMStringMap => {
    const dataset: Record<string, string> = {};
    for (const match of attributes.matchAll(/\bdata-([a-z0-9-]+)="([^"]*)"/gi)) {
      const key = match[1]!.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      dataset[key] = match[2]!;
    }
    return dataset as DOMStringMap;
  };
  const host = {
    get innerHTML(): string { return renderedHtml; },
    set innerHTML(value: string) {
      renderedHtml = value;
      scrollRegions.clear();
      for (const match of value.matchAll(/<[^>]+\bdata-scroll-session="([^"]+)"[^>]*>/gi)) {
        const session = match[1]!;
        scrollRegions.set(session, new FakeElement('', { scrollSession: session }));
      }
    },
    classList: {
      add: (value: string) => classNames.add(value),
      remove: (value: string) => classNames.delete(value),
    },
    addEventListener: (type: string, listener: (event: Event) => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    contains: () => true,
    querySelector: (selector: string) => {
      if (selector === '.commander-country-list') {
        return scrollRegions.get('commander:country-list')
          ?? scrollRegions.get('commander:start-country-list') ?? null;
      }
      const countryMatch = selector.match(/\.commander-country-row\[data-country="([^"]+)"\]/);
      if (countryMatch) {
        return actionElements().find((element) => (
          element.dataset.action === 'select-meta-country'
            && element.dataset.country === countryMatch[1]
        )) ?? null;
      }
      return null;
    },
    querySelectorAll: (selector: string) => {
      if (selector.includes('[data-commander-scroll]') || selector === '[data-scroll-session]') {
        return [...scrollRegions.values()];
      }
      if (selector.includes('[data-action]') || selector.includes('[id]')) return actionElements();
      return [];
    },
  } as unknown as HTMLElement;
  class FakeElement {
    readonly dataset: DOMStringMap;
    readonly id: string;
    readonly disabled: boolean;
    scrollTop = 0;
    scrollLeft = 0;
    innerHTML = '';
    private readonly parentScrollSession?: string;
    constructor(
      action: string,
      data: Record<string, string> = {},
      options: { id?: string; disabled?: boolean; parentScrollSession?: string } = {},
    ) {
      this.dataset = { action, ...data } as DOMStringMap;
      this.id = options.id ?? '';
      this.disabled = options.disabled ?? false;
      this.parentScrollSession = options.parentScrollSession;
    }
    closest(selector: string): FakeElement | null {
      if (selector.includes('[data-scroll-session]')) {
        if (this.dataset.scrollSession) return this;
        return this.parentScrollSession
          ? scrollRegions.get(this.parentScrollSession) ?? null : null;
      }
      return this;
    }
    focus(options?: FocusOptions): void {
      if (this.disabled) return;
      activeElement = this;
      const identity = this.id || Object.entries(this.dataset)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => `${key}:${value}`)
        .join('|');
      focusCalls.push({ key: identity, preventScroll: options?.preventScroll === true });
    }
  }
  const actionElements = (): FakeElement[] => [...renderedHtml.matchAll(/<(button|input)\b([^>]*)>/gi)]
    .map((match) => {
      const attributes = match[2] ?? '';
      const dataset = datasetFromAttributes(attributes);
      const id = attributes.match(/\bid="([^"]+)"/i)?.[1] ?? '';
      return new FakeElement(dataset.action ?? '', { ...dataset }, {
        id,
        disabled: /\sdisabled(?:\s|>|$)/i.test(attributes),
      });
    });
  const scrollingElement = {
    get scrollTop(): number { return pageScroll.top; },
    set scrollTop(value: number) { pageScroll.top = value; },
    get scrollLeft(): number { return pageScroll.left; },
    set scrollLeft(value: number) { pageScroll.left = value; },
  };
  const fakeDocument = {
    querySelector: () => host,
    scrollingElement,
    get activeElement(): FakeElement | null { return activeElement; },
  };
  const fakeWindow = {
    get scrollY(): number { return pageScroll.top; },
    get scrollX(): number { return pageScroll.left; },
    scrollTo: (first: ScrollToOptions | number, second?: number) => {
      if (typeof first === 'number') {
        pageScroll.left = first;
        pageScroll.top = second ?? pageScroll.top;
      } else {
        pageScroll.left = first.left ?? pageScroll.left;
        pageScroll.top = first.top ?? pageScroll.top;
      }
    },
  };
  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('Element', FakeElement);

  const starterBase = grantStarterCountriesV1(
    createCommanderProfileV1(1, 'menu-test'),
    [STARTER_COUNTRY_ID],
    2,
  ).profile;
  const base = { ...starterBase, unlockedCountryIds: ['bel'] };
  const profile = {
    ...base,
    ...hooks.profile,
  };
  const countries = [
    testCountry('usa', 'United States of America', 1, [{ countryId: 'nld', kind: 'naval' }]),
    testCountry('nld', 'Netherlands', 150, [
      { countryId: 'bel', kind: 'land' },
      { countryId: 'usa', kind: 'naval' },
    ]),
    testCountry('bel', 'Belgium', 196, [{ countryId: 'nld', kind: 'land' }]),
  ];
  const menu = new CommanderMenuV1({
    profile,
    countries,
    campaign: hooks.campaign,
    multiplayerResume: hooks.multiplayerResume,
    onStartMode: (mode, countryId, replaceExistingCampaign) => (
      hooks.onStartMode?.(mode, countryId, replaceExistingCampaign)
    ),
    onMultiplayerRequested: (mode, countryId) => hooks.onMultiplayerRequested?.(mode, countryId),
    onContinueCampaign: vi.fn(),
    onDeleteCampaign: vi.fn(),
    onSurrenderCampaign: () => hooks.onSurrenderCampaign?.(),
    onResumeMultiplayer: () => hooks.onResumeMultiplayer?.(),
    onDiscardMultiplayerResume: () => hooks.onDiscardMultiplayerResume?.(),
    onResetAccount,
    onAcknowledgeCampaignProgressionTutorial: hooks.onAcknowledgeCampaignProgressionTutorial
      ?? (() => ({ accepted: false, profile })),
    onAllocateCountryMasteryPoint: hooks.onAllocateCountryMasteryPoint
      ?? (() => ({ accepted: false, profile })),
    onRespecCountryMastery: hooks.onRespecCountryMastery
      ?? (() => ({ accepted: false, profile })),
    onAllocateCommanderTalent: hooks.onAllocateCommanderTalent
      ?? (() => ({ accepted: false, profile })),
    onSelectCommanderDoctrine: (doctrine) => {
      hooks.onSelectDoctrine?.(doctrine);
      return { accepted: false, profile };
    },
    onRespecCommanderTalents: () => {
      hooks.onRespec?.();
      return { accepted: false, profile };
    },
    onRenameCommander: () => ({ accepted: false, profile }),
    onRenameEmpire: () => ({ accepted: false, profile }),
    onSelectEmpireFlag: hooks.onSelectEmpireFlag
      ?? (() => ({ accepted: false, profile })),
  });
  const click = (action: string, data: Record<string, string> = {}): void => {
    const parentScrollSession = action === 'allocate-commander-talent'
      || action === 'select-commander-doctrine'
      || action === 'respec-commander-talents'
      ? 'commander:talents'
      : action === 'upgrade-meta-country' || action === 'unlock-meta-country'
        || action === 'allocate-country-mastery' || action === 'respec-country-mastery'
        ? `commander:arsenal-detail:${data.country ?? ''}` : undefined;
    const target = new FakeElement(action, data, { parentScrollSession });
    activeElement = target;
    listeners.get('click')?.({ target } as unknown as Event);
  };
  return {
    host,
    menu,
    click,
    scrollRegion: (session: string) => scrollRegions.get(session),
    setPageScroll: (top: number, left = 0) => {
      pageScroll.top = top;
      pageScroll.left = left;
    },
    pageScroll,
    focusCalls,
    cleanup: () => {
      menu.destroy();
      vi.unstubAllGlobals();
    },
  };
}

describe('commander level and talent menu', () => {
  it('formats worldwide stat standings as readable English ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 100].map(ordinalV1)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '100th',
    ]);
  });

  it('describes every country upgrade with exact current and next totals', () => {
    expect(countryUpgradeEffectCopyV1('mobilization', 0)).toBe(
      'Opening Army +0% · Training and Force Capacity +0 effect levels',
    );
    expect(countryUpgradeEffectCopyV1('mobilization', 1)).toBe(
      'Opening Army +4% · Training and Force Capacity +1 effect levels',
    );
    expect(countryUpgradeEffectCopyV1('logistics', 2)).toBe(
      'Supply +2 effect levels · Operating Efficiency +2 effect levels',
    );
    expect(countryUpgradeEffectCopyV1('research', 3)).toBe(
      'Research Speed +3 effect levels · Research Efficiency +3 effect levels',
    );
    expect(countryUpgradeEffectCopyV1('economy', 4)).toBe(
      'Opening treasury and territory economy +16% · Economy Growth and Tax Efficiency +4 effect levels',
    );
    expect(countryUpgradeEffectCopyV1('trait', 5)).toBe('Legacy upgrade inactive');
  });

  it('shows exact repeatable military mastery totals', () => {
    expect(countryMasteryTrackEffectCopyV1('force', 0)).toBe('+0% Army Capacity');
    expect(countryMasteryTrackEffectCopyV1('force', 3)).toBe('+3% Army Capacity');
    expect(countryMasteryTrackEffectCopyV1('firepower', 4)).toBe('+6% ATK');
    expect(countryMasteryTrackEffectCopyV1('defense', 5)).toBe('+7.5% DEF');
    expect(countryMasteryTrackEffectCopyV1('mobilization', 2)).toBe(
      '+5% Peace Recruitment',
    );
    expect(countryMasteryTrackEffectCopyV1('land-logistics', 2)).toBe(
      '+4% Land Supply · +3% Land Transfer',
    );
    expect(countryMasteryTrackEffectCopyV1('expeditionary', 2)).toBe(
      '+3% Naval Supply · +2% Naval Transfer · −1% Naval Cost',
    );
    expect(countryMasteryTrackEffectCopyV1('military-industry', 2)).toBe(
      '−1.99% Recruit Cost · −1.49% Army Upkeep',
    );
    expect(countryMasteryTrackEffectCopyV1('field-medicine', 2)).toBe('−1.99% Casualties');
    expect(countryMasteryTrackEffectCopyV1('field-medicine', 0)).toBe('0% Casualties');
  });

  it('keeps one Capacity point close to the real Power value of quality choices', () => {
    const country = testCountry('bel', 'Belgium', 100);
    const base = createCommanderProfileV1(1, 'mastery-balance');
    const profileWith = (track: 'force' | 'firepower' | 'defense'): CommanderProfileV1 => ({
      ...base,
      countryMastery: {
        bel: {
          xp: countryMasteryXpForLevelV1(2),
          level: 2,
          campaigns: 1,
          victories: 0,
          bestSurvivalWave: 0,
          allocations: {
            force: track === 'force' ? 1 : 0,
            firepower: track === 'firepower' ? 1 : 0,
            defense: track === 'defense' ? 1 : 0,
            mobilization: 0,
            'land-logistics': 0,
            expeditionary: 0,
            'military-industry': 0,
            'field-medicine': 0,
          },
        },
      },
    });
    const capacityPower = countryMasteredMilitaryPowerV1(profileWith('force'), country);
    const firepowerPower = countryMasteredMilitaryPowerV1(profileWith('firepower'), country);
    const defensePower = countryMasteredMilitaryPowerV1(profileWith('defense'), country);

    // Capacity remains a valid long-term build, but its fully recruited Power
    // ceiling is no longer several times more efficient than direct quality.
    expect(capacityPower).toBeLessThan(firepowerPower * 1.005);
    expect(capacityPower).toBeLessThan(defensePower * 1.005);
  });

  it('projects XP within the current Commander level and exposes one point per level', () => {
    const level = 6;
    const current = commanderXpForLevelV1(level);
    const next = commanderXpForLevelV1(level + 1);
    const talents = emptyCommanderTalentsV1();
    talents['elite-vanguard'] = 1;
    talents['mobile-logistics'] = 1;
    const profile = {
      ...createCommanderProfileV1(1, 'talent-test'),
      commanderLevel: level,
      commanderXp: current + Math.floor((next - current) / 2),
      commanderTalents: talents,
    };

    const progress = commanderLevelProgressV1(profile);
    expect(progress.level).toBe(level);
    expect(progress.availableTalentPoints).toBe(4);
    expect(progress.xpIntoLevel).toBe(profile.commanderXp - current);
    expect(progress.xpForNextLevel).toBe(next - current);
    expect(progress.progressPercent).toBeGreaterThanOrEqual(49);
    expect(progress.progressPercent).toBeLessThanOrEqual(50);
  });

  it('renders three distinct APEX paths and one Army path with one exact inspector', () => {
    const talents = emptyCommanderTalentsV1();
    talents['elite-vanguard'] = 2;
    const profile = {
      ...createCommanderProfileV1(1, 'talent-render'),
      commanderLevel: 3,
      commanderTalents: talents,
      commandCredits: 0,
    };
    const html = renderCommanderTalentBranchesV1(profile, 'elite-vanguard');
    const visibleText = html.replace(/<[^>]*>/g, ' ');
    const currentShieldHp = Math.round(
      commanderMaxIntegrityV1(profile.commanderLevel, talents) * 1_000_000,
    ).toLocaleString('en');
    const nextLevelShieldGain = Math.round((
      commanderMaxIntegrityV1(profile.commanderLevel + 1, talents)
        - commanderMaxIntegrityV1(profile.commanderLevel, talents)
    ) * 1_000_000).toLocaleString('en');

    expect(html.match(/data-talent-card=/g)).toHaveLength(12);
    expect(html).toContain('<h2>Assault Shield</h2>');
    expect(html).toContain('<h2>Reactive Matrix</h2>');
    expect(html).toContain('<h2>Energy Core</h2>');
    expect(html).toContain('<h2>Empire Warfare</h2>');
    expect(html).toContain('APEX CORE');
    expect(html).toContain(`ENERGY ${currentShieldHp} / ${currentShieldHp}`);
    expect(html).not.toContain('PULSE ATTACK');
    expect(html).toContain('NEXT LEVEL +');
    expect(nextLevelShieldGain).not.toBe('0');
    expect(html).toContain('RANK 2');
    expect(html.match(/CURRENT · RANK/g)).toHaveLength(1);
    expect(html.match(/NEXT RANK ·/g)).toHaveLength(1);
    expect(html).toContain(commanderTalentEffectCopyV1('elite-vanguard', 2, 'current'));
    expect(html).toContain(commanderTalentEffectCopyV1('elite-vanguard', 2, 'next'));
    expect(html).toContain('NEXT RANK · 3 · LV 3');
    expect(html).toContain('ADD TALENT POINT · 1 PT');
    expect(html).toContain('Overdrive');
    expect(html).toContain('Adaptive Barrier');
    expect(html).toContain('Emergency Reboot');
    expect(html).toContain('Theater Mesh');
    expect(visibleText).not.toMatch(/soldier|personnel|troop|manpower|trained reserve|corps|barracks|hospital|treasury|income|food|research/i);
  });

  it('shows exact numeric Energy for account levels and Max Energy ranks without direct attack', () => {
    const talents = emptyCommanderTalentsV1();
    const profile = {
      ...createCommanderProfileV1(1, 'shield-hp-preview'),
      commanderLevel: 50,
      commanderXp: commanderXpForLevelV1(50),
      commanderTalents: talents,
    };
    const current = commanderMaxIntegrityV1(50, talents);
    const nextLevel = commanderMaxIntegrityV1(51, talents);
    const rankOneTalents = { ...talents, 'reserve-cadre': 1 };
    const nextRank = commanderMaxIntegrityV1(50, rankOneTalents);
    const html = renderCommanderTalentBranchesV1(profile, 'reserve-cadre');

    expect(Math.round(current * 1_000_000)).toBe(24_000);
    expect(html).toContain('ENERGY 24,000 / 24,000');
    expect(html).not.toContain('PULSE ATTACK');
    expect(html).toContain('NEXT LEVEL +');
    expect(nextLevel).toBeGreaterThan(current);
    expect(html).toContain('<em>APEX TOTAL · 24,000 MAX ENERGY</em>');
    expect(html).toContain(`<em>TALENT GAIN · +${Math.round((nextRank - current) * 1_000_000).toLocaleString('en')} MAX ENERGY</em>`);

    const rankZero = renderCommanderTalentBranchesV1({ ...profile, commanderLevel: 1 }, 'reserve-cadre');
    expect(rankZero).toContain('<strong>+0% Max Energy</strong>');
    expect(rankZero).toContain('APEX TOTAL · 2,000 MAX ENERGY');
    expect(rankZero).toContain('<strong>+0.5% Max Energy</strong>');
    expect(rankZero).toContain('TALENT GAIN · +10 MAX ENERGY');
    expect(rankZero).not.toContain('<strong>+2,000');
  });

  it('keeps legacy core ranks visible while showing the next deep-rank level gate', () => {
    const talents = emptyCommanderTalentsV1();
    talents['elite-vanguard'] = 15;
    talents['science-corps'] = 3;
    talents['volunteer-brigade'] = 3;
    const profile = {
      ...createCommanderProfileV1(1, 'talent-max'),
      commanderLevel: 23,
      commanderXp: commanderXpForLevelV1(23),
      commanderTalents: talents,
    };
    const html = renderCommanderTalentBranchesV1(profile, 'elite-vanguard');
    const eliteCard = html.slice(
      html.indexOf('data-talent-card="elite-vanguard"'),
      html.indexOf('</button>', html.indexOf('data-talent-card="elite-vanguard"')),
    );
    const volunteerCard = html.slice(
      html.indexOf('data-talent-card="volunteer-brigade"'),
      html.indexOf('</button>', html.indexOf('data-talent-card="volunteer-brigade"')),
    );
    expect(eliteCard).toContain('RANK 15 · ENDLESS');
    expect(eliteCard).toContain('LV 79');
    expect(html).toContain('CURRENT · RANK 15');
    expect(html).toContain('NEXT RANK · 16 · LV 79');
    expect(html).toContain('APEX LEVEL 79</button>');
    expect(volunteerCard).toContain('RANK 3');
    expect(commanderTalentEffectCopyV1('elite-vanguard', 15, 'next'))
      .not.toBe(commanderTalentEffectCopyV1('elite-vanguard', 0, 'next'));
    expect(commanderTalentEffectCopyV1('treasury-reserve', 15, 'current'))
      .toBe('+6.3% Split-Front Efficiency Retained');
    expect(commanderTalentEffectCopyV1('treasury-reserve', 15, 'current'))
      .not.toMatch(/income|treasury|research|\$/i);
    expect(commanderTalentEffectCopyV1('treasury-reserve', Number.MAX_SAFE_INTEGER, 'current'))
      .toMatch(/^\+[\d.]+% Split-Front Efficiency Retained$/);

    const postHundred = commanderLevelProgressV1({
      ...profile,
      commanderLevel: 145,
      commanderXp: commanderXpForLevelV1(145),
    });
    expect(postHundred.level).toBe(145);
    expect(postHundred.xpForNextLevel).toBeGreaterThan(0);
  });

  it('wires the dedicated screen, persistent profile strip and responsive talent layout', () => {
    expect(commanderMenuSource).toContain("type CommanderMenuView = 'home' | 'country' | 'mode' | 'arsenal' | 'talents'");
    expect(commanderMenuSource).toContain("action === 'open-talents'");
    expect(commanderMenuSource).toContain("action === 'toggle-multiplayer'");
    expect(commanderMenuSource).toContain('role="switch"');
    expect(commanderMenuSource).toContain("action === 'allocate-commander-talent'");
    expect(commanderMenuSource).toContain("action === 'allocate-country-mastery'");
    expect(commanderMenuSource).toContain("action === 'respec-country-mastery'");
    expect(commanderMenuSource).toContain('onAllocateCountryMasteryPoint: (');
    expect(commanderMenuSource).toContain('onRespecCountryMastery: (countryId: string)');
    expect(commanderMenuSource).toContain('onAllocateCommanderTalent: (talentId: CommanderTalentId)');
    expect(commanderMenuSource).toContain('onSelectCommanderDoctrine: (doctrine: CommanderDoctrineV1)');
    expect(commanderMenuSource).toContain('onRespecCommanderTalents: ()');
    expect(commanderMenuSource).toContain("action === 'select-commander-doctrine'");
    expect(commanderMenuSource).toContain("action === 'respec-commander-talents'");
    expect(commanderMenuSource).toContain('onRenameEmpire: (name: string)');
    expect(commanderMenuSource).toContain('onSelectEmpireFlag: (flag: EmpireFlagIdentityV1)');
    expect(commanderMenuSource).toContain("action === 'rename-empire'");
    expect(commanderMenuSource).toContain('id="empire-account-name"');
    expect(commanderMenuSource).toContain('commander-account-settings');
    expect(commanderMenuSource).toContain('id="commander-empire-flag-search"');
    expect(stylesSource).toContain('.commander-flag-picker__grid');
    expect(commanderMenuSource).not.toMatch(/Command Credits|\bCC\b|purchase/i);
    expect(commanderMenuSource).toContain('APEX EVOLUTION MATRIX');
    expect(commanderMenuSource).not.toContain('commander-talent-overview__rank');
    expect(commanderMenuSource).not.toContain('commander-talent-overview__progress');
    expect(commanderMenuSource).toContain("label: 'Assault Shield'");
    expect(commanderMenuSource).toContain("label: 'Reactive Matrix'");
    expect(commanderMenuSource).toContain("label: 'Energy Core'");
    expect(commanderMenuSource).toContain("label: 'Empire Warfare'");
    expect(commanderMenuSource).toContain('Only one capstone can be active.');
    expect(commanderMenuSource).not.toContain('BORDERLESS ORGANISATION');
    expect(commanderMenuSource).toContain('ENDLESS AFTER RANK 15');
    expect(commanderMenuSource).not.toContain('SYNERGY');
    expect(commanderMenuSource).not.toContain('specialist posture');
    expect(commanderMenuSource).not.toMatch(/maximum apex level|max rank|level 100 cannot/i);
    expect(stylesSource).toContain('.commander-profile-strip__level');
    expect(stylesSource).toContain('.commander-shield-tree');
    expect(stylesSource).toContain('.commander-talent-inspector');
    expect(stylesSource).toContain('.commander-talent-lanes');
    expect(stylesSource).toContain('.commander-talent-node');
    expect(stylesSource).toContain('.commander-talent-protocol__glyph');
    expect(stylesSource).toContain('grid-template-columns:350px minmax(0,1fr)');
    expect(commanderMenuSource).toContain('class="commander-talents__scroll" tabindex="0"');
    expect(commanderMenuSource).toContain('data-commander-scroll');
    expect(commanderMenuSource).toContain("['PageDown', 'PageUp', 'Home', 'End']");
    expect(stylesSource).toContain('.commander-menu-shell--talents { display:grid;');
    expect(stylesSource).toContain('overscroll-behavior:contain');
    expect(stylesSource).toContain('touch-action:pan-y');
    expect(stylesSource).toContain('@media (max-width:800px)');
    expect(stylesSource).toContain('.commander-talent-lanes { grid-template-columns:1fr; gap:12px; }');
  });

  it('shows locked doctrines as disabled and wires exclusive selection plus free respec', () => {
    const locked = mountCommanderMenuForTest();
    try {
      locked.click('open-talents');
      expect(locked.host.innerHTML.match(/commander-talent-protocol /g)).toHaveLength(4);
      expect(locked.host.innerHTML.match(/CAPSTONE ABILITY/g)).toHaveLength(4);
      expect(locked.host.innerHTML.match(/commander-talent-protocol__glyph/g)).toHaveLength(4);
      expect(locked.host.innerHTML).toMatch(
        /Adaptive Barrier[\s\S]*?REQUIRES Adaptive Barrier Core Rank 5[\s\S]*?data-doctrine="bastion" disabled>CAPSTONE LOCKED/,
      );
      expect(locked.host.innerHTML).toMatch(
        /Theater Mesh[\s\S]*?REQUIRES Theater Coordination Rank 5[\s\S]*?data-doctrine="force-multiplier" disabled>CAPSTONE LOCKED/,
      );
      expect(locked.host.innerHTML).toContain('<strong>NO CAPSTONE ACTIVE</strong>');
      expect(locked.host.innerHTML).not.toContain('ACTIVE · MUTUALLY EXCLUSIVE');
    } finally {
      locked.cleanup();
    }

    const doctrineSpy = vi.fn();
    const respecSpy = vi.fn();
    const talents = emptyCommanderTalentsV1();
    talents['elite-vanguard'] = 5;
    talents['doctrine-command'] = 5;
    talents['frugal-quartermaster'] = 5;
    talents['theater-network'] = 5;
    const ready = mountCommanderMenuForTest(vi.fn(), {
      profile: {
        commanderLevel: 20,
        commanderXp: commanderXpForLevelV1(20),
        commanderTalents: talents,
        activeDoctrine: 'vanguard',
      },
      onSelectDoctrine: doctrineSpy,
      onRespec: respecSpy,
    });
    try {
      ready.click('open-talents');
      expect(ready.host.innerHTML).toContain('20 INVESTED · ENDLESS AFTER RANK 15');
      expect(ready.host.innerHTML).toContain('CAPSTONE ABILITY · ACTIVE');
      expect(ready.host.innerHTML).toContain('<strong>Overdrive</strong>');
      expect(ready.host.innerHTML).toContain('data-doctrine="bastion" >ACTIVATE PROTOCOL');
      expect(ready.host.innerHTML).toContain('data-action="respec-commander-talents" >FREE FULL RESPEC');

      ready.click('select-commander-doctrine', { doctrine: 'bastion' });
      ready.click('respec-commander-talents');
      expect(doctrineSpy).toHaveBeenCalledOnce();
      expect(doctrineSpy).toHaveBeenCalledWith('bastion');
      expect(respecSpy).toHaveBeenCalledOnce();
    } finally {
      ready.cleanup();
    }
  });

  it('puts owned nations first in the Arsenal, then Campaign targets', () => {
    const mounted = mountCommanderMenuForTest();
    try {
      mounted.menu.openArsenal();
      const order = [...mounted.host.innerHTML.matchAll(
        /data-action="select-meta-country" data-country="([^"]+)"/g,
      )].map((match) => match[1]);
      expect(order[0]).toBe('bel');
      expect(new Set(order.slice(1))).toEqual(new Set(['nld', 'usa']));
      expect(mounted.host.innerHTML).toContain('is-unlocked is-selected');
      expect(mounted.host.innerHTML).toContain('data-roster-group="owned"');
      expect(mounted.host.innerHTML).toContain('data-roster-group="locked"');
      expect(mounted.host.innerHTML).toContain('<strong>Your Nations</strong>');
      expect(mounted.host.innerHTML).toContain('<strong>Campaign Targets</strong>');
      expect(mounted.host.innerHTML).not.toContain('Owned nations available as your next flagship.');
      expect(mounted.host.innerHTML).toContain('aria-label="Selected nation progression" data-commander-scroll');
      expect(mounted.host.innerHTML).toContain('aria-label="Nation roster" data-commander-scroll');
      expect(mounted.host.innerHTML).toContain('>READY</b>');
      expect(mounted.host.innerHTML).toContain('DEFEAT IN CAMPAIGN');
      expect(mounted.host.innerHTML).not.toMatch(/Command Credits|\bCC\b|purchase/i);
      expect(mounted.host.innerHTML).toContain('BASE POWER');
      expect(mounted.host.innerHTML).toContain('MASTERED POWER');
      expect(mounted.host.innerHTML).toContain('LEVEL BONUS</b> +0% Army Capacity');
      expect(mounted.host.innerHTML).toContain('NEXT: +0.25% ARMY CAPACITY + 1 POINT');
      expect(mounted.host.innerHTML).toContain('CAMPAIGN · SURVIVAL EMPIRE');
      expect(mounted.host.innerHTML).toContain('Every owned nation brings its mastery build into Survival.');
      expect(mounted.host.innerHTML).toContain('Force Structure');
      expect(mounted.host.innerHTML).toContain('Firepower');
      expect(mounted.host.innerHTML).toContain('Defense Grid');
      expect(mounted.host.innerHTML).toContain('+1% Army Capacity');
      expect(mounted.host.innerHTML).toContain('+1.5% ATK');
      expect(mounted.host.innerHTML).toContain('+1.5% DEF');
      expect(mounted.host.innerHTML).toContain('+2.5% Peace Recruitment');
      expect(mounted.host.innerHTML).toContain('Land Logistics');
      expect(mounted.host.innerHTML).toContain('+2% Land Supply · +1.5% Land Transfer');
      expect(mounted.host.innerHTML).toContain('Expeditionary');
      expect(mounted.host.innerHTML).toContain('+1.5% Naval Supply · +1% Naval Transfer · −0.5% Naval Cost');
      expect(mounted.host.innerHTML).toContain('Military Industry');
      expect(mounted.host.innerHTML).toContain('−1% Recruit Cost · −0.75% Army Upkeep');
      expect(mounted.host.innerHTML).toContain('Field Medicine');
      expect(mounted.host.innerHTML).toContain('−1% Casualties');
      expect(mounted.host.innerHTML).toContain('MASTERY XP COST ×1');
      expect(mounted.host.innerHTML).not.toContain('OPENING ECONOMY');
      expect(mounted.host.innerHTML).not.toContain('NO DIRECT STAT MODIFIER');
      expect(mounted.host.innerHTML).not.toContain('COMMAND CREDIT UPGRADES');
      expect(mounted.host.innerHTML).not.toContain('upgrade-meta-country');
      expect(mounted.host.innerHTML).not.toContain('NEXT TOTAL LV');
      expect(mounted.host.innerHTML).not.toContain('Stronger opening army');
      expect(mounted.host.innerHTML).not.toContain('Better starting supply');
      expect(mounted.host.innerHTML).not.toContain('More opening treasury');
    } finally {
      mounted.cleanup();
    }
  });

  it('uses mastered Power for the strongest owned nation and exposes free point controls', () => {
    const base = grantStarterCountriesV1(
      createCommanderProfileV1(1, 'mastered-power'),
      [STARTER_COUNTRY_ID],
      2,
    ).profile;
    const profile: CommanderProfileV1 = {
      ...base,
      unlockedCountryIds: ['bel', 'nld'],
      countryMastery: {
        ...base.countryMastery,
        bel: {
          xp: countryMasteryXpForLevelV1(7),
          level: 7,
          campaigns: 6,
          victories: 4,
          bestSurvivalWave: 3,
          allocations: {
            force: 4,
            firepower: 1,
            defense: 0,
            mobilization: 0,
            'land-logistics': 0,
            expeditionary: 0,
            'military-industry': 0,
            'field-medicine': 0,
          },
        },
      },
    };
    const belgium = testCountry('bel', 'Belgium', 196);
    const netherlands = testCountry('nld', 'Netherlands', 150);
    expect(countryMasteredMilitaryPowerV1(profile, belgium)).toBeGreaterThan(105);
    expect(strongestUnlockedCountryIdV1(profile, [netherlands, belgium])).toBe('bel');

    const allocate = vi.fn(() => ({ accepted: false, profile }));
    const respec = vi.fn(() => ({ accepted: false, profile }));
    const mounted = mountCommanderMenuForTest(vi.fn(), {
      profile,
      onAllocateCountryMasteryPoint: allocate,
      onRespecCountryMastery: respec,
    });
    try {
      mounted.menu.openArsenal('bel');
      const ownedOrder = [...mounted.host.innerHTML.matchAll(
        /data-action="select-meta-country" data-country="([^"]+)"/g,
      )].map((match) => match[1]).slice(0, 2);
      expect(ownedOrder).toEqual(['bel', 'nld']);
      expect(mounted.host.innerHTML).toContain('data-base-power="100"');
      expect(mounted.host.innerHTML).toMatch(/data-mastered-power="10[5-9](?:\.\d+)?"/);
      expect(mounted.host.innerHTML).toContain('<strong>1</strong><span>POINT AVAILABLE</span>');
      expect(mounted.host.innerHTML).toContain('data-action="allocate-country-mastery"');
      expect(mounted.host.innerHTML).toContain('data-action="respec-country-mastery"');

      mounted.click('allocate-country-mastery', { country: 'bel', track: 'defense' });
      mounted.click('respec-country-mastery', { country: 'bel' });
      expect(allocate).toHaveBeenCalledWith('bel', 'defense');
      expect(respec).toHaveBeenCalledWith('bel');
    } finally {
      mounted.cleanup();
    }
  });

  it('recommends only campaign targets reachable from the current empire', () => {
    const starter = grantStarterCountriesV1(
      createCommanderProfileV1(1, 'route-aware'),
      [STARTER_COUNTRY_ID],
      2,
    ).profile;
    const profile = recordCampaignDefeatedCountriesV1(
      starter, 'gnb', 'standard-2026', 3,
    ).profile;
    const countries = [
      testCountry('gnb', 'Guinea-Bissau', 170),
      testCountry('can', 'Canada', 188, [{ countryId: STARTER_COUNTRY_ID, kind: 'naval' }]),
      testCountry(STARTER_COUNTRY_ID, 'Greenland', 190, [
        { countryId: 'can', kind: 'naval' },
      ]),
    ];
    const target = nextCommanderProgressionTargetV1(
      profile,
      countries,
      [STARTER_COUNTRY_ID],
    );
    expect(target?.country.id).toBe('can');
    expect(target?.access).toBe('naval');
    expect(target?.country.id).not.toBe('gnb');
  });

  it('starts nation-first with the strongest owned country, then exposes modes after confirmation', () => {
    const onStartMode = vi.fn();
    const mounted = mountCommanderMenuForTest(vi.fn(), {
      profile: { unlockedCountryIds: ['bel', 'nld'], commandCredits: 100 },
      onStartMode,
    });
    try {
      expect(mounted.host.innerHTML).toContain('DEPLOYMENT READY');
      mounted.click('open-country-picker');
      expect(mounted.host.innerHTML).toContain('Choose your nation');
      expect(mounted.host.innerHTML).not.toContain('CHOOSE FLAGSHIP');
      expect(mounted.host.innerHTML).toContain('data-country="nld"');
      expect(mounted.host.innerHTML).toContain('is-unlocked is-selected');
      expect(mounted.host.innerHTML).not.toContain('data-action="start-mode"');
      expect(mounted.host.innerHTML).toContain('OPENING INTELLIGENCE');
      expect(mounted.host.innerHTML).toContain('FULL STRATEGIC INTELLIGENCE');
      expect(mounted.host.innerHTML).toContain('5 MORE METRICS');
      expect(mounted.host.innerHTML).toContain('APEX &amp; META LOADOUT');
      expect(mounted.host.innerHTML).toContain('CONFIRM NETHERLANDS →');
      expect(mounted.host.innerHTML).toContain('aria-pressed="true"');
      expect(mounted.host.innerHTML).toContain('<span>ARMY ATTACK</span>');
      expect(mounted.host.innerHTML).toContain('<span>ARMY DEFENSE</span>');
      expect(mounted.host.innerHTML).toContain('<span>ENERGY</span>');
      expect(mounted.host.innerHTML).toContain('<strong>2,000 / 2,000</strong>');
      expect(mounted.host.innerHTML).toContain('<span>SHIELD ABSORPTION</span>');
      expect(mounted.host.innerHTML).toContain('<strong>75%</strong>');
      expect(mounted.host.innerHTML).toContain('Only while shield online');
      expect(mounted.host.innerHTML).toContain('DEPLOYMENT LOADOUT PREVIEW');
      expect(mounted.host.innerHTML).toContain('<small>ARMY CAPACITY</small>');
      expect(mounted.host.innerHTML).not.toContain('<small>NATION ARMY</small>');
      expect(mounted.host.innerHTML.indexOf('100 POWER')).toBeLessThan(
        mounted.host.innerHTML.indexOf('#150 military'),
      );

      mounted.click('confirm-start-country', { country: 'nld' });
      expect(mounted.host.innerHTML).toContain('NETHERLANDS CONFIRMED');
      expect(mounted.host.innerHTML).toContain('SELECTED FLAGSHIP');
      expect(mounted.host.innerHTML).toContain('Netherlands');
      expect(mounted.host.innerHTML.match(/data-action="start-mode"/g)).toHaveLength(3);
      expect(mounted.host.innerHTML).toContain('commander-multiplayer-toggle');
      expect(mounted.host.innerHTML).toContain('CO-OP');
      expect(mounted.host.innerHTML).toContain('PLAY SOLO');
      expect(mounted.host.innerHTML).toContain('>OFF</b>');
      expect(mounted.host.innerHTML).toContain('commander-fun-mode');
      const primaryModes = mounted.host.innerHTML.slice(
        mounted.host.innerHTML.indexOf('<section class="commander-mode-grid">'),
        mounted.host.innerHTML.indexOf('</section>', mounted.host.innerHTML.indexOf('<section class="commander-mode-grid">')),
      );
      expect(primaryModes).toContain('data-mode="standard-2026"');
      expect(primaryModes).toContain('data-mode="survival"');
      expect(primaryModes).not.toContain('data-mode="random-world"');
      expect(primaryModes).toContain('2026 · FIRST TIMELINE');
      expect(primaryModes).toContain('2096 · TERMINAL TIMELINE');
      expect(mounted.host.innerHTML).toContain('ENDGAME MODE');
      expect(mounted.host.innerHTML).not.toContain('ROGUELIKE BUILD');
      expect(mounted.host.innerHTML).not.toContain('1.35× REWARDS');
      const apexLoadout = mounted.host.innerHTML.slice(
        mounted.host.innerHTML.indexOf('<section class="commander-deployment-loadout"'),
        mounted.host.innerHTML.indexOf('</section>', mounted.host.innerHTML.indexOf('<section class="commander-deployment-loadout"')),
      );
      expect(apexLoadout).not.toContain('APEX POWER');
      expect(apexLoadout).toContain('<span>ARMY ATTACK</span>');
      expect(apexLoadout).toContain('<span>ENERGY</span>');
      expect(apexLoadout).toContain('<span>SHIELD ABSORPTION</span>');
      expect(apexLoadout).not.toContain('ACTIVE / CAPACITY');
      expect(mounted.host.innerHTML).toContain('BEGIN CAMPAIGN →');
      expect(mounted.host.innerHTML).toContain('ENTER FUN MODE →');
      expect(mounted.host.innerHTML).toContain('DEPLOY YOUR EMPIRE →');
      expect(mounted.host.innerHTML.indexOf('commander-mode-grid'))
        .toBeLessThan(mounted.host.innerHTML.indexOf('commander-mode-loadout'));
      expect(commanderMenuSource).toContain("['ArrowDown', 'ArrowUp', 'Home', 'End']");
      expect(commanderMenuSource).not.toContain('scrollIntoView');

      mounted.click('start-mode', { mode: 'standard-2026' });
      expect(onStartMode).toHaveBeenCalledOnce();
      expect(onStartMode).toHaveBeenCalledWith('standard-2026', 'nld', false);
    } finally {
      mounted.cleanup();
    }
  });

  it('shows the Survival seat price and blocks launch when the account cannot afford it', () => {
    const onStartMode = vi.fn();
    const mounted = mountCommanderMenuForTest(vi.fn(), {
      profile: { commandCredits: 0 },
      onStartMode,
    });
    try {
      mounted.click('open-country-picker');
      mounted.click('confirm-start-country', { country: 'bel' });
      expect(mounted.host.innerHTML).toContain('ENDGAME MODE · 50 CREDITS · BALANCE 0');
      expect(mounted.host.innerHTML).toContain('INSUFFICIENT CREDITS');
      expect(mounted.host.innerHTML).toContain('Earn them through meaningful Campaign activity');

      mounted.click('start-mode', { mode: 'survival' });
      expect(onStartMode).not.toHaveBeenCalled();
      expect(mounted.host.innerHTML).toContain('Survival requires 50 Credits. You have 0');

      mounted.click('start-mode', { mode: 'standard-2026' });
      expect(onStartMode).toHaveBeenCalledWith('standard-2026', 'bel', false);
    } finally {
      mounted.cleanup();
    }
  });

  it('uses multiplayer as a direct matchmaking modifier for every mission', () => {
    const onStartMode = vi.fn();
    const onMultiplayerRequested = vi.fn();
    const mounted = mountCommanderMenuForTest(vi.fn(), {
      profile: { commandCredits: 100 },
      onStartMode,
      onMultiplayerRequested,
    });
    try {
      mounted.click('open-country-picker');
      mounted.click('confirm-start-country', { country: 'bel' });
      mounted.click('toggle-multiplayer');
      expect(mounted.host.innerHTML).toContain('aria-checked="true"');
      expect(mounted.host.innerHTML).toContain('FIND A TEAM');
      expect(mounted.host.innerHTML).toContain('shared victory or defeat');
      expect(mounted.host.innerHTML).toContain('>ON</b>');
      for (const mode of ['standard-2026', 'survival', 'random-world']) {
        mounted.click('start-mode', { mode });
      }
      expect(onMultiplayerRequested.mock.calls).toEqual([
        ['standard-2026', 'bel'],
        ['survival', 'bel'],
        ['random-world', 'bel'],
      ]);
      expect(onStartMode).not.toHaveBeenCalled();
    } finally {
      mounted.cleanup();
    }
  });

  it('requires a destructive confirmation before resetting the account and all saves', () => {
    const onResetAccount = vi.fn();
    const mounted = mountCommanderMenuForTest(onResetAccount);
    try {
      mounted.click('home');
      expect(mounted.host.innerHTML).toContain(
        'data-action="open-reset-account">RESET ACCOUNT &amp; SAVES',
      );
      expect(mounted.host.innerHTML).not.toContain('RESET ALL LOCAL PROGRESSION');

      mounted.click('open-reset-account');
      expect(onResetAccount).not.toHaveBeenCalled();
      expect(mounted.host.innerHTML).toContain('RESET ALL LOCAL PROGRESSION');
      expect(mounted.host.innerHTML).toContain('This permanently removes the active timeline');
      expect(mounted.host.innerHTML).toContain('keeps only its free starter nation');
      expect(mounted.host.innerHTML).toContain('data-action="cancel-reset-account">KEEP MY SAVE');
      expect(mounted.host.innerHTML).toContain('data-action="confirm-reset-account">RESET EVERYTHING');

      mounted.click('cancel-reset-account');
      expect(onResetAccount).not.toHaveBeenCalled();
      expect(mounted.host.innerHTML).not.toContain('RESET ALL LOCAL PROGRESSION');

      mounted.click('open-reset-account');
      mounted.click('confirm-reset-account');
      expect(onResetAccount).toHaveBeenCalledTimes(1);
    } finally {
      mounted.cleanup();
    }
  });

  it('keeps empire flag selection compact, searchable and account-wide', () => {
    const onSelectEmpireFlag = vi.fn(() => ({
      accepted: false as const,
      profile: createCommanderProfileV1(3, 'flag-picker-test'),
      reason: 'captured',
    }));
    const mounted = mountCommanderMenuForTest(vi.fn(), {
      profile: { empireFlag: { kind: 'country', countryId: 'nld' } },
      onSelectEmpireFlag,
    });
    try {
      expect(mounted.host.innerHTML).toContain('class="commander-empire-flag__current"');
      expect(mounted.host.innerHTML).toContain('<strong>Netherlands</strong>');
      expect(mounted.host.innerHTML).not.toContain('id="commander-empire-flag-picker"');

      mounted.click('toggle-empire-flag-picker');
      expect(mounted.host.innerHTML).toContain('id="commander-empire-flag-search"');
      expect(mounted.host.innerHTML).toContain('data-country="usa"');
      expect(mounted.host.innerHTML).toContain('data-country="bel"');

      mounted.click('select-empire-flag', { country: 'usa' });
      expect(onSelectEmpireFlag).toHaveBeenCalledWith({ kind: 'country', countryId: 'usa' });
      expect(mounted.host.innerHTML).not.toContain('id="commander-empire-flag-picker"');
    } finally {
      mounted.cleanup();
    }
  });

  it('uses a compact asymmetrical command centre with one dominant deployment action', () => {
    const mounted = mountCommanderMenuForTest();
    try {
      expect(mounted.host.innerHTML).toContain('commander-menu-shell--home');
      expect(mounted.host.innerHTML).toContain('APEX: RECLAMATION · GLOBAL ACCOUNT');
      expect(mounted.host.innerHTML).toContain('commander-theater__brand');
      expect(mounted.host.innerHTML).not.toContain('GLOBAL COMMANDER ACCOUNT');
      expect(mounted.host.innerHTML).toContain('commander-command-center');
      expect(mounted.host.innerHTML).toContain('commander-theater is-deployment-ready');
      expect(mounted.host.innerHTML).toContain('CHOOSE YOUR NATION →');
      expect(mounted.host.innerHTML.match(/class="commander-meta-card /g)).toHaveLength(2);
      expect(mounted.host.innerHTML).toContain('commander-meta-card--apex');
      expect(mounted.host.innerHTML).toContain('commander-meta-card--arsenal');
      expect(mounted.host.innerHTML).toContain('EMPIRE SHIELD');
      expect(mounted.host.innerHTML).toContain('NATIONAL MASTERY');
      expect(mounted.host.innerHTML).toContain('SPEND 1 APEX TALENT POINT →');
      expect(mounted.host.innerHTML).toContain('VIEW NATION ARSENAL →');
      expect(mounted.host.innerHTML.match(/commander-meta-card__cta/g)).toHaveLength(2);
      expect(mounted.host.innerHTML).toContain('<small>ENERGY</small>');
      expect(mounted.host.innerHTML).toContain('<b>2,000 / 2,000</b>');
      expect(mounted.host.innerHTML).not.toContain('<small>PULSE ATTACK</small>');
      expect(mounted.host.innerHTML).toContain('<small>ARMY ATTACK</small>');
      expect(mounted.host.innerHTML).toContain('<small>ARMY DEFENSE</small>');
      expect(mounted.host.innerHTML).toContain('<small>ENERGY RECHARGE</small>');
      expect(mounted.host.innerHTML).toContain('<small>UNSPENT POINTS</small>');
      expect(mounted.host.innerHTML).not.toContain('EMPIRE START GRANT');
      expect(mounted.host.innerHTML).not.toContain('EMPIRE INCOME');
      expect(mounted.host.innerHTML).not.toContain('EMPIRE TRAINING');
      expect(mounted.host.innerHTML).not.toContain('APEX FOOD');
      expect(commanderMenuSource).toContain('ARMY ATTACK');
      expect(commanderMenuSource).not.toMatch(/Empire Food|Food Production|People Fed|Fed\/Week/i);
      expect(mounted.host.innerHTML).not.toContain('APEX ELITES');
      expect(mounted.host.innerHTML).not.toContain('CAPACITY</small>');
      expect(mounted.host.innerHTML).not.toContain('RESERVE</small>');
      expect(mounted.host.innerHTML).not.toContain('NO DOCTRINE');
      expect(mounted.host.innerHTML).not.toContain('COMMANDER PROGRESSION');
      expect(mounted.host.innerHTML).toContain('STRONGEST OWNED');
      expect(mounted.host.innerHTML).toContain('NEXT PROGRESSION');
      expect(mounted.host.innerHTML).toContain('NEXT PROGRESSION · LAND BORDER');
      expect(mounted.host.innerHTML).toContain('TIMELINES');
      expect(mounted.host.innerHTML).toContain('COMPLETE');
      expect(mounted.host.innerHTML).toContain('<details class="commander-account-settings">');
      expect(mounted.host.innerHTML).not.toContain('DELETE SAVE');
      expect(mounted.host.innerHTML).not.toMatch(/ARCTIC POST|OBSERVATION POST/);
      expect(stylesSource).toContain('min-height:calc(100svh - 62px)');
      expect(stylesSource).toContain('grid-template-columns:minmax(0,1fr) minmax(390px,430px)');
      expect(stylesSource).toContain('.commander-theater__flag-echo');
      expect(stylesSource).toContain('@media (max-width:980px)');
      expect(stylesSource).not.toContain('.commander-command-hub__grid');
      expect(stylesSource).toContain('--commander-label-size:12px');
      expect(stylesSource).toContain('--commander-copy-size:13px');
      expect(stylesSource).toContain('--commander-value-size:15px');
      expect(stylesSource).toContain('.commander-country-row__power');
      expect(stylesSource).toContain('.commander-menu-shell { height:100dvh; max-height:100dvh; overflow:hidden; }');
    } finally {
      mounted.cleanup();
    }
  });

  it('shows spendable Home badges and a one-time post-Campaign guide with direct actions', () => {
    const base = grantStarterCountriesV1(
      createCommanderProfileV1(1, 'home-progression-guide'),
      [STARTER_COUNTRY_ID],
      2,
    ).profile;
    const profile: CommanderProfileV1 = {
      ...base,
      unlockedCountryIds: ['bel'],
      commanderLevel: 4,
      commanderXp: commanderXpForLevelV1(4),
      campaignProgressionTutorialState: 'ready',
      countryMastery: {
        bel: {
          xp: countryMasteryXpForLevelV1(3),
          level: 3,
          campaigns: 1,
          victories: 0,
          bestSurvivalWave: 0,
          allocations: {
            force: 0,
            firepower: 0,
            defense: 0,
            mobilization: 0,
            'land-logistics': 0,
            expeditionary: 0,
            'military-industry': 0,
            'field-medicine': 0,
          },
        },
      },
    };
    const acknowledgedProfile = {
      ...profile,
      campaignProgressionTutorialState: 'seen' as const,
    };
    const acknowledge = vi.fn(() => ({
      accepted: true as const,
      profile: acknowledgedProfile,
    }));
    const mounted = mountCommanderMenuForTest(vi.fn(), {
      profile,
      onAcknowledgeCampaignProgressionTutorial: acknowledge,
    });
    try {
      expect(mounted.host.innerHTML).toContain('FIRST CAMPAIGN COMPLETE');
      expect(mounted.host.innerHTML).toContain('Spend the power you earned');
      expect(mounted.host.innerHTML).toContain('unspent points give no bonus');
      expect(mounted.host.innerHTML).toContain('APEX TALENT POINTS');
      expect(mounted.host.innerHTML).toContain('NATION MASTERY POINTS');
      expect(mounted.host.innerHTML).toContain('Credits only pay for Survival entry.');
      expect(mounted.host.innerHTML).toContain(
        'Defeating a nation in Campaign unlocks it',
      );
      expect(mounted.host.innerHTML).toContain('SPEND 4 APEX TALENT POINTS →');
      expect(mounted.host.innerHTML).toContain('SPEND 2 NATION MASTERY POINTS →');
      expect(mounted.host.innerHTML).toContain('data-action="tutorial-open-talents"');
      expect(mounted.host.innerHTML).toContain('data-action="tutorial-open-arsenal"');
      expect(mounted.host.innerHTML).toContain('data-action="open-talents"');
      expect(mounted.host.innerHTML).toContain('data-action="open-arsenal"');
      expect(mounted.host.innerHTML).toContain('commander-meta-card--apex has-unspent');
      expect(mounted.host.innerHTML).toContain('commander-meta-card--arsenal has-unspent');

      mounted.setPageScroll(142, 3);
      mounted.click('tutorial-open-arsenal');
      expect(acknowledge).toHaveBeenCalledOnce();
      expect(mounted.host.innerHTML).toContain('commander-menu-shell--arsenal');
      expect(mounted.host.innerHTML).not.toContain('FIRST CAMPAIGN COMPLETE');
      expect(mounted.pageScroll).toEqual({ top: 142, left: 3 });

      mounted.click('home');
      expect(mounted.host.innerHTML).toContain('commander-menu-shell--home');
      expect(mounted.host.innerHTML).not.toContain('FIRST CAMPAIGN COMPLETE');
    } finally {
      mounted.cleanup();
    }
  });

  it('offers one clear session-only multiplayer rejoin without exposing credentials', () => {
    const onResumeMultiplayer = vi.fn();
    const onDiscardMultiplayerResume = vi.fn();
    const mounted = mountCommanderMenuForTest(vi.fn(), {
      multiplayerResume: {
        countryId: 'bel', mode: 'survival', expiresAt: Date.now() + 60_000,
      },
      onResumeMultiplayer,
      onDiscardMultiplayerResume,
    });
    try {
      expect(mounted.host.innerHTML).toContain('MULTIPLAYER SEAT RESERVED');
      expect(mounted.host.innerHTML).toContain('REJOIN MATCH');
      expect(mounted.host.innerHTML).toContain('Belgium');
      expect(mounted.host.innerHTML).toContain('Survival · Belgium');
      expect(mounted.host.innerHTML).not.toContain('rejoinToken');
      expect(mounted.host.innerHTML).not.toContain('secret');
      mounted.click('resume-multiplayer');
      expect(onResumeMultiplayer).toHaveBeenCalledOnce();
      mounted.click('discard-multiplayer-resume');
      expect(onDiscardMultiplayerResume).toHaveBeenCalledOnce();
      expect(mounted.host.innerHTML).not.toContain('REJOIN MATCH');
    } finally {
      mounted.cleanup();
    }
  });

  it('requires settling an active save before opening a new deployment', () => {
    const frozenProfile = {
      ...grantStarterCountriesV1(
        createCommanderProfileV1(1, 'frozen-save'),
        [STARTER_COUNTRY_ID],
        2,
      ).profile,
      unlockedCountryIds: ['bel'],
      commanderLevel: 1,
    };
    const campaign: StoredCampaignV1 = {
      schemaVersion: 1,
      campaignId: 'active-save',
      scenario: { mode: 'survival', version: 1, seed: 19 },
      countryId: 'bel',
      defeatedCountryIds: ['nld'],
      signalPurgedCountryIds: ['nld'],
      warOutcomes: [],
      profileRevisionAtStart: frozenProfile.revision,
      loadout: resolveCountryLoadoutV1(frozenProfile, 'bel'),
      rewardEligible: true,
      stateSave: JSON.stringify({
        tick: 78,
        players: { bel: { treasury: 3.5 } },
        territories: {
          bel: { owner: 'bel', army: { manpower: 0.006 } },
          nld: { owner: 'bel', army: { manpower: 0.004 } },
          deu: { owner: 'rai', army: { manpower: 0.001 } },
        },
        wars: [{ attackerId: 'rai', defenderId: 'bel' }],
        commanderForces: { bel: { army: { manpower: 0.005, capacity: 0.01 } } },
        polarEndgame: { globalWave: 4, bossIntegrity: 83 },
      }),
      baseline: { startingTerritoryIds: ['bel'], startingMilitaryLosses: 0, startingTick: 0 },
      startedAt: 1,
      updatedAt: 2,
    };
    const onStartMode = vi.fn();
    const onSurrenderCampaign = vi.fn();
    const mounted = mountCommanderMenuForTest(vi.fn(), {
      campaign,
      onStartMode,
      onSurrenderCampaign,
    });
    try {
      expect(mounted.host.innerHTML).toContain('CONTINUE CAMPAIGN');
      expect(mounted.host.innerHTML).toContain('commander-theater has-active-operation');
      expect(mounted.host.innerHTML).toContain('ENERGY</small><b>50%');
      expect(mounted.host.innerHTML).toContain('TERRITORIES</small><b>2');
      expect(mounted.host.innerHTML).toContain('ACTIVE WARS</small><b>1');
      expect(mounted.host.innerHTML).toContain('WAVE 4 · CORE 83%');

      mounted.click('open-country-picker');
      expect(mounted.host.innerHTML).toContain('commander-theater__save-choice');
      expect(mounted.host.innerHTML).toContain('APEX secures the campaign record.');
      expect(mounted.host.innerHTML).toContain('CONTINUE CURRENT');
      expect(mounted.host.innerHTML).toContain('END &amp; CLAIM PROGRESS');
      expect(mounted.host.innerHTML).toContain(
        'Earned APEX XP and Nation Mastery XP are settled exactly like any completed run.',
      );
      expect(mounted.host.innerHTML).not.toContain('victory bonus is unavailable');
      expect(mounted.host.innerHTML).not.toContain('NEW DEPLOYMENT');
      expect(onStartMode).not.toHaveBeenCalled();

      mounted.click('cancel-active-campaign-choice');
      expect(mounted.host.innerHTML).not.toContain('commander-theater__save-choice');
      mounted.click('open-country-picker');
      mounted.click('surrender-active-campaign');
      expect(onSurrenderCampaign).toHaveBeenCalledOnce();
      expect(onStartMode).not.toHaveBeenCalled();
    } finally {
      mounted.cleanup();
    }
  });

  it('keeps the APEX talent pane, page position and clicked talent focused across rerenders', () => {
    const allocatedTalents = emptyCommanderTalentsV1();
    allocatedTalents['science-corps'] = 1;
    const allocatedProfile = {
      ...createCommanderProfileV1(1, 'focus-after-allocation'),
      commanderLevel: 1,
      commanderXp: commanderXpForLevelV1(1),
      commanderTalents: allocatedTalents,
    };
    const mounted = mountCommanderMenuForTest(vi.fn(), {
      profile: {
        commanderLevel: 1,
        commanderXp: commanderXpForLevelV1(1),
      },
      onAllocateCommanderTalent: () => ({ accepted: true, profile: allocatedProfile }),
    });
    try {
      mounted.click('open-talents');
      const before = mounted.scrollRegion('commander:talents');
      expect(before).toBeDefined();
      before!.scrollTop = 734;
      before!.scrollLeft = 9;
      mounted.setPageScroll(186, 4);

      mounted.click('allocate-commander-talent', { talent: 'science-corps' });

      const after = mounted.scrollRegion('commander:talents');
      expect(after).not.toBe(before);
      expect({ top: after?.scrollTop, left: after?.scrollLeft }).toEqual({ top: 734, left: 9 });
      expect(mounted.pageScroll).toEqual({ top: 186, left: 4 });
      expect(mounted.focusCalls.at(-1)).toEqual({
        key: 'action:inspect-commander-talent|talent:science-corps|talentCard:science-corps',
        preventScroll: true,
      });
    } finally {
      mounted.cleanup();
    }
  });

  it('keeps both Nation Arsenal panes and a sensible detail focus after mastery allocation', () => {
    const mounted = mountCommanderMenuForTest();
    try {
      mounted.menu.openArsenal('bel');
      const rosterBefore = mounted.scrollRegion('commander:country-list');
      const detailBefore = mounted.scrollRegion('commander:arsenal-detail:bel');
      expect(rosterBefore).toBeDefined();
      expect(detailBefore).toBeDefined();
      rosterBefore!.scrollTop = 418;
      detailBefore!.scrollTop = 692;
      mounted.setPageScroll(121);

      mounted.click('allocate-country-mastery', { country: 'bel', track: 'mobilization' });

      expect(mounted.scrollRegion('commander:country-list')?.scrollTop).toBe(418);
      expect(mounted.scrollRegion('commander:arsenal-detail:bel')?.scrollTop).toBe(692);
      expect(mounted.pageScroll.top).toBe(121);
      expect(mounted.focusCalls.at(-1)).toEqual({
        key: 'scrollSession:commander:arsenal-detail:bel',
        preventScroll: true,
      });
    } finally {
      mounted.cleanup();
    }
  });

  it('remembers each nation dossier separately while selection keeps the roster and page fixed', () => {
    const mounted = mountCommanderMenuForTest();
    try {
      mounted.click('open-country-picker');
      mounted.scrollRegion('commander:start-country-list')!.scrollTop = 377;
      mounted.scrollRegion('commander:deployment-detail:bel')!.scrollTop = 512;
      mounted.setPageScroll(93);

      mounted.click('select-meta-country', { country: 'nld' });
      expect(mounted.scrollRegion('commander:start-country-list')?.scrollTop).toBe(377);
      expect(mounted.scrollRegion('commander:deployment-detail:nld')?.scrollTop).toBe(0);
      expect(mounted.pageScroll.top).toBe(93);
      mounted.scrollRegion('commander:deployment-detail:nld')!.scrollTop = 144;

      mounted.click('select-meta-country', { country: 'bel' });
      expect(mounted.scrollRegion('commander:start-country-list')?.scrollTop).toBe(377);
      expect(mounted.scrollRegion('commander:deployment-detail:bel')?.scrollTop).toBe(512);
      expect(mounted.pageScroll.top).toBe(93);
      expect(mounted.focusCalls.at(-1)?.preventScroll).toBe(true);
    } finally {
      mounted.cleanup();
    }
  });
});
