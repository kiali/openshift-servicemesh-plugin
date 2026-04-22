import { parseWorkloadName } from '../WorkloadMesh';

jest.mock('react-router-dom-v5-compat', () => ({
  useParams: jest.fn(),
  useLocation: jest.fn()
}));

jest.mock('../../../utils/KialiIntegration', () => ({
  setRouterBasename: jest.fn(),
  useInitKialiListeners: jest.fn()
}));

jest.mock('../../../components/KialiController', () => ({
  centerVerticalHorizontalStyle: 'mock-style'
}));

jest.mock('openshift/components/KialiContainer', () => ({
  KialiContainer: jest.fn()
}));

jest.mock('openshift/utils/IstioResources', () => ({
  ResourceURLPathProps: {}
}));

jest.mock('openshift/components/ErrorPage', () => ({
  ErrorPage: jest.fn()
}));

jest.mock('utils/I18nUtils', () => ({
  useKialiTranslation: jest.fn(() => ({ t: (s: string) => s }))
}));

jest.mock('services/Api', () => ({
  getWorkload: jest.fn()
}));

jest.mock('openshift/styles/GlobalStyle', () => ({
  meshTabPageStyle: 'mock-style'
}));

jest.mock('pages/WorkloadDetails/WorkloadDetailsPage', () => ({
  WorkloadDetailsPage: jest.fn()
}));

describe('parseWorkloadName', () => {
  describe('Deployment pods (3+ segments)', () => {
    it('should strip ReplicaSet hash and pod hash from a typical deployment pod', () => {
      expect(parseWorkloadName('details-v1-77b775f46-c7vjb')).toBe('details-v1');
    });

    it('should strip hash suffixes from istiod pods', () => {
      expect(parseWorkloadName('istiod-866fd6ccd7-7v8p5')).toBe('istiod');
    });

    it('should handle multi-segment workload names', () => {
      expect(parseWorkloadName('kiali-traffic-generator-abc123-xyz99')).toBe('kiali-traffic-generator');
    });

    it('should handle exactly 3 segments', () => {
      expect(parseWorkloadName('app-hash1-hash2')).toBe('app');
    });
  });

  describe('DaemonSet / StatefulSet pods (2 segments)', () => {
    it('should strip the pod suffix from a DaemonSet pod', () => {
      expect(parseWorkloadName('ztunnel-f94gp')).toBe('ztunnel');
    });

    it('should strip the suffix from a two-segment name', () => {
      expect(parseWorkloadName('coredns-abc12')).toBe('coredns');
    });
  });

  describe('single-segment names', () => {
    it('should return the name unchanged when there is no dash', () => {
      expect(parseWorkloadName('singlename')).toBe('singlename');
    });

    it('should return an empty string unchanged', () => {
      expect(parseWorkloadName('')).toBe('');
    });
  });
});
