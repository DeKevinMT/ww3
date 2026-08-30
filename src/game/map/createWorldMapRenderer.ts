import { ThreeGlobeScene } from './three/ThreeGlobeScene';

export type WorldMapRenderer = ThreeGlobeScene;

/**
 * The globe is the sole world-map renderer. Keeping this factory asynchronous
 * preserves the established startup order while the renderer itself remains
 * isolated from simulation state.
 */
export async function createWorldMapRenderer(): Promise<WorldMapRenderer> {
  return new ThreeGlobeScene();
}
