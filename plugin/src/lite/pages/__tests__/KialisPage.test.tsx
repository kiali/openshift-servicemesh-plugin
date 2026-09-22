import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { k8sGet, k8sPatch, useAccessReview, useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import KialisPage, { getKialiServiceTarget } from '../KialisPage';
import { __resetKialiRouteHostCache } from '../../hooks/useKialiRouteHosts';
import { makeKialiResource, makeOssmConsoleResource } from '../../__fixtures__/testFactories';
import type { LiteOssmConsoleResource } from '../../types/ossmconsole';

afterEach(() => {
  rstest.clearAllMocks();
  __resetKialiRouteHostCache();
});

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

describe('getKialiServiceTarget', () => {
  it('uses deployment.namespace and instance_name when set', () => {
    expect(
      getKialiServiceTarget(
        makeKialiResource({
          metadata: { name: 'kiali', namespace: 'kiali-operator' },
          spec: { deployment: { instance_name: 'kiali', namespace: 'secure-ns' } }
        })
      )
    ).toEqual({ name: 'kiali', namespace: 'secure-ns' });
  });

  it('falls back to the CR namespace when deployment.namespace is unset', () => {
    expect(getKialiServiceTarget(makeKialiResource({ spec: {} }))).toEqual({
      name: 'kiali',
      namespace: 'istio-system'
    });
  });

  it('returns an empty namespace when deployment.namespace and CR namespace are unset', () => {
    expect(getKialiServiceTarget(makeKialiResource({ metadata: { name: 'kiali' }, spec: {} }))).toEqual({
      name: 'kiali',
      namespace: ''
    });
  });
});

describe('KialisPage', () => {
  beforeEach(() => {
    rstest.mocked(useAccessReview).mockReturnValue([true, false]);
  });

  it('renders the page title', async () => {
    mockWatchResources([[], true, null]);
    render(<KialisPage />);
    await waitFor(() => {
      expect(screen.getByText('Kialis')).toBeInTheDocument();
    });
  });

  it('shows loading state while resources are fetching', () => {
    mockWatchResources([[], false, null]);
    render(<KialisPage />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows CRD-missing state when the Kiali Operator is not installed', async () => {
    mockWatchResources([null, true, new Error('CRD not found')]);
    render(<KialisPage />);
    await waitFor(() => {
      expect(screen.getByText('Kiali Operator is not installed')).toBeInTheDocument();
    });
  });

  it('links to OperatorHub from the CRD-missing state', async () => {
    mockWatchResources([null, true, new Error('CRD not found')]);
    render(<KialisPage />);
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'OperatorHub' })).toHaveAttribute(
        'href',
        '/catalog/ns/openshift-operators?keyword=kiali'
      );
    });
  });

  it('shows empty state when the CRD exists but no Kiali instances are present', async () => {
    mockWatchResources([[], true, null]);
    render(<KialisPage />);
    await waitFor(() => {
      expect(screen.getByText('No Kiali instances found')).toBeInTheDocument();
    });
  });

  it('renders a table row for each Kiali resource', async () => {
    mockWatchResources([[makeKialiResource()], true, null]);
    render(<KialisPage />);
    await waitFor(() => {
      expect(screen.getByText('kiali')).toBeInTheDocument();
    });
  });

  it('renders the version column', async () => {
    mockWatchResources([[makeKialiResource()], true, null]);
    render(<KialisPage />);
    await waitFor(() => {
      expect(screen.getByText('default')).toBeInTheDocument();
    });
  });

  it('renders the server namespace column', async () => {
    mockWatchResources([
      [
        makeKialiResource({
          spec: {
            auth: { strategy: 'openshift' },
            deployment: { instance_name: 'kiali', namespace: 'secure-ns' }
          }
        })
      ],
      true,
      null
    ]);
    render(<KialisPage />);
    await waitFor(() => {
      expect(screen.getByText('secure-ns')).toBeInTheDocument();
    });
  });

  it('renders dashes for missing optional fields', async () => {
    mockWatchResources([[makeKialiResource({ spec: {} })], true, null]);
    render(<KialisPage />);
    await waitFor(() => {
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('links the name to the detail page', async () => {
    mockWatchResources([[makeKialiResource()], true, null]);
    render(<KialisPage />);
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'kiali' })).toHaveAttribute(
        'href',
        '/ossmconsole/kialis/istio-system/kiali'
      );
    });
  });

  it('shows a connected icon in the Connected column for the connected Kiali instance', async () => {
    mockWatchResources([[makeKialiResource()], true, null], [[promotedOssmConsole()], true, null]);
    render(<KialisPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Connected to Console')).toBeInTheDocument();
    });
  });

  it('shows a dash in the Connected column for non-connected Kiali instances', async () => {
    mockWatchResources([[makeKialiResource()], true, null]);
    render(<KialisPage />);
    await waitFor(() => {
      expect(screen.queryByLabelText('Connected to Console')).not.toBeInTheDocument();
    });
  });

  it('shows Connect button for non-promoted Kialis', async () => {
    mockWatchResources([[makeKialiResource()], true, null]);
    render(<KialisPage />);
    await waitFor(() => {
      expect(screen.getByText('Connect')).toBeInTheDocument();
    });
  });

  it('shows Disconnect button for the currently promoted Kiali', async () => {
    mockWatchResources([[makeKialiResource()], true, null], [[promotedOssmConsole()], true, null]);
    render(<KialisPage />);
    await waitFor(() => {
      expect(screen.getByText('Disconnect')).toBeInTheDocument();
    });
  });

  it('keeps showing "Connecting…" after the PATCH resolves, until the watch confirms the promotion', async () => {
    mockWatchResources([[makeKialiResource()], true, null]);
    rstest.mocked(k8sPatch).mockResolvedValue({});
    render(<KialisPage />);
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
    mockWatchResources([[makeKialiResource()], true, null]);
    rstest.mocked(k8sPatch).mockResolvedValue({});
    const { rerender } = render(<KialisPage />);
    await waitFor(() => screen.getByText('Connect'));
    fireEvent.click(screen.getByText('Connect'));
    await waitFor(() => screen.getByText('Connecting…'));

    // Simulate the kiali-operator having reconciled the OSSMConsole CR.
    mockWatchResources([[makeKialiResource()], true, null], [[promotedOssmConsole()], true, null]);
    rerender(<KialisPage />);

    await waitFor(() => {
      expect(screen.getByText(/is now connected to Console/i)).toBeInTheDocument();
      expect(screen.getByText('Disconnect')).toBeInTheDocument();
    });
  });

  it('shows an error alert immediately when the promote PATCH fails', async () => {
    mockWatchResources([[makeKialiResource()], true, null]);
    rstest.mocked(k8sPatch).mockRejectedValue(new Error('PATCH failed'));
    render(<KialisPage />);
    await waitFor(() => screen.getByText('Connect'));
    fireEvent.click(screen.getByText('Connect'));
    await waitFor(() => {
      expect(screen.getByText(/Failed to connect/i)).toBeInTheDocument();
    });
  });

  it('keeps showing "Disconnecting…" after the PATCH resolves, until the watch confirms the demotion', async () => {
    mockWatchResources([[makeKialiResource()], true, null], [[promotedOssmConsole()], true, null]);
    rstest.mocked(k8sPatch).mockResolvedValue({});
    render(<KialisPage />);
    await waitFor(() => screen.getByText('Disconnect'));
    fireEvent.click(screen.getByText('Disconnect'));
    await waitFor(() => {
      expect(screen.getByText('Disconnecting…')).toBeInTheDocument();
    });
    expect(screen.queryByText(/disconnected from Console/i)).not.toBeInTheDocument();
  });

  it('shows a success alert and switches to Connect once the watch confirms the demotion', async () => {
    mockWatchResources([[makeKialiResource()], true, null], [[promotedOssmConsole()], true, null]);
    rstest.mocked(k8sPatch).mockResolvedValue({});
    const { rerender } = render(<KialisPage />);
    await waitFor(() => screen.getByText('Disconnect'));
    fireEvent.click(screen.getByText('Disconnect'));
    await waitFor(() => screen.getByText('Disconnecting…'));

    // Simulate the kiali-operator having reconciled the OSSMConsole CR to operate without Kiali integration.
    mockWatchResources([[makeKialiResource()], true, null], [[makeOssmConsoleResource()], true, null]);
    rerender(<KialisPage />);

    await waitFor(() => {
      expect(screen.getByText(/disconnected from Console/i)).toBeInTheDocument();
      expect(screen.getByText('Connect')).toBeInTheDocument();
    });
  });

  it('shows an error alert immediately when the demote PATCH fails', async () => {
    mockWatchResources([[makeKialiResource()], true, null], [[promotedOssmConsole()], true, null]);
    rstest.mocked(k8sPatch).mockRejectedValue(new Error('PATCH failed'));
    render(<KialisPage />);
    await waitFor(() => screen.getByText('Disconnect'));
    fireEvent.click(screen.getByText('Disconnect'));
    await waitFor(() => {
      expect(screen.getByText(/Failed to disconnect/i)).toBeInTheDocument();
    });
  });

  it('dismisses the alert when the close button is clicked', async () => {
    mockWatchResources([[makeKialiResource()], true, null]);
    rstest.mocked(k8sPatch).mockRejectedValue(new Error('PATCH failed'));
    render(<KialisPage />);
    await waitFor(() => screen.getByText('Connect'));
    fireEvent.click(screen.getByText('Connect'));
    await waitFor(() => screen.getByText(/Failed to connect/i));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText(/Failed to connect/i)).not.toBeInTheDocument();
  });

  it('disables the action and shows a tooltip when no OSSMConsole resource is found', async () => {
    mockWatchResources([[makeKialiResource()], true, null], [[], true, null]);
    render(<KialisPage />);
    const button = await screen.findByText('Connect');
    expect(button.closest('button')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('No OSSMConsole resource was found');
  });

  it('disables the action and shows a tooltip when the user cannot patch the OSSMConsole resource', async () => {
    rstest.mocked(useAccessReview).mockReturnValue([false, false]);
    mockWatchResources([[makeKialiResource()], true, null], [[promotedOssmConsole()], true, null]);
    render(<KialisPage />);
    const button = await screen.findByText('Disconnect');
    expect(button.closest('button')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('do not have permission');
  });

  it('disables the action when the OSSMConsole watch has a loadError', async () => {
    mockWatchResources([[makeKialiResource()], true, null], [null, true, new Error('forbidden')]);
    render(<KialisPage />);
    const button = await screen.findByText('Connect');
    expect(button.closest('button')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Unable to determine Console integration status');
  });

  it('disables Connect when the Kiali service namespace is not configured', async () => {
    mockWatchResources([[makeKialiResource({ metadata: { name: 'kiali' }, spec: {} })], true, null]);
    render(<KialisPage />);
    const button = await screen.findByText('Connect');
    expect(button.closest('button')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Cannot connect: Kiali service name or namespace is not configured.'
    );
  });

  describe('Kiali UI link column', () => {
    it('shows the Kiali external link when a URL is available for the active instance', async () => {
      rstest.mocked(k8sGet).mockResolvedValue({
        apiVersion: 'route.openshift.io/v1',
        kind: 'Route',
        metadata: { name: 'kiali', namespace: 'istio-system' },
        spec: { host: 'kiali.apps.example.com' }
      });
      mockWatchResources([[makeKialiResource()], true, null], [[promotedOssmConsole()], true, null]);
      render(<KialisPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Kiali' })).toHaveAttribute('href', 'https://kiali.apps.example.com');
      });
      expect(screen.queryByRole('link', { name: 'Console' })).not.toBeInTheDocument();
    });

    it('shows a dash in Observe when the active instance has no standalone URL', async () => {
      rstest.mocked(k8sGet).mockRejectedValue(new Error('404 Not Found'));
      mockWatchResources([[makeKialiResource()], true, null], [[promotedOssmConsole()], true, null]);
      render(<KialisPage />);
      await waitFor(() => screen.getByText('kiali'));
      expect(screen.queryByRole('link', { name: 'Kiali' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Console' })).not.toBeInTheDocument();
    });

    it('links directly to the standalone Kiali UI using web_fqdn when not promoted', async () => {
      mockWatchResources(
        [[makeKialiResource({ spec: { server: { web_fqdn: 'kiali.custom.com' } } })], true, null],
        [[makeOssmConsoleResource()], true, null]
      );
      render(<KialisPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Kiali' })).toHaveAttribute('href', 'https://kiali.custom.com');
      });
    });

    it('links directly to the standalone Kiali UI using a discovered Route host when not promoted', async () => {
      rstest.mocked(k8sGet).mockResolvedValue({
        apiVersion: 'route.openshift.io/v1',
        kind: 'Route',
        metadata: { name: 'kiali', namespace: 'istio-system' },
        spec: { host: 'kiali.apps.example.com' }
      });
      mockWatchResources([[makeKialiResource()], true, null], [[makeOssmConsoleResource()], true, null]);
      render(<KialisPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Kiali' })).toHaveAttribute('href', 'https://kiali.apps.example.com');
      });
    });

    it('does not render a Kiali external link for a malicious web_fqdn', async () => {
      mockWatchResources(
        [[makeKialiResource({ spec: { server: { web_fqdn: '//evil.com' } } })], true, null],
        [[makeOssmConsoleResource()], true, null]
      );
      render(<KialisPage />);
      await waitFor(() => {
        expect(screen.queryByRole('link', { name: 'Kiali' })).not.toBeInTheDocument();
      });
    });

    it('does not render a Kiali external link for a malicious Route host', async () => {
      rstest.mocked(k8sGet).mockResolvedValue({
        apiVersion: 'route.openshift.io/v1',
        kind: 'Route',
        metadata: { name: 'kiali', namespace: 'istio-system' },
        spec: { host: 'evil.com/path' }
      });
      mockWatchResources([[makeKialiResource()], true, null], [[makeOssmConsoleResource()], true, null]);
      render(<KialisPage />);
      await waitFor(() => {
        expect(screen.queryByRole('link', { name: 'Kiali' })).not.toBeInTheDocument();
      });
    });

    it('shows a dash when not promoted and no Kiali URL can be determined', async () => {
      rstest.mocked(k8sGet).mockRejectedValue(new Error('404 Not Found'));
      mockWatchResources([[makeKialiResource()], true, null], [[makeOssmConsoleResource()], true, null]);
      render(<KialisPage />);
      await waitFor(() => screen.getByText('kiali'));
      expect(screen.queryByRole('link', { name: 'Kiali' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Console' })).not.toBeInTheDocument();
    });
  });
});
