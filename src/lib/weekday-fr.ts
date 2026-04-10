/** Jour ISO 1–7 (lundi → dimanche), aligné sur date-fns getISODay */

export const ISO_WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 7, label: "Dimanche" },
];

export function isoWeekdayLabel(isoDay: number): string {
  const o = ISO_WEEKDAY_OPTIONS.find((x) => x.value === isoDay);
  return o?.label ?? `Jour ${isoDay}`;
}
