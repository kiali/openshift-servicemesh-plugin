import * as React from 'react';
import { Provider } from 'react-redux';
import { store } from 'store/ConfigStore';
import { KialiController } from '../components/KialiController';
import { MessageCenter } from 'components/MessageCenter';
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

interface Props {
  children: React.ReactNode;
}

export const KialiContainer: React.FC<Props> = ({ children }) => {
  return (
    <Provider store={store}>
      <MessageCenter drawerTitle="Message Center" />
      <div id="root" className={`${kialiStyle} ${ossmcStyle} ${kialiCSSVariables.style} ${ossmcCSSVariables.style}`}>
        <KialiController>{children}</KialiController>
      </div>
    </Provider>
  );
};
