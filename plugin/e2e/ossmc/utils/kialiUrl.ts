import { toOssmcConsolePath } from './console-routes';

/** Keep the OSSMC URL adaptation outside the directories replaced by the upstream sync. */
export function kialiUrl(path: string): string {
  const isOssmc = process.env.PLAYWRIGHT_OSSMC === 'true';
  const defaultBase = isOssmc ? 'http://localhost:9000' : 'http://localhost:3001';
  const base = (process.env.PLAYWRIGHT_BASE_URL ?? defaultBase).replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${isOssmc ? toOssmcConsolePath(suffix) : suffix}`;
}
