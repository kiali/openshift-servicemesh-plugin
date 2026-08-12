import { isMissingModelError } from '../watchErrors';

describe('watchErrors', () => {
  describe('isMissingModelError', () => {
    it('detects the Console missing-model message', () => {
      expect(isMissingModelError(new Error('Model does not exist'))).toBe(true);
      expect(isMissingModelError('Model does not exist')).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(isMissingModelError(new Error('watch failed'))).toBe(false);
      expect(isMissingModelError(new Error('Forbidden'))).toBe(false);
      expect(isMissingModelError(null)).toBe(false);
      expect(isMissingModelError(undefined)).toBe(false);
    });
  });
});
