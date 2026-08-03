import * as React from 'react';
import { Provider } from 'react-redux';
import { classes } from 'typestyle';

import { store } from 'store/ConfigStore';
import { globalStyle as kialiStyle } from 'styles/GlobalStyle';
import kialiCSSVariables from 'styles/variables.module.scss';

import { KialiController } from '../components/KialiController';
import { NotificationAlerts } from '../components/NotificationAlerts';
import { globalStyle as ossmcStyle } from '../styles/GlobalStyle';
import ossmcCSSVariables from '../styles/variables.module.scss';

import '@patternfly/patternfly/patternfly-base.css';
// Load the pf-icons

// Configure @monaco-editor/react to use the locally bundled monaco-editor before any page
// can render an editor. See MonacoSetup.ts for details.
import '../utils/MonacoSetup';

interface Props {
  children: React.ReactNode;
  className?: string;
}

export const KialiContainer: React.FC<Props> = ({ className, children }) => {
  return (
    <Provider store={store}>
      <NotificationAlerts />
      <div
        id="root"
        className={classes(kialiStyle, ossmcStyle, kialiCSSVariables.style, ossmcCSSVariables.style, className)}
      >
        <KialiController>{children}</KialiController>
      </div>
    </Provider>
  );
};
