function urlHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/** Detail-page Kiali link text: destination hostname, not the product name. */
export function kialiStandaloneLinkLabel(url: string): string {
  return urlHostname(url) ?? url;
}

/** Detail-page OSSMC link text: hub in-console routes use a short label; spokes use console hostname. */
export function ossmcLinkLabel(url: string, inConsoleLabel: string): string {
  if (url.startsWith('/')) {
    return inConsoleLabel;
  }
  return urlHostname(url) ?? url;
}
