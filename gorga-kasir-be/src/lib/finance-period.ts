export function isDateInClosedPeriod(dateIso: string, closedThroughAt?: string) {
  if (!closedThroughAt) {
    return false;
  }

  const closedUntil = new Date(closedThroughAt).getTime();
  const targetDate = new Date(dateIso).getTime();

  if (Number.isNaN(closedUntil) || Number.isNaN(targetDate)) {
    return false;
  }

  return targetDate <= closedUntil;
}
