// z-тест двух пропорций к контролю. Своя мини-реализация без сторонних зависимостей.

// Аппроксимация erf через рациональное приближение (абсолютная погрешность < 1.5e-7).
function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export interface TwoProportionsResult {
  zA: number | null;
  pValueA: number | null;
}

// Двусторонний z-тест варианта A vs control C.
export function twoProportionsZTest(
  nA: number, paidA: number,
  nC: number, paidC: number,
): TwoProportionsResult {
  if (nA < 1 || nC < 1) return { zA: null, pValueA: null };

  const pA = paidA / nA;
  const pC = paidC / nC;
  const pPool = (paidA + paidC) / (nA + nC);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nC));

  if (se === 0) return { zA: null, pValueA: null };

  const z = (pA - pC) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  return { zA: z, pValueA: pValue };
}
