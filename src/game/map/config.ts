import Phaser from 'phaser';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/worldMap';
import { WorldMapScene } from './WorldMapScene';

export function createPhaserGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-canvas',
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    backgroundColor: '#07111f',
    transparent: true,
    antialias: true,
    fps: {
      target: 40,
      min: 20,
      smoothStep: true,
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    },
    scene: [WorldMapScene],
  });
}
