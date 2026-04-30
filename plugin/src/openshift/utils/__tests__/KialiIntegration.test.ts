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
  const actual = (jest as any).requireActual('../IstioResources');
  return {
    refForKialiIstio: jest.fn(actual.refForKialiIstio)
  };
});

jest.mock('store/ConfigStore', () => ({
  store: { getState: jest.fn(() => ({ tracingState: { info: null } })), dispatch: jest.fn(), subscribe: jest.fn() }
}));

describe('resolveConsoleUrl', () => {
  describe('applications route', () => {
    test('should map /applications to /ossmconsole/applications', () => {
      expect(resolveConsoleUrl('/applications')).toEqual('/ossmconsole/applications');
    });

    test('should preserve query parameters', () => {
      expect(resolveConsoleUrl('/applications?namespaces=bookinfo')).toEqual(
        '/ossmconsole/applications?namespaces=bookinfo'
      );
    });
  });

  describe('namespaces route', () => {
    test('should map /namespaces to /ossmconsole/namespaces', () => {
      expect(resolveConsoleUrl('/namespaces')).toEqual('/ossmconsole/namespaces');
    });

    test('should map /namespaces/bookinfo to /ossmconsole/namespaces/bookinfo', () => {
      expect(resolveConsoleUrl('/namespaces/bookinfo')).toEqual('/ossmconsole/namespaces/bookinfo');
    });

    test('should map namespace application detail to k8s pods URL', () => {
      expect(resolveConsoleUrl('/namespaces/bookinfo/applications/reviews')).toEqual(
        '/k8s/ns/bookinfo/pods?label=app%3Dreviews'
      );
    });

    test('should map namespace workload detail to k8s deployment URL', () => {
      expect(resolveConsoleUrl('/namespaces/bookinfo/workloads/reviews-v1')).toEqual(
        '/k8s/ns/bookinfo/deployments/reviews-v1/ossmconsole'
      );
    });

    test('should map namespace service detail to k8s service URL', () => {
      expect(resolveConsoleUrl('/namespaces/bookinfo/services/reviews')).toEqual(
        '/k8s/ns/bookinfo/services/reviews/ossmconsole'
      );
    });

    test('should preserve query parameters on namespaces fallback', () => {
      expect(resolveConsoleUrl('/namespaces?duration=60')).toEqual('/ossmconsole/namespaces?duration=60');
    });
  });

  describe('graph route', () => {
    test('should map graph/namespaces to ossmconsole/graph', () => {
      expect(resolveConsoleUrl('/graph/namespaces')).toEqual('/ossmconsole/graph');
    });

    test('should map graph/node/namespaces to ossmconsole/graph/ns', () => {
      expect(resolveConsoleUrl('/graph/node/namespaces')).toEqual('/ossmconsole/graph/ns');
    });

    test('should preserve query parameters', () => {
      expect(resolveConsoleUrl('/graph/namespaces?duration=60')).toEqual('/ossmconsole/graph?duration=60');
    });
  });

  describe('mesh route', () => {
    test('should map /mesh to /ossmconsole/mesh', () => {
      expect(resolveConsoleUrl('/mesh')).toEqual('/ossmconsole/mesh');
    });

    test('should preserve query parameters', () => {
      expect(resolveConsoleUrl('/mesh?tab=overview')).toEqual('/ossmconsole/mesh?tab=overview');
    });
  });

  describe('services route', () => {
    test('should map /services to /k8s/all-namespaces/services', () => {
      expect(resolveConsoleUrl('/services')).toEqual('/k8s/all-namespaces/services');
    });

    test('should ignore query params on /services', () => {
      expect(resolveConsoleUrl('/services?namespaces=foo')).toEqual('/k8s/all-namespaces/services');
    });
  });

  describe('istio route', () => {
    test('should map /istio with single namespace to /ossmconsole/istio preserving query params', () => {
      expect(resolveConsoleUrl('/istio?namespaces=bookinfo')).toEqual('/ossmconsole/istio?namespaces=bookinfo');
    });

    test('should map /istio without namespaces to /ossmconsole/istio', () => {
      expect(resolveConsoleUrl('/istio')).toEqual('/ossmconsole/istio');
    });

    test('should map /istio with multiple namespaces to /ossmconsole/istio preserving query params', () => {
      expect(resolveConsoleUrl('/istio?namespaces=a,b')).toEqual('/ossmconsole/istio?namespaces=a,b');
    });
  });

  describe('tracing route', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mockController = require('../../components/KialiController') as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mockStore = require('store/ConfigStore') as { store: { getState: jest.Mock } };

    afterEach(() => {
      mockController.distributedTracingPluginConfig = undefined;
      mockController.pluginConfig = undefined;
      mockStore.store.getState.mockReturnValue({ tracingState: { info: null } });
    });

    test('should return null when tracing plugin is not configured', () => {
      expect(resolveConsoleUrl('/tracing?trace=abc')).toBeNull();
    });

    test('should return observe/traces URL when tracing plugin is configured with observability', () => {
      mockController.distributedTracingPluginConfig = { extensions: [{}] };
      mockController.pluginConfig = {
        observability: { instance: 'tempo', namespace: 'tracing', tenant: 'default' }
      };
      expect(resolveConsoleUrl('/tracing?trace=abc123')).toEqual(
        '/observe/traces/abc123?namespace=tracing&name=tempo&tenant=default'
      );
    });

    test('should return trace list URL when no specific trace is requested', () => {
      mockController.distributedTracingPluginConfig = { extensions: [{}] };
      mockController.pluginConfig = {
        observability: { instance: 'tempo', namespace: 'tracing', tenant: 'default' }
      };
      expect(resolveConsoleUrl('/tracing')).toEqual(
        '/observe/traces?namespace=tracing&name=tempo&tenant=default&q=%7B%7D&limit=20'
      );
    });

    test('should return trace list URL when trace param is the literal string "undefined"', () => {
      mockController.distributedTracingPluginConfig = { extensions: [{}] };
      mockController.pluginConfig = {
        observability: { instance: 'tempo', namespace: 'tracing', tenant: 'default' }
      };
      expect(resolveConsoleUrl('/tracing?trace=undefined')).toEqual(
        '/observe/traces?namespace=tracing&name=tempo&tenant=default&q=%7B%7D&limit=20'
      );
    });

    test('should return null when plugin is configured but no observability data is available', () => {
      mockController.distributedTracingPluginConfig = { extensions: [{}] };
      mockController.pluginConfig = {};
      expect(resolveConsoleUrl('/tracing?trace=abc')).toBeNull();
    });

    test('should return null when extensions array is empty', () => {
      mockController.distributedTracingPluginConfig = { extensions: [] };
      mockController.pluginConfig = {
        observability: { instance: 'tempo', namespace: 'tracing', tenant: 'default' }
      };
      expect(resolveConsoleUrl('/tracing?trace=abc')).toBeNull();
    });

    test('should resolve tracing URL from store when pluginConfig has no observability', () => {
      mockController.distributedTracingPluginConfig = { extensions: [{}] };
      mockController.pluginConfig = {};
      mockStore.store.getState.mockReturnValue({
        tracingState: {
          info: {
            internalURL: 'https://tempo-sample-gateway.tempo.svc.cluster.local:8080/api/traces/v1/default'
          }
        }
      });
      expect(resolveConsoleUrl('/tracing?trace=abc123')).toEqual(
        '/observe/traces/abc123?namespace=tempo&name=sample&tenant=default'
      );
    });

    test('should return null and trigger navigation when tracing plugin is not configured but url param is present', () => {
      // The production code assigns window.location.href which jsdom cannot intercept;
      // we verify the return value and that the branch does not throw.
      const result = resolveConsoleUrl('/tracing?url=https%3A%2F%2Fjaeger.example.com');
      expect(result).toBeNull();
    });
  });

  describe('netobserv route', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mockController = require('../../components/KialiController') as Record<string, unknown>;

    afterEach(() => {
      mockController.netobservPluginConfig = undefined;
    });

    test('should use netflow target when netobserv plugin is configured', () => {
      mockController.netobservPluginConfig = { extensions: [{}] };
      expect(resolveConsoleUrl('/netobserv/namespaces/bookinfo/workloads/reviews-v1')).toEqual(
        '/k8s/ns/bookinfo/deployments/reviews-v1/netflow'
      );
    });

    test('should fall back to ossmconsole when netobserv plugin is not configured', () => {
      expect(resolveConsoleUrl('/netobserv/namespaces/bookinfo/workloads/reviews-v1')).toEqual(
        '/k8s/ns/bookinfo/deployments/reviews-v1/ossmconsole'
      );
    });

    test('should use ossmconsole suffix for service routes even when netobserv is configured', () => {
      mockController.netobservPluginConfig = { extensions: [{}] };
      expect(resolveConsoleUrl('/netobserv/namespaces/bookinfo/services/reviews')).toEqual(
        '/k8s/ns/bookinfo/services/reviews/ossmconsole'
      );
    });
  });

  describe('namespaces with istio detail', () => {
    test('should map namespace istio detail through refForKialiIstio', () => {
      expect(resolveConsoleUrl('/namespaces/bookinfo/istio/networking.istio.io/v1/VirtualService/reviews')).toEqual(
        '/k8s/ns/bookinfo/networking.istio.io~v1~VirtualService/reviews/ossmconsole'
      );
    });

    test('should map security istio detail through refForKialiIstio', () => {
      expect(
        resolveConsoleUrl('/namespaces/bookinfo/istio/security.istio.io/v1/AuthorizationPolicy/deny-all')
      ).toEqual('/k8s/ns/bookinfo/security.istio.io~v1~AuthorizationPolicy/deny-all/ossmconsole');
    });
  });

  test('should return null for unknown routes', () => {
    expect(resolveConsoleUrl('/unknown')).toBeNull();
  });
});

describe('parseTempoUrl', () => {
  it('url for multi tenant should be correct', () => {
    const url = 'https://tempo-sample-my-instance-gateway.tempo.svc.cluster.local:8080/api/traces/v1/default';
    const parsed = parseTempoUrl(url);
    expect(parsed?.tenant).toEqual('default');
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample-my-instance');
  });

  it('url for multi tenant not secure should be correct', () => {
    const url = 'http://tempo-sample.tempo.svc.cluster.local:8080/api/traces/v1/default';
    const parsed = parseTempoUrl(url);
    expect(parsed?.tenant).toEqual('default');
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample');
  });

  it('url for multi tenant url with no tenant should be correct', () => {
    const url = 'https://tempo-sample-my-instance.tempo.svc.cluster.local:8080/api/traces/v1/';
    const parsed = parseTempoUrl(url);
    expect(parsed?.tenant).toBeUndefined();
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample-my-instance');
  });

  it('url for single tenant and http should be correct', () => {
    const url = 'http://tempo-sample-query-frontend.tempo.svc:3200';
    const parsed = parseTempoUrl(url);
    expect(parsed?.tenant).toBeUndefined();
    expect(parsed?.instance).toEqual('sample');
    expect(parsed?.namespace).toEqual('tempo');
  });

  it('url for single tenant and https should be correct', () => {
    const url = 'https://tempo-sample-query-frontend.tempo.svc:3200';
    const parsed = parseTempoUrl(url);
    expect(parsed?.tenant).toBeUndefined();
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample');
  });
});
