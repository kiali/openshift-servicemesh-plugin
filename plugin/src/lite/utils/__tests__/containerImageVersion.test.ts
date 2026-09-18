import { parseContainerImageVersion } from '../containerImageVersion';

describe('parseContainerImageVersion', () => {
  it('parses image tags', () => {
    expect(parseContainerImageVersion('quay.io/kiali/kiali:v2.13.0')).toBe('v2.13.0');
  });

  it('parses image digests', () => {
    const digest = 'sha256:abc1234567890def1234567890abc1234567890abc1234567890def1234567890';
    expect(parseContainerImageVersion(`quay.io/kiali/kiali@${digest}`)).toBe(digest);
  });

  it('returns undefined for empty input', () => {
    expect(parseContainerImageVersion(undefined)).toBeUndefined();
  });
});
