import { kialiStandaloneLinkLabel, ossmcLinkLabel } from '../observabilityLinkLabels';

describe('kialiStandaloneLinkLabel', () => {
  it('returns the hostname from a standalone Kiali URL', () => {
    expect(kialiStandaloneLinkLabel('https://kiali.apps.cluster-a.example.com')).toBe(
      'kiali.apps.cluster-a.example.com'
    );
  });
});

describe('ossmcLinkLabel', () => {
  it('returns the in-console label for hub OSSMC routes', () => {
    expect(ossmcLinkLabel('/ossmconsole/kialis/istio-system/kiali', 'Console')).toBe('Console');
  });

  it('returns the console hostname for spoke OSSMC URLs', () => {
    expect(ossmcLinkLabel('https://console.spoke.example.com/ossmconsole/overview', 'Console')).toBe(
      'console.spoke.example.com'
    );
  });
});
