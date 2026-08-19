export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildSafeHttpsUrlFromHost(host: string | undefined): string | undefined {
  const trimmed = host?.trim();
  if (!trimmed || /[\s/\\?#@:]/.test(trimmed)) {
    return undefined;
  }
  const url = `https://${trimmed}`;
  if (!isSafeHttpUrl(url)) {
    return undefined;
  }
  try {
    return new URL(url).host === trimmed ? url : undefined;
  } catch {
    return undefined;
  }
}
