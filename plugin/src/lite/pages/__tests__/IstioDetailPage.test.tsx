import { render, screen } from '@testing-library/react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useParams } from 'react-router-dom-v5-compat';
import IstioDetailPage from '../IstioDetailPage';
import { makeIstioResource } from '../../__fixtures__/testFactories';

afterEach(() => rstest.clearAllMocks());

describe('IstioDetailPage', () => {
  describe('invalid URL (missing params)', () => {
    it('shows Not Found when name param is absent', () => {
      rstest.mocked(useParams).mockReturnValue({});
      render(<IstioDetailPage />);
      expect(screen.getByText('Not Found')).toBeInTheDocument();
      expect(screen.getByText('Invalid URL. Expected /ossmconsole/istios/:name.')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows spinner while useK8sWatchResource is pending', () => {
      rstest.mocked(useParams).mockReturnValue({ name: 'default' });
      rstest.mocked(useK8sWatchResource).mockReturnValue([null, false, null]);
      render(<IstioDetailPage />);
      expect(screen.getByLabelText('Loading Istio control plane')).toBeInTheDocument();
    });
  });

  describe('error states', () => {
    it('shows OSSM Operator missing state when the Istio CRD is not registered', () => {
      rstest.mocked(useParams).mockReturnValue({ name: 'default' });
      rstest.mocked(useK8sWatchResource).mockReturnValue([null, true, new Error('Model does not exist')]);
      render(<IstioDetailPage />);
      expect(screen.getByText('OSSM Operator is not installed')).toBeInTheDocument();
    });

    it('shows not-found message when watch returns an unexpected error', () => {
      rstest.mocked(useParams).mockReturnValue({ name: 'default' });
      rstest.mocked(useK8sWatchResource).mockReturnValue([null, true, new Error('not found')]);
      render(<IstioDetailPage />);
      expect(screen.getByText('Istio control plane not found')).toBeInTheDocument();
      expect(screen.getByText('Istio "default" was not found on this cluster.')).toBeInTheDocument();
    });

    it('shows not-found message when resource is null after loading', () => {
      rstest.mocked(useParams).mockReturnValue({ name: 'default' });
      rstest.mocked(useK8sWatchResource).mockReturnValue([null, true, null]);
      render(<IstioDetailPage />);
      expect(screen.getByText('Istio control plane not found')).toBeInTheDocument();
    });
  });

  describe('loaded state', () => {
    beforeEach(() => {
      rstest.mocked(useParams).mockReturnValue({ name: 'default' });
    });

    it('renders the breadcrumb with a link back to the list page', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([makeIstioResource(), true, null]);
      render(<IstioDetailPage />);
      expect(screen.getByRole('link', { name: 'Istios' })).toHaveAttribute('href', '/ossmconsole/istios');
    });

    it('renders the resource name as heading', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([makeIstioResource(), true, null]);
      render(<IstioDetailPage />);
      expect(screen.getByRole('heading', { name: 'default' })).toBeInTheDocument();
    });

    it('renders the status label', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([makeIstioResource(), true, null]);
      render(<IstioDetailPage />);
      const readyElements = screen.getAllByText('Ready');
      expect(readyElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders the version', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([makeIstioResource(), true, null]);
      render(<IstioDetailPage />);
      expect(screen.getByText('v1.30.2')).toBeInTheDocument();
    });

    it('renders the control plane namespace', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([makeIstioResource(), true, null]);
      render(<IstioDetailPage />);
      expect(screen.getByText('istio-system')).toBeInTheDocument();
    });

    it('renders the profile', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([makeIstioResource(), true, null]);
      render(<IstioDetailPage />);
      expect(screen.getByText('openshift')).toBeInTheDocument();
    });

    it('renders the update strategy', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([makeIstioResource(), true, null]);
      render(<IstioDetailPage />);
      expect(screen.getByText('InPlace')).toBeInTheDocument();
    });

    it('renders the conditions card when conditions are present', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([makeIstioResource(), true, null]);
      render(<IstioDetailPage />);
      expect(screen.getByText('Conditions')).toBeInTheDocument();
    });

    it('omits the conditions card when no conditions exist', () => {
      rstest
        .mocked(useK8sWatchResource)
        .mockReturnValue([makeIstioResource({ status: { conditions: [] } }), true, null]);
      render(<IstioDetailPage />);
      expect(screen.queryByText('Conditions')).not.toBeInTheDocument();
    });

    it('renders "Not specified" for missing optional fields', () => {
      rstest
        .mocked(useK8sWatchResource)
        .mockReturnValue([makeIstioResource({ spec: { namespace: 'istio-system' }, status: undefined }), true, null]);
      render(<IstioDetailPage />);
      const notSpecified = screen.getAllByText('Not specified');
      expect(notSpecified.length).toBeGreaterThanOrEqual(3);
    });

    it('renders mesh ID when present', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([
        makeIstioResource({
          spec: {
            namespace: 'istio-system',
            version: 'v1.30.2',
            values: { global: { meshID: 'my-mesh', network: 'net1' } }
          }
        }),
        true,
        null
      ]);
      render(<IstioDetailPage />);
      expect(screen.getByText('my-mesh')).toBeInTheDocument();
      expect(screen.getByText('net1')).toBeInTheDocument();
    });
  });
});
