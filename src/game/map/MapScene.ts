import Phaser from 'phaser';
import { MAP_HEIGHT, MAP_WIDTH, REGIONS, TERRITORIES, TERRITORY_BY_ID, makeTerritoryPolygon } from '../data/map';
import { countUnitTypes, stackHp } from '../data/units';
import type { WorldEngine } from '../../sim/WorldEngine';
import type { BattleEvent, TerritoryId, WorldLens } from '../../sim/types';
import { mapBridge, type MapSceneAdapter, type MapSelectionState } from './bridge';

interface TerritoryVisual {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Polygon;
  glow: Phaser.GameObjects.Polygon;
  name: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
  composition: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Graphics;
  sigilDisk: Phaser.GameObjects.Arc;
  sigil: Phaser.GameObjects.Text;
}

function colorMix(color: number, target: number, amount: number): number {
  const r = ((color >> 16) & 0xff) * (1 - amount) + ((target >> 16) & 0xff) * amount;
  const g = ((color >> 8) & 0xff) * (1 - amount) + ((target >> 8) & 0xff) * amount;
  const b = (color & 0xff) * (1 - amount) + (target & 0xff) * amount;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export class MapScene extends Phaser.Scene implements MapSceneAdapter {
  private visuals = new Map<TerritoryId, TerritoryVisual>();
  private selection: MapSelectionState = { legalTargetIds: [] };
  private engine?: WorldEngine;
  private lens: WorldLens = 'political';
  private frontGraphics?: Phaser.GameObjects.Graphics;
  private pointerDown?: { x: number; y: number; scrollX: number; scrollY: number };
  private dragged = false;

  constructor() {
    super({ key: 'MapScene' });
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.drawSea();
    this.drawRegionHulls();
    this.drawConnections();
    this.frontGraphics = this.add.graphics().setDepth(-4);
    this.createTerritories();
    this.configureCamera();
    mapBridge.attach(this);
  }

  private drawSea(): void {
    const graphics = this.add.graphics().setDepth(-20);
    graphics.fillStyle(0x07111f, 1).fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    graphics.lineStyle(1, 0x1e4969, 0.17);
    for (let x = 30; x < MAP_WIDTH; x += 42) graphics.lineBetween(x, 0, x, MAP_HEIGHT);
    for (let y = 22; y < MAP_HEIGHT; y += 42) graphics.lineBetween(0, y, MAP_WIDTH, y);

    graphics.lineStyle(1, 0x6ed7e8, 0.08);
    for (let index = 0; index < 12; index += 1) {
      const y = 36 + index * 64;
      const curve = new Phaser.Curves.CubicBezier(
        new Phaser.Math.Vector2(-30, y),
        new Phaser.Math.Vector2(310, y - 36),
        new Phaser.Math.Vector2(890, y + 42),
        new Phaser.Math.Vector2(MAP_WIDTH + 30, y - 8),
      );
      curve.draw(graphics, 48);
    }

    const specks = this.add.graphics().setDepth(-19);
    let state = 19_871;
    for (let index = 0; index < 230; index += 1) {
      state = Math.imul(state ^ (state >>> 13), 1_274_126_177);
      const x = ((state >>> 0) % MAP_WIDTH);
      state = Math.imul(state ^ (state >>> 11), 1_103_515_245);
      const y = ((state >>> 0) % MAP_HEIGHT);
      const alpha = 0.06 + ((state >>> 8) % 12) / 100;
      specks.fillStyle(0x8ad9e8, alpha).fillCircle(x, y, index % 5 === 0 ? 1.2 : 0.7);
    }
  }

  private drawRegionHulls(): void {
    for (const region of REGIONS) {
      const shadow = this.add.polygon(4, 10, region.hull.flatMap((point) => [point.x, point.y]), 0x000000, 0.35)
        .setOrigin(0, 0)
        .setDepth(-12);
      shadow.setStrokeStyle(8, 0x020711, 0.3);

      const hull = this.add.polygon(0, 0, region.hull.flatMap((point) => [point.x, point.y]), colorMix(region.color, 0x0b1728, 0.72), 0.88)
        .setOrigin(0, 0)
        .setDepth(-11)
        .setStrokeStyle(2, colorMix(region.color, 0xffffff, 0.15), 0.36);
      void hull;

      const anchor = region.hull.reduce((point, current) => ({ x: point.x + current.x, y: point.y + current.y }), { x: 0, y: 0 });
      anchor.x /= region.hull.length;
      anchor.y /= region.hull.length;
      this.add.text(anchor.x, anchor.y - 70, `${region.name.toUpperCase()}  +${region.bonus}`, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: '600',
        color: '#9fc3d2',
        letterSpacing: 2,
      }).setOrigin(0.5).setAlpha(0.42).setDepth(-9);
    }
  }

  private drawConnections(): void {
    const graphics = this.add.graphics().setDepth(-7);
    const seen = new Set<string>();
    for (const territory of TERRITORIES) {
      for (const neighborId of territory.neighbors) {
        const key = [territory.id, neighborId].sort().join(':');
        if (seen.has(key)) continue;
        seen.add(key);
        const neighbor = TERRITORY_BY_ID[neighborId]!;
        const isLong = Math.abs(territory.x - neighbor.x) > 470;
        graphics.lineStyle(isLong ? 2 : 1, isLong ? 0x73d7e7 : 0x7eb4c5, isLong ? 0.32 : 0.16);
        if (isLong) {
          const y = 42;
          graphics.beginPath();
          graphics.moveTo(territory.x, territory.y);
          graphics.lineTo(territory.x, y);
          graphics.lineTo(neighbor.x, y);
          graphics.lineTo(neighbor.x, neighbor.y);
          graphics.strokePath();
        } else {
          graphics.lineBetween(territory.x, territory.y, neighbor.x, neighbor.y);
        }
      }
    }
  }

  private createTerritories(): void {
    for (const territory of TERRITORIES) {
      const points = makeTerritoryPolygon(territory).flatMap((point) => [point.x, point.y]);
      const container = this.add.container(territory.x, territory.y).setDepth(1);
      const glow = this.add.polygon(0, 3, points, 0x79e3ff, 0).setStrokeStyle(7, 0x79e3ff, 0).setScale(1.05);
      const body = this.add.polygon(0, 0, points, 0x29465b, 0.96).setStrokeStyle(2, 0xc1e0e8, 0.45);
      const name = this.add.text(0, -17, territory.name.toUpperCase(), {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '10px',
        fontStyle: '600',
        color: '#eaf8fc',
        letterSpacing: 0.7,
        align: 'center',
      }).setOrigin(0.5);
      const count = this.add.text(0, 4, '1', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '20px',
        fontStyle: '700',
        color: '#ffffff',
      }).setOrigin(0.5);
      const composition = this.add.text(0, 27, 'I1', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '10px',
        fontStyle: '600',
        color: '#c8e2e9',
        letterSpacing: 0.4,
      }).setOrigin(0.5);
      const hpBar = this.add.graphics();
      const sigilDisk = this.add.circle(-territory.radiusX * 0.62, -territory.radiusY * 0.55, 10, 0x07111f, 0.88)
        .setStrokeStyle(1, 0xffffff, 0.35);
      const sigil = this.add.text(sigilDisk.x, sigilDisk.y, '', {
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: '10px', fontStyle: '800', color: '#ffffff',
      }).setOrigin(0.5);

      container.add([glow, body, hpBar, sigilDisk, sigil, name, count, composition]);
      body.setInteractive(new Phaser.Geom.Polygon(points), Phaser.Geom.Polygon.Contains);
      body.on('pointerover', (pointer: Phaser.Input.Pointer) => {
        container.setScale(1.035);
        const position = this.clientPosition(pointer);
        mapBridge.onTerritoryHover?.(territory.id, position.x, position.y);
      });
      body.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        const position = this.clientPosition(pointer);
        mapBridge.onTerritoryHover?.(territory.id, position.x, position.y);
      });
      body.on('pointerout', () => {
        container.setScale(1);
        mapBridge.onTerritoryHover?.(undefined, 0, 0);
      });
      body.on('pointerup', () => {
        if (!this.dragged) mapBridge.onTerritoryClick?.(territory.id);
      });

      this.visuals.set(territory.id, { container, body, glow, name, count, composition, hpBar, sigilDisk, sigil });
    }
  }

  private clientPosition(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const event = pointer.event;
    if ('clientX' in event) return { x: event.clientX, y: event.clientY };
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : { x: pointer.x, y: pointer.y };
  }

  private configureCamera(): void {
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      const camera = this.cameras.main;
      const before = camera.getWorldPoint(pointer.x, pointer.y);
      camera.setZoom(Phaser.Math.Clamp(camera.zoom - dy * 0.0007, 0.78, 1.45));
      const after = camera.getWorldPoint(pointer.x, pointer.y);
      camera.scrollX += before.x - after.x;
      camera.scrollY += before.y - after.y;
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragged = false;
      this.pointerDown = {
        x: pointer.x,
        y: pointer.y,
        scrollX: this.cameras.main.scrollX,
        scrollY: this.cameras.main.scrollY,
      };
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !this.pointerDown) return;
      const dx = pointer.x - this.pointerDown.x;
      const dy = pointer.y - this.pointerDown.y;
      if (Math.hypot(dx, dy) > 7) this.dragged = true;
      if (this.dragged) {
        this.cameras.main.scrollX = this.pointerDown.scrollX - dx / this.cameras.main.zoom;
        this.cameras.main.scrollY = this.pointerDown.scrollY - dy / this.cameras.main.zoom;
      }
    });
    this.input.on('pointerup', () => {
      this.pointerDown = undefined;
      this.time.delayedCall(20, () => { this.dragged = false; });
    });
  }

  sync(engine: WorldEngine): void {
    this.engine = engine;
    for (const territory of TERRITORIES) {
      const state = engine.state.territories[territory.id];
      const visual = this.visuals.get(territory.id);
      const owner = engine.state.players.find((player) => player.id === state?.ownerId);
      if (!state || !visual || !owner) continue;
      let territoryColor = owner.color;
      if (this.lens === 'economy') {
        const intensity = Phaser.Math.Clamp(state.economy / 26, 0.22, 1);
        territoryColor = colorMix(0x36516b, 0x62dfaf, intensity);
      } else if (this.lens === 'research') {
        const intensity = Phaser.Math.Clamp(state.research / 12, 0.2, 1);
        territoryColor = colorMix(0x31415d, 0xb391ff, intensity);
      } else if (this.lens === 'military') {
        const hp = stackHp(state.units);
        const intensity = Phaser.Math.Clamp((hp.current / Math.max(1, hp.max)) * state.units.length / 7, 0.18, 1);
        territoryColor = colorMix(0x2a394d, owner.color, intensity);
      } else if (this.lens === 'diplomacy') {
        const relation = owner.id === engine.state.humanPlayerId ? undefined : engine.relation(engine.state.humanPlayerId, owner.id);
        if (owner.id === engine.state.humanPlayerId) territoryColor = owner.color;
        else if (relation?.status === 'war') territoryColor = 0xff5d59;
        else territoryColor = relation && relation.score >= 20 ? 0x62dfaf : relation && relation.score < -20 ? 0xf29b66 : 0x718a9a;
      }
      visual.body.setFillStyle(colorMix(territoryColor, 0x0b1728, 0.34), 0.98);
      visual.body.setStrokeStyle(2, colorMix(owner.color, 0xffffff, 0.32), 0.78);
      visual.count.setText(String(state.units.length));
      const counts = countUnitTypes(state.units);
      visual.composition.setText(`I${counts.infantry}  P${counts.armor}  A${counts.artillery}`);
      visual.sigil.setText(owner.sigil).setColor(owner.cssColor);
      visual.sigilDisk.setStrokeStyle(1, owner.color, 0.75);
      const hp = stackHp(state.units);
      const ratio = hp.max > 0 ? hp.current / hp.max : 0;
      visual.hpBar.clear();
      visual.hpBar.fillStyle(0x07111f, 0.7).fillRoundedRect(-27, 37, 54, 3, 2);
      visual.hpBar.fillStyle(owner.color, 0.95).fillRoundedRect(-27, 37, 54 * ratio, 3, 2);
    }
    this.drawLiveFronts(engine);
    this.setSelection(this.selection);
  }

  private drawLiveFronts(engine: WorldEngine): void {
    const graphics = this.frontGraphics;
    if (!graphics) return;
    graphics.clear();
    const seen = new Set<string>();
    for (const territory of TERRITORIES) {
      const ownerId = engine.state.territories[territory.id]?.ownerId;
      for (const neighborId of territory.neighbors) {
        const key = [territory.id, neighborId].sort().join(':');
        if (seen.has(key)) continue;
        seen.add(key);
        const neighborOwnerId = engine.state.territories[neighborId]?.ownerId;
        if (!ownerId || !neighborOwnerId || ownerId === neighborOwnerId || !engine.activeWarBetween(ownerId, neighborOwnerId)) continue;
        const neighbor = TERRITORY_BY_ID[neighborId]!;
        graphics.lineStyle(8, 0xff544f, 0.13).lineBetween(territory.x, territory.y, neighbor.x, neighbor.y);
        graphics.lineStyle(3, 0xff7d71, 0.82).lineBetween(territory.x, territory.y, neighbor.x, neighbor.y);
        const centerX = (territory.x + neighbor.x) / 2;
        const centerY = (territory.y + neighbor.y) / 2;
        graphics.fillStyle(0xffd2a1, 0.95).fillCircle(centerX, centerY, 4);
        graphics.lineStyle(1, 0xffffff, 0.75).strokeCircle(centerX, centerY, 7);
      }
    }
  }

  setSelection(selection: MapSelectionState): void {
    this.selection = selection;
    const legal = new Set(selection.legalTargetIds);
    const hinted = new Set(selection.hintTargetIds ?? []);
    for (const [territoryId, visual] of this.visuals) {
      const selected = territoryId === selection.sourceId;
      const target = territoryId === selection.targetId;
      const isLegal = legal.has(territoryId);
      const isHinted = hinted.has(territoryId);
      visual.glow.setFillStyle(target ? 0xffd36b : 0x79e3ff, selected || target ? 0.09 : 0);
      visual.glow.setStrokeStyle(selected || target || isLegal || isHinted
        ? selected || target ? 6 : isLegal ? 3 : 1.5 : 0,
      target ? 0xffd36b : 0x79e3ff,
      selected || target ? 0.9 : isLegal ? 0.42 : isHinted ? 0.22 : 0);
      visual.container.setDepth(selected || target ? 8 : isLegal ? 4 : isHinted ? 2 : 1);
      visual.body.setAlpha(legal.size > 0 && !selected && !target && !isLegal ? 0.72 : 1);
    }
  }

  focusAction(sourceId?: TerritoryId, targetId?: TerritoryId): void {
    const source = sourceId ? TERRITORY_BY_ID[sourceId] : undefined;
    const target = targetId ? TERRITORY_BY_ID[targetId] : undefined;
    const point = target ?? source;
    if (!point) return;
    this.tweens.add({
      targets: this.cameras.main,
      scrollX: point.x - this.cameras.main.width / (2 * this.cameras.main.zoom),
      scrollY: point.y - this.cameras.main.height / (2 * this.cameras.main.zoom),
      duration: 360,
      ease: 'Sine.easeInOut',
    });
  }

  playBattle(result: BattleEvent): void {
    const target = this.visuals.get(result.targetId);
    if (!target) return;
    this.tweens.add({
      targets: target.container,
      x: { from: target.container.x - 3, to: target.container.x },
      duration: 55,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: target.glow,
      alpha: { from: 1, to: 0 },
      duration: result.conquered ? 700 : 380,
      ease: 'Quad.easeOut',
    });
  }

  setLens(lens: WorldLens): void {
    this.lens = lens;
    if (this.engine) this.sync(this.engine);
  }

  resetCamera(): void {
    this.cameras.main.stopFollow();
    this.tweens.add({ targets: this.cameras.main, scrollX: 0, scrollY: 0, zoom: 1, duration: 420, ease: 'Sine.easeInOut' });
  }
}
