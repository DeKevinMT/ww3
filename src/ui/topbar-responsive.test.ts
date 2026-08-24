import { describe, expect, it } from 'vitest';
import worldUiSource from './WorldUIV2.ts?raw';

describe('responsive strategic topbar', () => {
  it('keeps the eight useful metrics in a horizontally accessible mobile row', () => {
    expect(worldUiSource).toContain('grid-template-columns: repeat(8,minmax(88px,1fr)) !important');
    expect(worldUiSource).toContain('display: grid !important');
    expect(worldUiSource).toContain('overflow-x: auto !important');
    expect(worldUiSource).toContain('.command-topbar .command-identity { display: flex !important; }');
    expect(worldUiSource).toContain('.command-topbar .top-actions { display: flex !important; }');
    expect(worldUiSource).toContain('.top-metric--economy > span');
    expect(worldUiSource).toContain('.top-metric--treasury > span');
    expect(worldUiSource).toContain('.top-metric--world-population > span');
    expect(worldUiSource).toContain('.top-metric--world-control > span');
  });

  it('places live Treasury directly after Economy and removes APEX status', () => {
    const economy = worldUiSource.indexOf('class="top-metric--economy"');
    const treasury = worldUiSource.indexOf('class="${treasuryTopbar.className}"');
    const people = worldUiSource.indexOf('data-stat-target="people"');

    expect(economy).toBeGreaterThan(0);
    expect(treasury).toBeGreaterThan(economy);
    expect(people).toBeGreaterThan(treasury);
    expect(worldUiSource).not.toContain('<span>APEX</span>');
    expect(worldUiSource).toContain('<span>WORLD POPULATION</span>');
    expect(worldUiSource).toContain('<span>WORLD LAND</span>');
  });
});
