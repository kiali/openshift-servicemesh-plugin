import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';

// Base delay for the exponential backoff below. Kept short because this only exists to
// smooth over a transient blip (e.g. the plugin proxy not being warmed up yet on a fresh
// page load) -- the flag-gated nav/routes stay hidden (and any already-open plugin route
// 404s) for as long as this retry loop is running, so a slow backoff directly extends how
// long that's visible to the user.
const BASE_RETRY_DELAY_MS = 250;

// Console's runtime consoleFetch (unlike the browser's native fetch) rejects the promise for
// any non-2xx response instead of resolving with `ok: false` -- the rejection is an HttpError
// carrying the HTTP status on `.code`. We duck-type on that shape (rather than importing the
// class, which Console doesn't expose on the plugin SDK) to tell "got a definitive answer from
// the server" apart from a genuine network-level failure (e.g. TypeError from a dropped
// connection, or the SDK's own TimeoutError, neither of which carry a numeric `.code`).
function isDefinitiveHttpError(e: unknown): boolean {
  return typeof (e as { code?: unknown } | undefined)?.code === 'number';
}

// Shared one-shot probe with exponential-backoff retry for Console flag handlers.
// Both fleetMeshAvailableFlag and kialiAvailableFlag use this pattern.
// When expectedContentType is provided, the response must also match that MIME prefix.
//
// Only genuine network-level failures are retried. A definitive HTTP response -- whether
// returned via `r.ok === false` or thrown as an HttpError -- or a content-type mismatch, is
// a definitive answer (most commonly "this isn't installed on the cluster"), so we resolve
// immediately rather than spending several seconds of exponential backoff retrying a result
// that won't change.
//
// Uses the SDK's consoleFetch rather than the browser's native fetch: per the dynamic-plugin
// docs, requests proxied through a plugin's service proxy need console-specific request
// headers that only consoleFetch attaches, so a plain fetch can fail unpredictably here.
export function probeWithRetry(
  url: string,
  flagName: string,
  setFlag: (flag: string, value: boolean) => void,
  maxRetries = 3,
  expectedContentType?: string
): void {
  const attempt = (n: number): void => {
    consoleFetch(url)
      .then(r => {
        let ok = r.ok;
        if (ok && expectedContentType) {
          const ct = r.headers.get('content-type') ?? '';
          ok = ct.startsWith(expectedContentType);
        }
        setFlag(flagName, ok);
      })
      .catch((e: unknown) => {
        if (n < maxRetries && !isDefinitiveHttpError(e)) {
          setTimeout(() => attempt(n + 1), BASE_RETRY_DELAY_MS * 2 ** n);
        } else {
          setFlag(flagName, false);
        }
      });
  };
  attempt(0);
}
