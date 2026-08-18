import { render, screen } from '@testing-library/react';
import { KialiExternalLink, OssmcConsoleLink, renderObservabilityLink } from '../ObservabilityLinks';
import type { KialiLink } from '../../types/kiali';

describe('KialiExternalLink', () => {
  it('opens Kiali in a new tab', () => {
    render(<KialiExternalLink href="https://kiali.example.com">Open</KialiExternalLink>);
    const link = screen.getByRole('link', { name: /Open/ });
    expect(link).toHaveAttribute('href', 'https://kiali.example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('OssmcConsoleLink', () => {
  it('opens hub-cluster OSSMC URLs in a new tab', () => {
    render(<OssmcConsoleLink url="/ossmconsole/kialis/istio-system/kiali">OSSMC</OssmcConsoleLink>);

    const link = screen.getByRole('link', { name: /OSSMC/ });
    expect(link).toHaveAttribute('href', '/ossmconsole/kialis/istio-system/kiali');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders external spoke-cluster OSSMC URLs as new-tab links', () => {
    render(<OssmcConsoleLink url="https://console.spoke.example.com/ossmconsole/overview">OSSMC</OssmcConsoleLink>);

    const link = screen.getByRole('link', { name: /OSSMC/ });
    expect(link).toHaveAttribute('href', 'https://console.spoke.example.com/ossmconsole/overview');
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('renderObservabilityLink', () => {
  const t = (key: string): string => key;

  it('prefers standalone Kiali URL when present', () => {
    const link: KialiLink = {
      cluster: 'cluster-a',
      controlPlaneNamespace: 'istio-system',
      ossmcUrl: '/ossmconsole/kialis/istio-system/kiali',
      standaloneUrl: 'https://kiali.example.com'
    };

    render(<>{renderObservabilityLink(link, t, { kiali: 'Open', ossmc: 'OSSMC' })}</>);

    expect(screen.getByRole('link', { name: /Open/ })).toHaveAttribute('href', 'https://kiali.example.com');
    expect(screen.queryByRole('link', { name: /OSSMC/ })).not.toBeInTheDocument();
  });

  it('renders OSSMC link when standalone URL is absent', () => {
    const kialiLink: KialiLink = {
      cluster: 'cluster-a',
      controlPlaneNamespace: 'istio-system',
      ossmcUrl: '/ossmconsole/kialis/istio-system/kiali'
    };

    render(<>{renderObservabilityLink(kialiLink, t, { kiali: 'Open', ossmc: 'OSSMC' })}</>);

    const ossmcAnchor = screen.getByRole('link', { name: /OSSMC/ });
    expect(ossmcAnchor).toHaveAttribute('href', '/ossmconsole/kialis/istio-system/kiali');
    expect(ossmcAnchor).toHaveAttribute('target', '_blank');
  });

  it('returns dash when no observability URL is available', () => {
    const link: KialiLink = {
      cluster: 'cluster-a',
      controlPlaneNamespace: 'istio-system'
    };

    render(<>{renderObservabilityLink(link, t, { kiali: 'Open', ossmc: 'OSSMC' })}</>);

    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
