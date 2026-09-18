import { truncateMiddle } from '../truncateMiddle';

describe('truncateMiddle', () => {
  it('returns short values unchanged', () => {
    expect(truncateMiddle('v2.31.0')).toBe('v2.31.0');
  });

  it('truncates long SHA digests with middle ellipsis', () => {
    const digest = 'sha256:abc1234567890def1234567890abc1234567890abc1234567890def1234567890';
    const truncated = truncateMiddle(digest, 28);
    expect(truncated).toContain('…');
    expect(truncated.length).toBeLessThanOrEqual(28);
    expect(truncated.startsWith('sha256:abc')).toBe(true);
  });
});
