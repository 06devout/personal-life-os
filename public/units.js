export const kilometersPerMile = 1.609344;
export function milesToKilometers(value) {
  if (value === null || value === undefined || value === '') return null;
  return Math.round(Number(value) * kilometersPerMile * 1000000) / 1000000;
}
export function kilometersToMiles(value) {
  if (value === null || value === undefined || value === '') return null;
  return Number(value) / kilometersPerMile;
}
