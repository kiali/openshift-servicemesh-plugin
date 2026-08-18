import {
  isMissingKubernetesApiError,
  isMissingKubernetesResourceError,
  isMissingModelError,
  isOssmAcmAddonMissing
} from '../watchErrors';

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

  describe('isMissingKubernetesApiError', () => {
    it('detects HttpError-shaped 404 rejections from consoleFetch', () => {
      expect(isMissingKubernetesApiError({ code: 404, message: 'Not Found' })).toBe(true);
      expect(isMissingKubernetesApiError({ statusCode: 404 })).toBe(true);
      expect(isMissingKubernetesApiError({ response: { status: 404 } })).toBe(true);
    });

    it('returns false for non-404 errors', () => {
      expect(isMissingKubernetesApiError(new Error('watch failed'))).toBe(false);
      expect(isMissingKubernetesApiError(null)).toBe(false);
    });
  });

  describe('isMissingKubernetesResourceError', () => {
    it('matches either missing-model or 404 API errors', () => {
      expect(isMissingKubernetesResourceError(new Error('Model does not exist'))).toBe(true);
      expect(isMissingKubernetesResourceError({ code: 404 })).toBe(true);
      expect(isMissingKubernetesResourceError(new Error('watch failed'))).toBe(false);
    });
  });

  describe('isOssmAcmAddonMissing', () => {
    it('returns true when loaded and the MultiClusterMesh model is missing', () => {
      expect(isOssmAcmAddonMissing(true, new Error('Model does not exist'))).toBe(true);
      expect(isOssmAcmAddonMissing(true, { code: 404 })).toBe(true);
    });

    it('returns false while still loading or when another error occurred', () => {
      expect(isOssmAcmAddonMissing(false, new Error('Model does not exist'))).toBe(false);
      expect(isOssmAcmAddonMissing(true, new Error('watch failed'))).toBe(false);
      expect(isOssmAcmAddonMissing(true, null)).toBe(false);
    });
  });
});
