import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import worldUiSource from './WorldUIV2.ts?raw';
import {
  apexShieldTopbarPresentationV2,
  armyReadinessTopbarPresentationV2,
} from './WorldUIV2';

const stylesSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('responsive strategic topbar', () => {
  it('keeps five focused status shortcuts while giving Empire Defence a wider mobile slot', () => {
    expect(worldUiSource).toContain('grid-template-columns: 136px 136px 236px repeat(2,136px) !important');
    expect(worldUiSource).toContain('display: grid !important');
    expect(worldUiSource).toContain('overflow-x: auto !important');
    expect(worldUiSource).toContain('.command-topbar .command-identity { display: flex !important; }');
    expect(worldUiSource).toContain('.command-topbar .top-actions { display: flex !important; }');
    const desktopGrid = stylesSource.slice(
      stylesSource.indexOf('.world-ui-v2 .topbar-status {'),
      stylesSource.indexOf('.world-ui-v2 .topbar-status::-webkit-scrollbar'),
    );
    expect(desktopGrid).toContain('grid-template-columns: minmax(126px, .92fr) minmax(112px, .78fr) minmax(244px, 1.72fr) repeat(2, minmax(108px, .78fr));');
    expect(desktopGrid).toContain('overflow: hidden;');
    expect(desktopGrid).not.toContain('overflow-x: auto');
    expect(stylesSource).toContain('font-size: 11px;');
    expect(stylesSource).toContain('font-size: 16px;');
  });

  it('uses one compact two-row HUD layout through the 844px landscape breakpoint', () => {
    const compactStart = stylesSource.indexOf(
      '@media (max-width: 900px) {\n  .world-ui-v2 .unified-topbar.command-topbar.v2-topbar',
    );
    const compactEnd = stylesSource.indexOf('@media (max-width: 520px)', compactStart);
    const compactStyles = stylesSource.slice(compactStart, compactEnd);

    expect(compactStart).toBeGreaterThan(0);
    expect(compactEnd).toBeGreaterThan(compactStart);
    expect(compactStyles).toContain('grid-template-columns: minmax(125px, 1fr) auto !important;');
    expect(compactStyles).toContain('.command-identity.coalition-chip');
    expect(compactStyles).toContain('display: flex !important;');
    expect(compactStyles).toContain('.top-actions .icon-button { display: grid !important; }');
    expect(compactStyles).toContain('#game-canvas { top: 132px; }');
    expect(compactStyles).toContain('top: 132px !important;');
    expect(stylesSource).not.toContain(
      '.command-topbar .top-actions .icon-button:nth-child(n+2) { display: none; }',
    );
  });

  it('makes the 390px status rail visibly scrollable and snap-aligned', () => {
    const compactStart = stylesSource.indexOf(
      '@media (max-width: 900px) {\n  .world-ui-v2 .unified-topbar.command-topbar.v2-topbar',
    );
    const compactEnd = stylesSource.indexOf('@media (max-width: 520px)', compactStart);
    const compactStyles = stylesSource.slice(compactStart, compactEnd);

    expect(compactStyles).toContain('grid-template-columns: 136px 136px 236px repeat(2, 136px) !important;');
    expect(compactStyles).toContain('overflow-x: auto !important;');
    expect(compactStyles).toContain('scroll-snap-type: inline mandatory;');
    expect(compactStyles).toContain('scroll-padding-inline: 4px;');
    expect(compactStyles).toContain('scrollbar-width: thin !important;');
    expect(compactStyles).toContain('::-webkit-scrollbar');
    expect(compactStyles).toContain('display: block !important;');
    expect(compactStyles).toContain('scroll-snap-align: start;');
  });

  it('places Population beside Economy before the wider Empire Defence and War Supply meters', () => {
    const economy = worldUiSource.indexOf('class="top-metric top-metric--economy"');
    const combinedPower = worldUiSource.indexOf('class="top-metric top-metric--combined-power ');
    const population = worldUiSource.indexOf('class="top-metric top-metric--population"');
    const logistics = worldUiSource.indexOf('class="top-metric top-metric--logistics ');
    const research = worldUiSource.indexOf('class="top-metric top-metric--research"');

    expect(economy).toBeGreaterThan(0);
    expect(population).toBeGreaterThan(economy);
    expect(combinedPower).toBeGreaterThan(population);
    expect(logistics).toBeGreaterThan(combinedPower);
    expect(research).toBeGreaterThan(logistics);
    expect(worldUiSource).toContain('const combinedPower = combatPower * apexPowerState.armyPowerMultiplier;');
    expect(worldUiSource).not.toContain('commanderForceMapCombatPower(apexForce.army)');
    expect(worldUiSource).toContain('<span>EMPIRE DEFENCE</span>');
    expect(worldUiSource).toContain('class="topbar-defence-stack"');
    expect(worldUiSource).toContain('--army-ready:${armyReadiness.percent}%');
    expect(worldUiSource).toContain('--shield-integrity:${apexPowerState.integrityPercent}%');
    expect(worldUiSource).toContain('data-empire-defence-glow');
    expect(worldUiSource).toContain('private syncEmpireDefenceGlow(): void');
    expect(worldUiSource).toContain('animation.currentTime = phase;');
    expect(worldUiSource).not.toContain('shieldScanDelaySeconds');
    expect(worldUiSource).toContain('ENERGY ${apexPowerState.integrityPercent}% · PULSE ${people(apexPowerState.pulseAttack)}');
    expect(worldUiSource).toContain('<span>POPULATION</span>');
    expect(worldUiSource).toContain('<span>WAR SUPPLY</span>');
    expect(worldUiSource).toContain('data-panel="research"');
    expect(worldUiSource).not.toContain('data-panel="progress"');
    expect(worldUiSource).toContain('<small><span>CASH ${cash(human.treasury)}</span>');
    expect(worldUiSource).toContain('${signed(finance.annualEconomyGrowthRate * 100, 2)}%</i>');
    expect(worldUiSource).not.toContain('class="top-metric top-metric--treasury');
    expect(worldUiSource).not.toContain('class="top-metric top-metric--military');
    expect(worldUiSource).not.toContain('class="top-metric top-metric--apex');
    expect(worldUiSource).not.toContain('class="top-metric top-metric--people-food');
    expect(worldUiSource).not.toContain('class="top-metric top-metric--food"');
    expect(worldUiSource).toContain('including APEX income');
    expect(worldUiSource).toContain('${armyReadiness.value} ARMY');
    expect(worldUiSource).toContain('${people(human.trainedReserves)} RES</span>');
    expect(worldUiSource.match(/title="[^"]+" aria-label="Open (?:Economy|War|Nation|Research)/g)).toHaveLength(5);
  });

  it('shows one dominant value and one concise live line per tile', () => {
    const start = worldUiSource.indexOf('<nav class="strategic-metrics v2-metrics simple-metrics topbar-status"');
    const end = worldUiSource.indexOf('</nav>', start);
    const topbar = worldUiSource.slice(start, end);
    expect(topbar.match(/class="top-metric /g)).toHaveLength(5);
    expect(topbar.match(/<strong(?:\s|>)/g)).toHaveLength(5);
    expect(topbar.match(/<small/g)).toHaveLength(3);
    expect(topbar).not.toContain('EMPIRE TOTAL');
    expect(topbar).toContain('aria-label="Open War. War Supply');
    expect(topbar).not.toContain('<small>${escapeHtml(logisticsDetail)}</small>');
    expect(topbar).toContain('${topbarResearchProgress}%');
    expect(topbar).toContain('${escapeHtml(topbarResearchLabel)}');
    expect(topbar.match(/class="topbar-progress-bar"/g)).toHaveLength(2);
    expect(topbar).not.toMatch(/food|apexFood|foodReserve/i);
    expect(topbar).not.toMatch(/IQ |TARGET<\/i>|\/person|upgrades<\/strong>|condition/i);
    expect(worldUiSource).toContain('topbar-war-alert');
    expect(stylesSource).toContain('.topbar-army-ready');
    expect(stylesSource).toContain('.topbar-defence-stack');
    expect(stylesSource).toContain('.top-metric--population');
    expect(stylesSource).toContain('.top-metric--logistics.is-critical');
    expect(worldUiSource).not.toContain('FRONT MUST CLEAR');
    expect(worldUiSource).toContain("integrationWeeks === undefined ? 'WAITING FOR SUPPLY'");
  });

  it('uses the full command card for the layered defence, logistics and research meters', () => {
    const meterBlock = stylesSource.slice(
      stylesSource.indexOf('.world-ui-v2 .topbar-status .topbar-defence-stack,'),
      stylesSource.indexOf('.world-ui-v2 .topbar-status .topbar-defence-stack > b,'),
    );
    expect(meterBlock).toContain('position: absolute;');
    expect(meterBlock).toContain('inset: 0;');
    expect(meterBlock).toContain('pointer-events: none;');
    expect(meterBlock).not.toMatch(/height:\s*4px|border-radius:\s*999px/);
    expect(stylesSource).toContain('.top-metric--combined-power, .top-metric--logistics, .top-metric--research)::after');
    expect(stylesSource).toContain('@keyframes topbar-shield-scan');
    expect(stylesSource).toContain('z-index: 2;');
  });

  it('turns authoritative deployed versus capacity into a compact readiness state', () => {
    expect(armyReadinessTopbarPresentationV2(0.2, 1)).toEqual({
      percent: 20,
      value: '20%',
      status: 'LOW',
      className: 'is-negative',
    });
    expect(armyReadinessTopbarPresentationV2(0.55, 1)).toEqual({
      percent: 55,
      value: '55%',
      status: 'BUILDING',
      className: 'is-warn',
    });
    expect(armyReadinessTopbarPresentationV2(0.85, 1)).toEqual({
      percent: 85,
      value: '85%',
      status: 'READY',
      className: 'is-positive',
    });
    expect(armyReadinessTopbarPresentationV2(2, 1).percent).toBe(100);
    expect(armyReadinessTopbarPresentationV2(Number.NaN, 0).percent).toBe(0);
  });

  it('does not count an extracted APEX force before full recovery releases it', () => {
    expect(apexShieldTopbarPresentationV2(100, 0.999, 1, 'hq-training')).toEqual({
      supportBonusPercent: 0,
      armyPowerMultiplier: 1,
      integrityPercent: 100,
      pulseAttack: 0,
      recovering: true,
    });
    expect(apexShieldTopbarPresentationV2(100, 1, 1, 'standby')).toEqual({
      supportBonusPercent: 100,
      armyPowerMultiplier: 2,
      integrityPercent: 100,
      pulseAttack: 0,
      recovering: false,
    });
    expect(apexShieldTopbarPresentationV2(100, 0.4, 1, 'evacuate', 0.001)).toMatchObject({
      armyPowerMultiplier: 1,
      pulseAttack: 0,
      recovering: true,
    });
  });

  it('keeps the compact APEX readout shield-native and exposes capstone state', () => {
    expect(worldUiSource).toContain('<span>ENERGY</span>');
    expect(worldUiSource).toContain('${compactNumber(force.shield.integrity)} / ${compactNumber(force.shield.maxIntegrity)} MAX');
    expect(worldUiSource).toContain('OVERDRIVE ${lancer.supportedAssaultCount}/3');
    expect(worldUiSource).toContain('COUNTERMEASURE · 15% INTERCEPT RETURN');
    expect(worldUiSource).toContain('THEATER MESH · ${frontAllocationPercent}% × ${activeFrontCount} FRONTS');
    expect(worldUiSource).toContain('EMPIRE-WIDE SHIELD NETWORK');
    expect(worldUiSource).not.toContain('COMMANDER CORPS');
    expect(worldUiSource).not.toContain('ELITE ARMY');
  });

  it('updates conquest totals directly without resource-flight DOM work', () => {
    expect(worldUiSource).not.toContain('playConquestTransfer');
    expect(worldUiSource).not.toContain('conquestTransferTimers');
    expect(worldUiSource).not.toContain('clearConquestTransferEffects');
    expect(worldUiSource).not.toContain('conquest-transfer-chip');
    expect(worldUiSource).not.toContain('is-receiving-gain');
    expect(worldUiSource).not.toContain('data-stat-target');
    expect(stylesSource).not.toContain('.conquest-transfer-chip');
    expect(stylesSource).not.toContain('.is-receiving-gain');
    expect(stylesSource).not.toContain('[data-stat-target]');
    expect(worldUiSource).toContain("this.scheduleRender(change.reason === 'conquest' ? 0 : (atWar ? 620 : 1_050));");
    expect(worldUiSource).toContain('void worldGameAudio.handleWorldChange(change, audioPresentation);');
    expect(worldUiSource).toContain('mapBridge.scene?.playBattle(change.battle);');
    expect(worldUiSource).toContain('and conquered its land · now rank #');
  });
});
