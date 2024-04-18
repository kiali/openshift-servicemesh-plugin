import React from 'react';
import { Redirect, Route } from 'react-router-dom';
import { SwitchErrorBoundary } from '../SwitchErrorBoundary/SwitchErrorBoundary';
import { pathRoutes, defaultRoute } from '../../routes';
import { Path } from '../../types/Routes';
import { kialiStyle } from 'styles/StyleUtils';
import { PFColors } from '../Pf/PfColors';
import {
  Button,
  ButtonVariant,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  EmptyStateHeader
} from '@patternfly/react-core';
import { KialiIcon } from 'config/KialiIcon';

const containerStyle = kialiStyle({ marginLeft: 0, marginRight: 0 });
const containerPadding = kialiStyle({ padding: '0 20px 0 20px' });
const containerGray = kialiStyle({ background: PFColors.BackgroundColor200, height: '100%' });
const containerError = kialiStyle({ height: 'calc(100vh - 76px)' });

export class RenderPage extends React.Component<{ isGraph: boolean }> {
  renderPaths(paths: Path[]) {
    return paths.map((item, index) => {
      return <Route key={index} path={item.path} component={item.component} render={item.render} />;
    });
  }

  render() {
    const component = (
      <div className={`${containerStyle} ${this.props.isGraph && containerPadding}`}>
        <SwitchErrorBoundary
          fallBackComponent={() => (
            <EmptyState className={containerError} variant="lg">
              <EmptyStateHeader
                titleText="Something went wrong"
                icon={<EmptyStateIcon icon={KialiIcon.Error} />}
                headingLevel="h1"
              />
              <EmptyStateBody>
                <p style={{ marginBottom: 'var(--pf-v5-global--spacer--lg)' }}>
                  Sorry, there was a problem. Try a refresh or navigate to a different page.
                </p>
                <Button variant={ButtonVariant.primary} onClick={() => history.back()}>
                  Return to last page
                </Button>
              </EmptyStateBody>
            </EmptyState>
          )}
        >
          {this.renderPaths(pathRoutes)}
          <Redirect from="/" to={defaultRoute} />
        </SwitchErrorBoundary>
      </div>
    );

    return <>{!this.props.isGraph ? <div className={containerGray}>{component}</div> : component}</>;
  }
}
