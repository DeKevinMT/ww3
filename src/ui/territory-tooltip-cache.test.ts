import { describe, expect, it } from 'vitest';
import { territoryIdV2 } from '../sim/v2/types';
import worldUiSource from './WorldUIV2.ts?raw';
import { TerritoryTooltipContentCacheV2 } from './WorldUIV2';

describe('territory tooltip cache', () => {
  it('builds each territory only once between game-state changes', () => {
    const cache = new TerritoryTooltipContentCacheV2<string>();
    const belgium = territoryIdV2('bel');
    const france = territoryIdV2('fra');
    let builds = 0;
    const build = (country: string) => () => `${country}-${++builds}`;

    const firstBelgium = cache.resolve(belgium, build('belgium'));
    const firstFrance = cache.resolve(france, build('france'));
    const repeatedBelgium = cache.resolve(belgium, build('unused'));

    expect(builds).toBe(2);
    expect(repeatedBelgium).toBe(firstBelgium);
    expect(firstFrance.content).toBe('france-2');
  });

  it('rebuilds cached content after a game-state invalidation', () => {
    const cache = new TerritoryTooltipContentCacheV2<string>();
    const belgium = territoryIdV2('bel');
    let army = 100;

    const initial = cache.resolve(belgium, () => `army-${army}`);
    army = 84;
    cache.invalidate();
    const updated = cache.resolve(belgium, () => `army-${army}`);

    expect(updated.signature).toBeGreaterThan(initial.signature);
    expect(updated.content).toBe('army-84');
    expect(updated).not.toBe(initial);
  });

  it('keeps heavy selectors and DOM replacement outside the pointer-move fast path', () => {
    const showStart = worldUiSource.indexOf('  private showTooltip(');
    const buildStart = worldUiSource.indexOf('  private buildTerritoryTooltipContent(', showStart);
    const positionStart = worldUiSource.indexOf('  private positionTooltip(', buildStart);
    const toastStart = worldUiSource.indexOf('  private toast(', positionStart);
    expect(showStart).toBeGreaterThan(0);
    expect(buildStart).toBeGreaterThan(showStart);
    expect(positionStart).toBeGreaterThan(buildStart);
    expect(toastStart).toBeGreaterThan(positionStart);

    const show = worldUiSource.slice(showStart, buildStart);
    const build = worldUiSource.slice(buildStart, positionStart);
    const position = worldUiSource.slice(positionStart, toastStart);
    expect(show).toContain('this.tooltipContentCache.resolve');
    expect(show).toContain('this.positionTooltip(x, y, content.hasOpeningMobilisation)');
    expect(show).toContain('this.visibleTooltip?.territoryId !== territoryId');
    expect(show).not.toContain('mapOpeningMobilisationStateV2(');
    expect(show).not.toContain('this.engine.territoryPower(');
    expect(build).toContain('mapOpeningMobilisationStateV2(');
    expect(build).toContain('this.engine.territoryPower(');
    expect(position).toContain('this.tooltip.style.left');
    expect(position).toContain('this.tooltip.style.top');
    expect(worldUiSource).toContain('this.tooltipContentCache.invalidate();');
  });
});
