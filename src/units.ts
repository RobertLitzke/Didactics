// Numbers as a reader wants to see them, in the units their settings ask for.

/** The reader's choice of units, kept in the save. */
export type Units = 'metric' | 'imperial';

/** Metres in feet, rounded the way a person would say it: to 10 ft, or to 500 ft above 1,000. */
export function feet(m: number): number {
  const ft = m * 3.28084;
  return ft < 1000 ? Math.round(ft / 10) * 10 : Math.round(ft / 500) * 500;
}

export function height(m: number, units: Units): string {
  if (units === 'metric') return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 ? 1 : 0)} km` : `${Math.round(m)} m`;
  return `${feet(m).toLocaleString()} ft`;
}

/** A whole-degree temperature with a proper minus sign. */
export const deg = (c: number) => `${c < 0 ? '−' : ''}${Math.abs(c)} °C`;

export function temp(c: number): string {
  return `${c.toFixed(1)} °C`;
}
