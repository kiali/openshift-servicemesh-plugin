import * as React from 'react';
import { EmptyState, EmptyStateBody, EmptyStateVariant } from '@patternfly/react-core';
import { ExclamationCircleIcon } from '@patternfly/react-icons';

interface State {
  hasError: boolean;
}

// Catches rendering errors in OSSMC pages (e.g. when Kiali backend is unreachable)
// and displays a friendly message instead of crashing the entire Console.
export class KialiErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <EmptyState
          variant={EmptyStateVariant.lg}
          headingLevel="h2"
          icon={ExclamationCircleIcon}
          titleText="Service Mesh Console Unavailable"
        >
          <EmptyStateBody>
            The Kiali backend is not reachable. Service Mesh pages require a running Kiali instance on this cluster.
          </EmptyStateBody>
        </EmptyState>
      );
    }
    return this.props.children;
  }
}
