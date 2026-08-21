import './styles.css';
import { validateMap } from './game/data/worldMap';
import { createPhaserGame } from './game/map/config';
import { WorldEngineV2 } from './sim/v2/WorldEngineV2';
import { WorldUIV2 } from './ui/WorldUIV2';

const mapErrors = validateMap();
if (mapErrors.length > 0) throw new Error(`Invalid map:\n${mapErrors.join('\n')}`);

const requestedSeed = Number(new URLSearchParams(window.location.search).get('seed'));
const randomSeed = new Uint32Array(1);
window.crypto.getRandomValues(randomSeed);
const seed = Number.isInteger(requestedSeed) && requestedSeed > 0 ? requestedSeed >>> 0 : randomSeed[0] || 1;
const engine = new WorldEngineV2(seed);
createPhaserGame();
new WorldUIV2(engine);
engine.startClock();
