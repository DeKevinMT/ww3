import { describe, expect, it } from 'vitest';
import { normalizeScenarioConfigV2 } from '../sim/v2/scenarios';
import { nationIdV2 } from '../sim/v2/types';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import worldUiSource from './WorldUIV2.ts?raw';
import mainSource from '../main.ts?raw';
import {
  IntroOpeningMetricsCacheV2,
  renderNationPickerV2,
} from './WorldUIV2';

const engine = new WorldEngineV2(20_260_829);
const opening = new IntroOpeningMetricsCacheV2().read(engine);
const campaign = normalizeScenarioConfigV2({ mode: 'standard-2026', seed: 20_260_829 });
const belgium = nationIdV2('bel');
const canada = nationIdV2('can');
const usa = nationIdV2('usa');
const rogueAi = nationIdV2('rai');

function countryCardOrder(html: string): string[] {
  return [...html.matchAll(/data-action="preview-country" data-country="([^"]+)"/g)]
    .map((match) => match[1]!);
}

function countryCard(html: string, countryId: string): string {
  const marker = `data-action="preview-country" data-country="${countryId}"`;
  const markerIndex = html.indexOf(marker);
  const start = html.lastIndexOf('<button', markerIndex);
  const end = html.indexOf('</button>', markerIndex);
  return markerIndex < 0 || start < 0 || end < 0 ? '' : html.slice(start, end + 9);
}

function previewActions(html: string): string {
  const start = html.lastIndexOf('<div class="country-preview__actions">');
  const end = html.indexOf('</div>', start);
  return start < 0 || end < 0 ? '' : html.slice(start, end + 6);
}

describe('account-aware campaign nation picker', () => {
  it('keeps owned nations first while showing every locked human nation as a Campaign target', () => {
    expect(engine.content.nations[rogueAi]?.kind).toBe('rogue-ai');
    expect(opening.byNation.has(rogueAi)).toBe(false);
    const rendered = renderNationPickerV2(opening, {
      previewCountryId: belgium,
      searchQuery: '',
      continent: 'ALL',
      sort: 'power',
      context: 'campaign',
      content: engine.content,
      scenarioConfig: campaign,
      scenarioEditable: true,
      availableCountryIds: new Set([belgium, canada]),
      countryMasteryLevels: new Map([[belgium, 7], [canada, 3]]),
      countryLoadouts: new Map([[belgium, {
        openingArmyMultiplier: 1,
        openingEconomyMultiplier: 1,
        trainedReserveMultiplier: 1,
        traitScale: 0,
      }]]),
    });

    expect(rendered.previewCountryId).toBe(belgium);
    const order = countryCardOrder(rendered.html);
    expect(new Set(order.slice(0, 2))).toEqual(new Set([belgium, canada]));
    expect(order.indexOf(usa)).toBeGreaterThan(1);
    expect(countryCard(rendered.html, belgium)).toContain('is-account-owned');
    expect(countryCard(rendered.html, canada)).toContain('is-account-owned');
    expect(countryCard(rendered.html, usa)).toContain('is-account-locked');
    expect(countryCard(rendered.html, usa)).toContain('DEFEAT IN CAMPAIGN');
    expect(rendered.html).not.toMatch(/Command Credits|\bCC\b|price|purchase/i);
    expect(rendered.html).not.toContain('data-country="rai"');
    expect(rendered.html).toContain('MASTERY LV 7');
    expect(rendered.html).toContain('MASTERY LV 3');
    expect(rendered.html).toContain('MASTERY LEVEL 7');
    expect(rendered.html).toContain('PLAYER START ARMY · ×1.00');
    expect(rendered.html).not.toContain('ARSENAL TRAIT');
    expect(rendered.html).not.toContain('data-country-trait');
    expect(rendered.html).not.toContain('FULLY FREE');
    expect(rendered.html).not.toContain('FADES OVER 30 YEARS');
    expect(rendered.html).toContain(`<b>2 owned · ${opening.byNation.size} total</b>`);
    expect(rendered.visibleCount).toBe(opening.byNation.size);
    expect(rendered.html).not.toContain('data-action="scenario-standard"');
    expect(rendered.html).not.toContain('data-action="scenario-random"');
  });

  it('keeps a locked preview visible with a Campaign-victory gate and no purchase action', () => {
    const gated = renderNationPickerV2(opening, {
      previewCountryId: usa,
      searchQuery: '',
      continent: 'ALL',
      sort: 'power',
      context: 'campaign',
      content: engine.content,
      availableCountryIds: new Set([belgium]),
    });
    expect(gated.previewCountryId).toBe(usa);
    expect(gated.html).toContain('ACCOUNT LOCKED');
    expect(gated.html).toContain('DEFEAT IN CAMPAIGN');
    expect(gated.html).toContain('Defeat United States of America in a standard Campaign war');
    expect(previewActions(gated.html)).not.toContain('unlock-account-country');
    expect(previewActions(gated.html)).toContain(
      'data-action="open-nation-arsenal" data-country="usa"',
    );
    expect(previewActions(gated.html)).toContain('VIEW IN NATION ARSENAL');

    expect(gated.html).not.toMatch(/Command Credits|\bCC\b|price|purchase/i);
  });

  it('handles a zero-owned account by showing the full roster as locked instead of an empty picker', () => {
    const empty = renderNationPickerV2(opening, {
      previewCountryId: usa,
      searchQuery: '',
      continent: 'ALL',
      sort: 'power',
      context: 'campaign',
      content: engine.content,
      availableCountryIds: new Set(),
    });
    expect(empty.previewCountryId).toBe(usa);
    expect(empty.visibleCount).toBe(opening.byNation.size);
    expect(countryCardOrder(empty.html)).toHaveLength(opening.byNation.size);
    expect(empty.html).toContain(`<b>0 owned · ${opening.byNation.size} total</b>`);
    expect(empty.html).not.toContain('No nations available');
    const lockedStartAction = previewActions(empty.html)
      .match(/<button[^>]*data-action="choose-country"[^>]*>/)?.[0] ?? '';
    expect(lockedStartAction).not.toBe('');
    expect(lockedStartAction).toContain('disabled');
  });

  it('keeps the unfiltered multiplayer picker intact while excluding Rogue AI', () => {
    const rendered = renderNationPickerV2(opening, {
      previewCountryId: belgium,
      searchQuery: '',
      continent: 'ALL',
      sort: 'power',
      context: 'lobby',
      content: engine.content,
      scenarioConfig: normalizeScenarioConfigV2({ mode: 'random-world', seed: 20_260_829 }),
    });

    expect(rendered.html).toContain('data-country="bel"');
    expect(rendered.html).toContain('data-country="usa"');
    expect(rendered.html).not.toContain('data-country="rai"');
    expect(rendered.html).not.toContain('MASTERY LV');
    expect(rendered.html).not.toContain('data-mp-action="scenario-standard"');
    expect(rendered.html).not.toContain('<b>CAMPAIGN</b>');
    expect(rendered.html).toContain('data-mp-action="scenario-survival"');
    expect(rendered.html).toContain('data-mp-action="scenario-random"');
  });

  it('never offers the legacy play-with-friends entry from Campaign', () => {
    const common = {
      previewCountryId: belgium,
      searchQuery: '',
      continent: 'ALL',
      sort: 'power' as const,
      context: 'campaign' as const,
      content: engine.content,
      showMultiplayerButton: true,
    };
    const campaignPicker = renderNationPickerV2(opening, {
      ...common,
      scenarioConfig: campaign,
    });
    const alternativePicker = renderNationPickerV2(opening, {
      ...common,
      scenarioConfig: normalizeScenarioConfigV2({ mode: 'random-world', seed: 93 }),
    });

    expect(campaignPicker.html).not.toContain('data-action="open-multiplayer"');
    expect(alternativePicker.html).toContain('data-action="open-multiplayer"');
  });

  it('threads account choices through WorldUI and guards direct selection actions', () => {
    expect(worldUiSource).toContain('availableCountryIds?: ReadonlySet<string>;');
    expect(worldUiSource).toContain('countryMasteryLevels?: ReadonlyMap<string, number>;');
    expect(worldUiSource).toContain('countryLoadouts?: ReadonlyMap<string, NationAccountLoadoutPresentationV2>;');
    expect(worldUiSource).toContain('onOpenNationArsenal?: (countryId: string) => void;');
    expect(worldUiSource).toContain('availableCountryIds: this.options.availableCountryIds');
    expect(worldUiSource).toContain('countryMasteryLevels: this.options.countryMasteryLevels');
    expect(worldUiSource).toContain('countryLoadouts: this.options.countryLoadouts');
    expect(worldUiSource).not.toContain('countryUnlocks:');
    expect(worldUiSource).not.toContain("case 'unlock-account-country':");
    expect(worldUiSource).toContain("case 'open-nation-arsenal':");
    expect(worldUiSource).toContain("definition?.kind === 'rogue-ai'");
    expect(worldUiSource).toContain('!this.options.availableCountryIds.has(countryId)');
  });

  it('uses the confirmed menu flagship directly and never mounts a second solo picker', () => {
    expect(mainSource).toContain('async function launchSoloScenarioForCountry(');
    const launcher = mainSource.slice(
      mainSource.indexOf('async function launchSoloScenarioForCountry('),
      mainSource.indexOf('function attachHostStatus', mainSource.indexOf(
        'async function launchSoloScenarioForCountry(',
      )),
    );
    expect(launcher.indexOf('engine.chooseCountry(countryId)')).toBeGreaterThan(-1);
    expect(launcher.indexOf('await beginStoredCampaign(engine, countryId)'))
      .toBeGreaterThan(launcher.indexOf('engine.chooseCountry(countryId)'));
    expect(launcher.indexOf('mountWorldUi(engine, false, activeControllerNames, countryId, false)'))
      .toBeGreaterThan(launcher.indexOf('await beginStoredCampaign(engine, countryId)'));
    expect(launcher).toContain('engine.startClock()');
    expect(mainSource).toContain('onStartMode: (mode, countryId, replaceExistingCampaign) =>');
    expect(mainSource).toContain('if (campaignSlot && !replaceExistingCampaign)');
    expect(mainSource).toContain('onMultiplayerRequested: (mode, countryId) => openMultiplayerLobby(');
    expect(mainSource).toMatch(/countryId as PlayerId,\s+mode,/);
    expect(mainSource).toContain(
      'directMatchmaking: preferredCountryId !== undefined && requestedMode !== undefined',
    );
    expect(mainSource).toContain('const liveEngine = activeEngine;');
  });

  it('applies every unlocked Survival nation loadout before forming the shared empire', () => {
    expect(mainSource).toContain('function applyCountryLoadoutAtCampaignStart(');
    const campaignStart = mainSource.slice(
      mainSource.indexOf('async function beginStoredCampaign('),
      mainSource.indexOf('function persistProfileResult', mainSource.indexOf(
        'async function beginStoredCampaign(',
      )),
    );
    expect(campaignStart).toContain("scenario.mode === 'survival'");
    expect(campaignStart).toContain('resolveCountryLoadoutV1(commanderProfile, rosterCountryId)');
    expect(campaignStart.indexOf('applyCountryLoadoutAtCampaignStart('))
      .toBeLessThan(campaignStart.indexOf('engine.formSurvivalEmpire('));
  });

  it('defaults the legacy/shared picker to the strongest available account nation, not USA', () => {
    const classStart = worldUiSource.indexOf('export class WorldUIV2');
    const constructorStart = worldUiSource.indexOf('constructor(', classStart);
    const constructorEnd = worldUiSource.indexOf('private viewerPlayerId()', constructorStart);
    const constructorSource = worldUiSource.slice(constructorStart, constructorEnd);
    expect(constructorSource).toContain('initialIntroMetrics.ranking.find');
    expect(constructorSource).toContain('options.availableCountryIds.has(entry.player.id)');
    expect(constructorSource).not.toContain("id === 'usa'");
  });
});
