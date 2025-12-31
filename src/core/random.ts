export interface Random {
  /** 0..maxExclusive-1 */
  nextInt(maxExclusive: number): number;
}

export const defaultRandom: Random = {
  nextInt(maxExclusive) {
    return Math.floor(Math.random() * maxExclusive);
  },
};
