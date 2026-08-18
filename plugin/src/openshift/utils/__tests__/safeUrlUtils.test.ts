import { buildSafeHttpsUrlFromHost, isSafeHttpUrl } from '../safeUrlUtils';

describe('isSafeHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isSafeHttpUrl('https://console.example.com')).toBe(true);
    expect(isSafeHttpUrl('http://console.example.com/path')).toBe(true);
  });

  it('rejects non-http(s) schemes', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('not-a-url')).toBe(false);
  });
});

describe('buildSafeHttpsUrlFromHost', () => {
  it('builds a https URL for a valid hostname', () => {
    expect(buildSafeHttpsUrlFromHost('kiali.apps.example.com')).toBe('https://kiali.apps.example.com');
  });

  it('rejects malicious or malformed hosts', () => {
    for (const host of ['//evil.com', 'evil.com/path', 'user@evil.com', '', undefined]) {
      expect(buildSafeHttpsUrlFromHost(host)).toBeUndefined();
    }
  });
});
