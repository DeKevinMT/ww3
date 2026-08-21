export function normalizeSeed(seed: number): number {
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}

export function nextRandom(state: { rngState: number }): number {
  let value = (state.rngState += 0x6d2b79f5);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  state.rngState = value >>> 0;
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

export function randomInt(state: { rngState: number }, maxExclusive: number): number {
  return Math.floor(nextRandom(state) * maxExclusive);
}

export function shuffleInPlace<T>(state: { rngState: number }, values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = randomInt(state, index + 1);
    [values[index], values[other]] = [values[other]!, values[index]!];
  }
  return values;
}
