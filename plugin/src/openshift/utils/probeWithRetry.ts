// Shared one-shot probe with exponential-backoff retry for Console flag handlers.
// Both fleetMeshAvailableFlag and kialiAvailableFlag use this pattern.
// When expectedContentType is provided, the response must also match that MIME prefix.
export function probeWithRetry(
  url: string,
  flagName: string,
  setFlag: (flag: string, value: boolean) => void,
  maxRetries = 3,
  expectedContentType?: string
): void {
  const attempt = (n: number): void => {
    fetch(url)
      .then(r => {
        let ok = r.ok;
        if (ok && expectedContentType) {
          const ct = r.headers.get('content-type') ?? '';
          ok = ct.startsWith(expectedContentType);
        }
        setFlag(flagName, ok);
      })
      .catch(() => {
        if (n < maxRetries) {
          setTimeout(() => attempt(n + 1), 1000 * 2 ** n);
        } else {
          setFlag(flagName, false);
        }
      });
  };
  attempt(0);
}
