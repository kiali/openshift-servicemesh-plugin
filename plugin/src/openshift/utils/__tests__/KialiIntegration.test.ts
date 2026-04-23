import { parseTempoUrl, resolveConsoleUrl } from '../KialiIntegration';

jest.mock('../../components/KialiController', () => ({
  distributedTracingPluginConfig: undefined,
  netobservPluginConfig: undefined,
  pluginConfig: undefined
}));

jest.mock('react-router-dom-v5-compat', () => ({
  useNavigate: jest.fn(),
  createBrowserRouter: jest.fn(() => ({})),
  createHashRouter: jest.fn(() => ({})),
  createMemoryRouter: jest.fn(() => ({}))
}));

jest.mock('app/History', () => ({
  setRouter: jest.fn()
}));

jest.mock('../IstioResources', () => {
  const actual = jest.requireActual('../IstioResources');
  return {
    refForKialiIstio: jest.fn(actual.refForKialiIstio)
  };
});

jest.mock('store/ConfigStore', () => ({
  store: { getState: jest.fn(() => ({ tracingState: { info: null } })), dispatch: jest.fn(), subscribe: jest.fn() }
}));

describe('resolveConsoleUrl', () => {
  describe('applications route', () => {
    it('should map /applications to /ossmconsole/applications', () => {
      expect(resolveConsoleUrl('/applications')).toEqual('/ossmconsole/applications');
    });

    it('should preserve query parameters', () => {
      expect(resolveConsoleUrl('/applications?namespaces=bookinfo')).toEqual(
        '/ossmconsole/applications?namespaces=bookinfo'
      );
    });
  });

  describe('namespaces route', () => {
    it('should map /namespaces to /ossmconsole/namespaces', () => {
      expect(resolveConsoleUrl('/namespaces')).toEqual('/ossmconsole/namespaces');
    });

    it('should map /namespaces/bookinfo to /ossmconsole/namespaces/bookinfo', () => {
      expect(resolveConsoleUrl('/namespaces/bookinfo')).toEqual('/ossmconsole/namespaces/bookinfo');
    });

    it('should map namespace application detail to k8s pods URL', () => {
      expect(resolveConsoleUrl('/namespaces/bookinfo/applications/reviews')).toEqual(
        '/k8s/ns/bookinfo/pods?labels=app%3Dreviews'
      );
    });

    it('should map namespace workload detail to k8s deployment URL', () => {
      expect(resolveConsoleUrl('/namespaces/bookinfo/workloads/reviews-v1')).toEqual(
        '/k8s/ns/bookinfo/deployments/reviews-v1/ossmconsole'
      );
    });

    it('should map namespace service detail to k8s service URL', () => {
      expect(resolveConsoleUrl('/namespaces/bookinfo/services/reviews')).toEqual(
        '/k8s/ns/bookinfo/services/reviews/ossmconsole'
      );
    });

    it('should preserve query parameters on namespaces fallback', () => {
      expect(resolveConsoleUrl('/namespaces?duration=60')).toEqual('/ossmconsole/namespaces?duration=60');
    });
  });

  describe('graph route', () => {
    it('should map graph/namespaces to ossmconsole/graph', () => {
      expect(resolveConsoleUrl('/graph/namespaces')).toEqual('/ossmconsole/graph');
    });

    it('should map graph/node/namespaces to ossmconsole/graph/ns', () => {
      expect(resolveConsoleUrl('/graph/node/namespaces')).toEqual('/ossmconsole/graph/ns');
    });

    it('should preserve query parameters', () => {
      expect(resolveConsoleUrl('/graph/namespaces?duration=60')).toEqual('/ossmconsole/graph?duration=60');
    });
  });

  describe('mesh route', () => {
    it('should map /mesh to /ossmconsole/mesh', () => {
      expect(resolveConsoleUrl('/mesh')).toEqual('/ossmconsole/mesh');
    });

    it('should preserve query parameters', () => {
      expect(resolveConsoleUrl('/mesh?tab=overview')).toEqual('/ossmconsole/mesh?tab=overview');
    });
  });

  describe('services route', () => {
    it('should map /services to /k8s/all-namespaces/services', () => {
      expect(resolveConsoleUrl('/services')).toEqual('/k8s/all-namespaces/services');
    });
  });

  describe('istio route', () => {
    it('should map /istio with single namespace to /k8s/ns/<namespace>/istio', () => {
      expect(resolveConsoleUrl('/istio?namespaces=bookinfo')).toEqual('/k8s/ns/bookinfo/istio');
    });

    it('should map /istio without namespaces to /k8s/all-namespaces/istio', () => {
      expect(resolveConsoleUrl('/istio')).toEqual('/k8s/all-namespaces/istio');
    });

    it('should map /istio with multiple namespaces to /k8s/all-namespaces/istio', () => {
      expect(resolveConsoleUrl('/istio?namespaces=a,b')).toEqual('/k8s/all-namespaces/istio');
    });
  });

  describe('tracing route', () => {
    const mockController = jest.requireMock('../../components/KialiController') as Record<string, unknown>;

    afterEach(() => {
      mockController.distributedTracingPluginConfig = undefined;
      mockController.pluginConfig = undefined;
    });

    it('should return null when tracing plugin is not configured', () => {
      expect(resolveConsoleUrl('/tracing?trace=abc')).toBeNull();
    });

    it('should return observe/traces URL when tracing plugin is configured with observability', () => {
      mockController.distributedTracingPluginConfig = { extensions: [{}] };
      mockController.pluginConfig = {
        observability: { instance: 'tempo', namespace: 'tracing', tenant: 'default' }
      };
      expect(resolveConsoleUrl('/tracing?trace=abc123')).toEqual(
        '/observe/traces/abc123?namespace=tracing&name=tempo&tenant=default'
      );
    });

    it('should return trace list URL when no specific trace is requested', () => {
      mockController.distributedTracingPluginConfig = { extensions: [{}] };
      mockController.pluginConfig = {
        observability: { instance: 'tempo', namespace: 'tracing', tenant: 'default' }
      };
      expect(resolveConsoleUrl('/tracing')).toEqual(
        '/observe/traces?namespace=tracing&name=tempo&tenant=default&q=%7B%7D&limit=20'
      );
    });
  });

  describe('netobserv route', () => {
    const mockController = jest.requireMock('../../components/KialiController') as Record<string, unknown>;

    afterEach(() => {
      mockController.netobservPluginConfig = undefined;
    });

    it('should use netflow target when netobserv plugin is configured', () => {
      mockController.netobservPluginConfig = { extensions: [{}] };
      expect(resolveConsoleUrl('/netobserv/namespaces/bookinfo/workloads/reviews-v1')).toEqual(
        '/k8s/ns/bookinfo/deployments/reviews-v1/netflow'
      );
    });

    it('should fall back to ossmconsole when netobserv plugin is not configured', () => {
      expect(resolveConsoleUrl('/netobserv/namespaces/bookinfo/workloads/reviews-v1')).toEqual(
        '/k8s/ns/bookinfo/deployments/reviews-v1/ossmconsole'
      );
    });
  });

  describe('namespaces with istio detail', () => {
    it('should map namespace istio detail through refForKialiIstio', () => {
      expect(resolveConsoleUrl('/namespaces/bookinfo/istio/networking.istio.io/v1/VirtualService/reviews')).toEqual(
        '/k8s/ns/bookinfo/networking.istio.io~v1~VirtualService/reviews/ossmconsole'
      );
    });

    it('should map security istio detail through refForKialiIstio', () => {
      expect(
        resolveConsoleUrl('/namespaces/bookinfo/istio/security.istio.io/v1/AuthorizationPolicy/deny-all')
      ).toEqual('/k8s/ns/bookinfo/security.istio.io~v1~AuthorizationPolicy/deny-all/ossmconsole');
    });
  });

  describe('bare namespace (no sub-path)', () => {
    it('should rewrite /namespaces/bookinfo to /ossmconsole/namespaces/bookinfo', () => {
      expect(resolveConsoleUrl('/namespaces/bookinfo')).toEqual('/ossmconsole/namespaces/bookinfo');
    });
  });

  describe('services route drops query params', () => {
    it('should ignore query params on /services', () => {
      expect(resolveConsoleUrl('/services?namespaces=foo')).toEqual('/k8s/all-namespaces/services');
    });
  });

  describe('tracing fallback with url param', () => {
    it('should return null and attempt navigation when tracing plugin is not configured but url param is present', () => {
      // window.location.href assignment triggers jsdom navigation which is hard to intercept;
      // we verify the branch returns null (the navigation side-effect is tested implicitly).
      const result = resolveConsoleUrl('/tracing?url=https%3A%2F%2Fjaeger.example.com');
      expect(result).toBeNull();
    });
  });

  it('should return null for unknown routes', () => {
    expect(resolveConsoleUrl('/unknown')).toBeNull();
  });
});

describe('parseTempoUrl', () => {
  it('url for multi tenant should be correct', () => {
    const url = "https://tempo-sample-my-instance-gateway.tempo.svc.cluster.local:8080/api/traces/v1/default"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toEqual('default');
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample-my-instance');
  });

  it('url for multi tenant not secure should be correct', () => {
    const url = "http://tempo-sample.tempo.svc.cluster.local:8080/api/traces/v1/default"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toEqual('default');
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample');
  });

  it('url for multi tenant url with no tenant should be correct', () => {
    const url = "https://tempo-sample-my-instance.tempo.svc.cluster.local:8080/api/traces/v1/"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toBeUndefined();
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample-my-instance');
  });

  it('url for single tenant and http should be correct', () => {
    const url = "http://tempo-sample-query-frontend.tempo.svc:3200"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toBeUndefined();
    expect(parsed?.instance).toEqual('sample');
    expect(parsed?.namespace).toEqual('tempo');
  });

  it('url for single tenant and https should be correct', () => {
    const url = "https://tempo-sample-query-frontend.tempo.svc:3200"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toBeUndefined();
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample');
  });


});
