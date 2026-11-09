import { toOssmcConsolePath } from './console-routes';

/** Keep the OSSMC URL adaptation outside the directories replaced by the upstream sync. */
export function kialiUrl(path: string): string {
  const isOssmc = process.env.PLAYWRIGHT_OSSMC === 'true';
  const defaultBase = isOssmc ? 'http://localhost:9000' : 'http://localhost:3001';
  const base = (process.env.PLAYWRIGHT_BASE_URL ?? defaultBase).replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  if (!isOssmc) {
    return `${base}${suffix}`;
  }

  const ossmcPath =
    /^\/api(?:\/|[?#]|$)/.test(suffix) && !suffix.startsWith('/api/proxy/')
      ? `/api/proxy/plugin/ossmconsole/kiali${suffix}`
      : toOssmcConsolePath(suffix);
  return `${base}${ossmcPath}`;
}
