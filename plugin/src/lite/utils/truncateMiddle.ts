/** Shortens long strings for compact UI while keeping start/end recognizable (e.g. SHA digests). */
export function truncateMiddle(value: string, maxLength = 28): string {
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength < 5) {
    return `${value.slice(0, maxLength - 1)}…`;
  }
  const headLength = Math.ceil((maxLength - 1) / 2);
  const tailLength = maxLength - 1 - headLength;
  return `${value.slice(0, headLength)}…${value.slice(value.length - tailLength)}`;
}
