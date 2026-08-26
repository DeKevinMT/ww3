import { describe, expect, it } from 'vitest';
import worldUiSource from './WorldUIV2.ts?raw';

describe('responsive strategic topbar', () => {
  it('keeps six focused status shortcuts in a horizontally accessible mobile row', () => {
    expect(worldUiSource).toContain('grid-template-columns: repeat(6,minmax(96px,1fr)) !important');
    expect(worldUiSource).toContain('display: grid !important');
    expect(worldUiSource).toContain('overflow-x: auto !important');
    expect(worldUiSource).toContain('.command-topbar .command-identity { display: flex !important; }');
    expect(worldUiSource).toContain('.command-topbar .top-actions { display: flex !important; }');
    expect(worldUiSource).toContain('.top-metric--economy > span');
    expect(worldUiSource).toContain('.top-metric--treasury > span');
    expect(worldUiSource).toContain('.top-metric--military > span');
    expect(worldUiSource).toContain('.top-metric--people > span');
  });

  it('routes every status shortcut to its owning information domain', () => {
    const economy = worldUiSource.indexOf('class="top-metric top-metric--economy"');
    const treasury = worldUiSource.indexOf('data-stat-target="cash"');
    const military = worldUiSource.indexOf('data-panel="war" data-stat-target="army"');
    const people = worldUiSource.indexOf('data-stat-target="people"');
    const food = worldUiSource.indexOf('data-stat-target="food"');
    const research = worldUiSource.indexOf('data-panel="research" aria-label="Open Research');

    expect(economy).toBeGreaterThan(0);
    expect(treasury).toBeGreaterThan(economy);
    expect(military).toBeGreaterThan(treasury);
    expect(people).toBeGreaterThan(military);
    expect(food).toBeGreaterThan(people);
    expect(research).toBeGreaterThan(food);
    expect(worldUiSource).not.toContain('<span>APEX</span>');
    expect(worldUiSource).toContain('data-panel="research"');
    expect(worldUiSource).not.toContain('data-panel="progress"');
  });
});
