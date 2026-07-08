/**
 * Sleeper stores fantasy points split across an integer part and a
 * two-digit decimal part, e.g. fpts=1234, fpts_decimal=56 -> 1234.56.
 */
export function combineSleeperPoints(
  base: number | undefined | null,
  decimal: number | undefined | null,
): number {
  const whole = base ?? 0;
  const frac = decimal ?? 0;
  return whole + frac / 100;
}

/** Formats combined points with two decimal places for display. */
export function formatPoints(points: number): string {
  return points.toFixed(2);
}

/**
 * Combines and formats Sleeper's split points in one step.
 * combineSleeperPoints + formatPoints for convenience.
 */
export function formatSleeperPoints(
  base: number | undefined | null,
  decimal: number | undefined | null,
): string {
  return formatPoints(combineSleeperPoints(base, decimal));
}
