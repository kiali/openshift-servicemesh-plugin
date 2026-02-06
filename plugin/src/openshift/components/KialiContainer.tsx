import * as React from 'react';
import { Provider } from 'react-redux';
import { store } from 'store/ConfigStore';
import { KialiController } from '../components/KialiController';
import { NotificationAlerts } from '../components/NotificationAlerts';
import { globalStyle as kialiStyle } from 'styles/GlobalStyle';
import { globalStyle as ossmcStyle } from '../styles/GlobalStyle';
import kialiCSSVariables from 'styles/variables.module.scss';
import ossmcCSSVariables from '../styles/variables.module.scss';

// Load the pf-icons
import '@patternfly/patternfly/patternfly-base.css';

// Enables ACE editor YAML themes
import 'ace-builds/src-noconflict/ace';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-eclipse';
import 'ace-builds/src-noconflict/theme-twilight';

// Enables the search box for the ACE editor
import 'ace-builds/src-noconflict/ext-searchbox';
import { classes } from 'typestyle';

interface Props {
  children: React.ReactNode;
  className?: string;
}

export const KialiContainer: React.FC<Props> = ({ className, children }) => {
  return (
    <Provider store={store}>
      <NotificationAlerts />
      <div id="root" className={classes(kialiStyle, ossmcStyle, kialiCSSVariables.style, ossmcCSSVariables, className)}>
        <KialiController>{children}</KialiController>
      </div>
    </Provider>
  );
};
