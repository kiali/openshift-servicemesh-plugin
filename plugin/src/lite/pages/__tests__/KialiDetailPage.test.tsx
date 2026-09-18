import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  k8sGet,
  k8sPatch,
  useAccessReview,
  useK8sWatchResource,
  consoleFetch
} from '@openshift-console/dynamic-plugin-sdk';
import { useParams } from 'react-router-dom-v5-compat';
import KialiDetailPage from '../KialiDetailPage';
import { makeKialiFailureResource, makeKialiResource, makeOssmConsoleResource } from '../../__fixtures__/testFactories';
import type { LiteOssmConsoleResource } from '../../types/ossmconsole';

afterEach(() => rstest.clearAllMocks());

type WatchResult<T> = [T, boolean, unknown];

// Mirrors the codebase's existing convention for mocking multiple useK8sWatchResource calls in
// the same component, dispatching on groupVersionKind.kind since call order is not guaranteed.
function mockWatchResources(
  kiali: WatchResult<unknown>,
  ossmConsole: WatchResult<LiteOssmConsoleResource[] | null> = [[makeOssmConsoleResource()], true, null]
): void {
  rstest.mocked(useK8sWatchResource).mockImplementation((params: { groupVersionKind?: { kind?: string } } | null) => {
    if (params?.groupVersionKind?.kind === 'OSSMConsole') return ossmConsole;
    return kiali;
  });
}

const promotedOssmConsole = (): LiteOssmConsoleResource =>
  makeOssmConsoleResource({
    status: { kiali: { available: true, serviceName: 'kiali', serviceNamespace: 'istio-system' } }
  });

describe('KialiDetailPage', () => {
  beforeEach(() => {
    rstest.mocked(useAccessReview).mockReturnValue([true, false]);
  });

  describe('invalid URL (missing params)', () => {
    it('shows Not Found when name param is absent', () => {
      rstest.mocked(useParams).mockReturnValue({});
      render(<KialiDetailPage />);
      expect(screen.getByText('Not Found')).toBeInTheDocument();
    });

    it('shows Not Found when namespace param is absent', () => {
      rstest.mocked(useParams).mockReturnValue({ name: 'kiali' });
      render(<KialiDetailPage />);
      expect(screen.getByText('Not Found')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows spinner while useK8sWatchResource is pending', () => {
      rstest.mocked(useParams).mockReturnValue({ name: 'kiali', namespace: 'istio-system' });
      mockWatchResources([null, false, null]);
      render(<KialiDetailPage />);
      expect(screen.getByLabelText('Loading Kiali instance')).toBeInTheDocument();
    });
  });

  describe('error states', () => {
    it('shows not-found message when watch returns an error', () => {
      rstest.mocked(useParams).mockReturnValue({ name: 'kiali', namespace: 'istio-system' });
      mockWatchResources([null, true, new Error('not found')]);
      render(<KialiDetailPage />);
      expect(screen.getByText('Kiali instance not found')).toBeInTheDocument();
    });

    it('shows not-found message when resource is null after loading', () => {
      rstest.mocked(useParams).mockReturnValue({ name: 'kiali', namespace: 'istio-system' });
      mockWatchResources([null, true, null]);
      render(<KialiDetailPage />);
      expect(screen.getByText('Kiali instance not found')).toBeInTheDocument();
    });
  });

  describe('loaded state', () => {
    const originalApiProxy = process.env.API_PROXY;

    beforeEach(() => {
      rstest.mocked(useParams).mockReturnValue({ name: 'kiali', namespace: 'istio-system' });
      process.env.API_PROXY = '/api/proxy/plugin/ossmconsole/kiali';
      rstest.mocked(k8sGet).mockRejectedValue(new Error('not mocked'));
    });

    afterEach(() => {
      process.env.API_PROXY = originalApiProxy;
    });

    it('renders the breadcrumb with link to the list page', () => {
      mockWatchResources([makeKialiResource(), true, null]);
      render(<KialiDetailPage />);
      expect(screen.getByRole('link', { name: 'Kialis' })).toHaveAttribute('href', '/ossmconsole/kialis');
    });

    it('renders the resource name as heading', () => {
      mockWatchResources([makeKialiResource(), true, null]);
      render(<KialiDetailPage />);
      expect(screen.getByRole('heading', { name: 'kiali' })).toBeInTheDocument();
    });

    it('renders running version from /api and spec version separately', async () => {
      rstest.mocked(consoleFetch).mockResolvedValue({
        json: async () => ({ status: { 'Kiali version': 'v2.31.0-SNAPSHOT' } }),
        ok: true
      } as Response);
      mockWatchResources(
        [makeKialiResource({ spec: { server: { web_fqdn: 'kiali.custom.com' }, version: 'default' } }), true, null],
        [[promotedOssmConsole()], true, null]
      );
      render(<KialiDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('v2.31.0-SNAPSHOT')).toBeInTheDocument();
        expect(screen.getByText('Spec Version')).toBeInTheDocument();
        expect(screen.getByText('default')).toBeInTheDocument();
      });
    });

    it('renders the server namespace', () => {
      mockWatchResources([makeKialiResource(), true, null]);
      render(<KialiDetailPage />);
      expect(screen.getByText('istio-system')).toBeInTheDocument();
    });

    it('renders the auth strategy', () => {
      mockWatchResources([makeKialiResource(), true, null]);
      render(<KialiDetailPage />);
      expect(screen.getByText('openshift')).toBeInTheDocument();
    });

    it('renders the instance name', () => {
      mockWatchResources([makeKialiResource(), true, null]);
      render(<KialiDetailPage />);
      expect(screen.getByText('Instance Name')).toBeInTheDocument();
    });

    it('does not render the Reconcile Progress card even when progress.message is set', () => {
      mockWatchResources([makeKialiFailureResource(), true, null]);
      render(<KialiDetailPage />);
      expect(screen.queryByText('Reconcile Progress')).not.toBeInTheDocument();
      expect(screen.queryByText('Reconciling deployment')).not.toBeInTheDocument();
    });

    it('renders remote cluster secrets in a separate card above conditions', async () => {
      rstest.mocked(k8sGet).mockImplementation(({ model, name }: { model: { kind?: string }; name?: string }) => {
        if (model.kind === 'Deployment' && name === 'kiali') {
          return Promise.resolve({
            spec: {
              template: {
                spec: {
                  volumes: [
                    { name: 'east-secret', secret: { secretName: 'east-secret' } },
                    {
                      name: 'kiali-multi-cluster-secret',
                      secret: { optional: true, secretName: 'kiali-multi-cluster-secret' }
                    }
                  ],
                  containers: [
                    {
                      name: 'kiali',
                      volumeMounts: [
                        { name: 'east-secret', mountPath: '/kiali-remote-cluster-secrets/east-secret' },
                        {
                          name: 'kiali-multi-cluster-secret',
                          mountPath: '/kiali-remote-cluster-secrets/kiali-multi-cluster-secret'
                        }
                      ]
                    }
                  ]
                }
              }
            }
          });
        }
        return Promise.reject(new Error('404'));
      });
      mockWatchResources([
        makeKialiResource({
          spec: {
            clustering: { clusters: [{ name: 'east', secret_name: 'east-secret' }] },
            deployment: { instance_name: 'kiali', namespace: 'istio-system' }
          }
        }),
        true,
        null
      ]);
      render(<KialiDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Related')).toBeInTheDocument();
        expect(screen.getByText('Remote Cluster Secrets (1)')).toBeInTheDocument();
        expect(screen.getByText('east-secret')).toBeInTheDocument();
      });
      expect(screen.queryByText('kiali-multi-cluster-secret')).not.toBeInTheDocument();
      expect(screen.queryAllByText('Remote Cluster Secret')).toHaveLength(0);
    });

    it('renders "Not specified" for missing optional fields', () => {
      mockWatchResources([makeKialiResource({ spec: {} }), true, null]);
      render(<KialiDetailPage />);
      const notSpecified = screen.getAllByText('Not specified');
      expect(notSpecified.length).toBeGreaterThanOrEqual(5);
    });

    it('renders conditions card when conditions are present', () => {
      mockWatchResources([makeKialiResource(), true, null]);
      render(<KialiDetailPage />);
      expect(screen.getByText('Conditions')).toBeInTheDocument();
    });

    it('omits conditions card when there are no conditions', () => {
      mockWatchResources([makeKialiResource({ status: {} }), true, null]);
      render(<KialiDetailPage />);
      expect(screen.queryByText('Conditions')).not.toBeInTheDocument();
    });

    it('shows Disconnect button when this is the promoted Kiali', async () => {
      mockWatchResources([makeKialiResource(), true, null], [[promotedOssmConsole()], true, null]);
      render(<KialiDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Disconnect')).toBeInTheDocument();
      });
    });

    it('shows Connect button when not promoted', async () => {
      mockWatchResources([makeKialiResource(), true, null]);
      render(<KialiDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Connect')).toBeInTheDocument();
      });
    });

    it('keeps showing "Connecting…" after the PATCH resolves, until the watch confirms the promotion', async () => {
      mockWatchResources([makeKialiResource(), true, null]);
      rstest.mocked(k8sPatch).mockResolvedValue({});
      render(<KialiDetailPage />);
      await waitFor(() => screen.getByText('Connect'));
      fireEvent.click(screen.getByText('Connect'));
      // The PATCH call itself resolves immediately, but the button must stay in its pending state
      // until the OSSMConsole watch reflects the change - the operator reconciles asynchronously.
      await waitFor(() => {
        expect(screen.getByText('Connecting…')).toBeInTheDocument();
      });
      expect(screen.queryByText(/is now connected to Console/i)).not.toBeInTheDocument();
      expect(k8sPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ path: '/spec/kiali' })]
        })
      );
    });

    it('shows a success alert and switches to Disconnect once the watch confirms the promotion', async () => {
      mockWatchResources([makeKialiResource(), true, null]);
      rstest.mocked(k8sPatch).mockResolvedValue({});
      const { rerender } = render(<KialiDetailPage />);
      await waitFor(() => screen.getByText('Connect'));
      fireEvent.click(screen.getByText('Connect'));
      await waitFor(() => screen.getByText('Connecting…'));

      // Simulate the kiali-operator having reconciled the OSSMConsole CR.
      mockWatchResources([makeKialiResource(), true, null], [[promotedOssmConsole()], true, null]);
      rerender(<KialiDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/is now connected to Console/i)).toBeInTheDocument();
        expect(screen.getByText('Disconnect')).toBeInTheDocument();
      });
    });

    it('shows error alert immediately when promote fails', async () => {
      mockWatchResources([makeKialiResource(), true, null]);
      rstest.mocked(k8sPatch).mockRejectedValue(new Error('PATCH failed'));
      render(<KialiDetailPage />);
      await waitFor(() => screen.getByText('Connect'));
      fireEvent.click(screen.getByText('Connect'));
      await waitFor(() => {
        expect(screen.getByText(/Failed to connect/i)).toBeInTheDocument();
      });
    });

    it('keeps showing "Disconnecting…" after the PATCH resolves, until the watch confirms the demotion', async () => {
      mockWatchResources([makeKialiResource(), true, null], [[promotedOssmConsole()], true, null]);
      rstest.mocked(k8sPatch).mockResolvedValue({});
      render(<KialiDetailPage />);
      await waitFor(() => screen.getByText('Disconnect'));
      fireEvent.click(screen.getByText('Disconnect'));
      await waitFor(() => {
        expect(screen.getByText('Disconnecting…')).toBeInTheDocument();
      });
      expect(screen.queryByText(/disconnected from Console/i)).not.toBeInTheDocument();
    });

    it('shows a success alert and switches to Connect once the watch confirms the demotion', async () => {
      mockWatchResources([makeKialiResource(), true, null], [[promotedOssmConsole()], true, null]);
      rstest.mocked(k8sPatch).mockResolvedValue({});
      const { rerender } = render(<KialiDetailPage />);
      await waitFor(() => screen.getByText('Disconnect'));
      fireEvent.click(screen.getByText('Disconnect'));
      await waitFor(() => screen.getByText('Disconnecting…'));

      // Simulate the kiali-operator having reconciled the OSSMConsole CR to operate without Kiali integration.
      mockWatchResources([makeKialiResource(), true, null], [[makeOssmConsoleResource()], true, null]);
      rerender(<KialiDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/disconnected from Console/i)).toBeInTheDocument();
        expect(screen.getByText('Connect')).toBeInTheDocument();
      });
    });

    it('shows error alert immediately when demote fails', async () => {
      mockWatchResources([makeKialiResource(), true, null], [[promotedOssmConsole()], true, null]);
      rstest.mocked(k8sPatch).mockRejectedValue(new Error('PATCH failed'));
      render(<KialiDetailPage />);
      await waitFor(() => screen.getByText('Disconnect'));
      fireEvent.click(screen.getByText('Disconnect'));
      await waitFor(() => {
        expect(screen.getByText(/Failed to disconnect/i)).toBeInTheDocument();
      });
    });

    it('disables the action and shows a tooltip when no OSSMConsole resource is found', async () => {
      mockWatchResources([makeKialiResource(), true, null], [[], true, null]);
      render(<KialiDetailPage />);
      const button = await screen.findByText('Connect');
      expect(button.closest('button')).toHaveAttribute('aria-disabled', 'true');
      await userEvent.hover(button);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('No OSSMConsole resource was found');
    });

    it('disables the action and shows a tooltip when the user cannot patch', async () => {
      rstest.mocked(useAccessReview).mockReturnValue([false, false]);
      mockWatchResources([makeKialiResource(), true, null], [[promotedOssmConsole()], true, null]);
      render(<KialiDetailPage />);
      const button = await screen.findByText('Disconnect');
      expect(button.closest('button')).toHaveAttribute('aria-disabled', 'true');
      await userEvent.hover(button);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('do not have permission');
    });

    it('disables the action when the OSSMConsole watch has a loadError', async () => {
      mockWatchResources([makeKialiResource(), true, null], [null, true, new Error('forbidden')]);
      render(<KialiDetailPage />);
      const button = await screen.findByText('Connect');
      expect(button.closest('button')).toHaveAttribute('aria-disabled', 'true');
      await userEvent.hover(button);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Unable to determine Console integration status');
    });
  });
});
