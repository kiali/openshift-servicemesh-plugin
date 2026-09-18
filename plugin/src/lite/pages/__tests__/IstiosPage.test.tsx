import { render, screen } from '@testing-library/react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { OSSM_OPERATORHUB_HREF } from '../../components/OssmOperatorMissingEmptyState';
import IstiosPage from '../IstiosPage';
import { makeIstioResource } from '../../__fixtures__/testFactories';

afterEach(() => rstest.clearAllMocks());

type WatchResult<T> = [T, boolean, unknown];

function mockIstioWatch(istio: WatchResult<unknown>, kiali: WatchResult<unknown> = [[], true, null]): void {
  rstest.mocked(useK8sWatchResource).mockImplementation((params: { groupVersionKind?: { kind?: string } } | null) => {
    if (params?.groupVersionKind?.kind === 'Kiali') return kiali;
    return istio;
  });
}

describe('IstiosPage', () => {
  it('renders the page title', () => {
    mockIstioWatch([[], true, null]);
    render(<IstiosPage />);
    expect(screen.getByText('Istios')).toBeInTheDocument();
  });

  it('shows loading state while resources are fetching', () => {
    mockIstioWatch([[], false, null]);
    render(<IstiosPage />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows empty state when no Istio resources exist', () => {
    mockIstioWatch([[], true, null]);
    render(<IstiosPage />);
    expect(screen.getByText('No Istio control planes found')).toBeInTheDocument();
  });

  it('shows OSSM Operator missing state when the Istio CRD is not registered', () => {
    mockIstioWatch([null, true, new Error('Model does not exist')]);
    render(<IstiosPage />);
    expect(screen.getByText('OSSM Operator is not installed')).toBeInTheDocument();
    expect(screen.queryByTestId('load-error')).not.toBeInTheDocument();
  });

  it('links to OperatorHub from the OSSM Operator missing state', () => {
    mockIstioWatch([null, true, new Error('Model does not exist')]);
    render(<IstiosPage />);
    expect(screen.getByRole('link', { name: 'OperatorHub' })).toHaveAttribute('href', OSSM_OPERATORHUB_HREF);
  });

  it('shows load error for unexpected watch failures', () => {
    mockIstioWatch([null, true, new Error('watch failed')]);
    render(<IstiosPage />);
    expect(screen.getByTestId('load-error')).toBeInTheDocument();
    expect(screen.queryByText('OSSM Operator is not installed')).not.toBeInTheDocument();
  });

  it('renders a table row for each Istio resource', () => {
    const resources = [
      makeIstioResource({ metadata: { name: 'default', creationTimestamp: '2026-01-01T00:00:00Z' } }),
      makeIstioResource({ metadata: { name: 'secondary', creationTimestamp: '2026-01-02T00:00:00Z' } })
    ];
    mockIstioWatch([resources, true, null]);
    render(<IstiosPage />);
    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.getByText('secondary')).toBeInTheDocument();
  });

  it('renders the control plane namespace from spec.namespace', () => {
    const resources = [makeIstioResource()];
    mockIstioWatch([resources, true, null]);
    render(<IstiosPage />);
    expect(screen.getByText('istio-system')).toBeInTheDocument();
  });

  it('renders the version column', () => {
    const resources = [makeIstioResource()];
    mockIstioWatch([resources, true, null]);
    render(<IstiosPage />);
    expect(screen.getByText('v1.30.2')).toBeInTheDocument();
  });

  it('renders the profile column', () => {
    const resources = [makeIstioResource()];
    mockIstioWatch([resources, true, null]);
    render(<IstiosPage />);
    expect(screen.getByText('openshift')).toBeInTheDocument();
  });

  it('renders the update strategy column', () => {
    const resources = [makeIstioResource()];
    mockIstioWatch([resources, true, null]);
    render(<IstiosPage />);
    expect(screen.getByText('InPlace')).toBeInTheDocument();
  });

  it('renders the status column with Ready label', () => {
    const resources = [makeIstioResource()];
    mockIstioWatch([resources, true, null]);
    render(<IstiosPage />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('renders dashes for missing optional fields', () => {
    const resources = [
      makeIstioResource({
        spec: { namespace: 'istio-system' },
        status: undefined
      })
    ];
    mockIstioWatch([resources, true, null]);
    render(<IstiosPage />);
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('links the name to the detail page', () => {
    const resources = [makeIstioResource()];
    mockIstioWatch([resources, true, null]);
    render(<IstiosPage />);
    expect(screen.getByRole('link', { name: 'default' })).toHaveAttribute('href', '/ossmconsole/istios/default');
  });
});
