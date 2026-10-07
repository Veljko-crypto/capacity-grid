export function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function validRange(from: string, to: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    from < "0001-01-01"
  )
    return false;
  const a = Date.parse(`${from}T00:00:00Z`),
    b = Date.parse(`${to}T00:00:00Z`);
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    new Date(a).toISOString().slice(0, 10) === from &&
    new Date(b).toISOString().slice(0, 10) === to &&
    b >= a &&
    b - a <= 731 * 86400000
  );
}
export function capacity(weeklyHours: number, workdays: number) {
  return weeklyHours * (workdays / 5);
}
export function overHours(allocated: number, available: number) {
  const difference = allocated - available;
  // Ignore arithmetic noise, not meaningful fractions of an hour.
  const tolerance =
    Number.EPSILON * Math.max(1, Math.abs(allocated), Math.abs(available)) * 4;
  return difference > tolerance ? difference : 0;
}
