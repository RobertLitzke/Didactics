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

/**
 * A distance from a few centimetres to many kilometres, in the unit a person
 * would say it in: cm, m or km, or in, ft or mi. Under ten it keeps one
 * decimal (1.5 m, 2.4 mi); above, whole numbers (35 cm, 120 m, 15 km).
 */
export function length(m: number, units: Units): string {
  const a = Math.abs(m);
  const say = (v: number, unit: string) => {
    const r = Math.abs(v) < 9.95 ? Math.round(v * 10) / 10 : Math.round(v);
    return `${m < 0 && r !== 0 ? '−' : ''}${Math.abs(r).toLocaleString()} ${unit}`;
  };
  if (units === 'metric') return a < 1 ? say(a * 100, 'cm') : a < 1000 ? say(a, 'm') : say(a / 1000, 'km');
  const ft = a * 3.28084;
  return ft < 1 ? say(ft * 12, 'in') : ft < 1000 ? say(ft, 'ft') : say(ft / 5280, 'mi');
}

/** A whole-degree temperature with a proper minus sign. */
export const deg = (c: number) => `${c < 0 ? '−' : ''}${Math.abs(c)} °C`;

export function temp(c: number): string {
  return `${c.toFixed(1)} °C`;
}
