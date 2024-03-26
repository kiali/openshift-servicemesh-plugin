import * as React from 'react';
import { Provider } from 'react-redux';
import { store } from 'store/ConfigStore';
import { KialiController } from '../components/KialiController';
import { MessageCenter } from 'components/MessageCenter';
import { globalStyle } from 'styles/GlobalStyle';
import cssVariables from 'styles/variables.module.scss';
import { kialiStyle } from 'styles/StyleUtils';

import 'tippy.js/dist/tippy.css';
import 'tippy.js/dist/themes/light-border.css';

// Enables ACE editor YAML themes
import 'ace-builds/src-noconflict/ace';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-eclipse';
import 'ace-builds/src-noconflict/theme-twilight';

// Enables the search box for the ACE editor
import 'ace-builds/src-noconflict/ext-searchbox';

const ossmcStyle = kialiStyle({
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  $nest: {
    '& ul': {
      paddingLeft: 0,
      listStyle: 'none'
    }
  }
});

interface Props {
  children: React.ReactNode;
}

export const KialiContainer: React.FC<Props> = ({ children }) => {
  return (
    <Provider store={store}>
      <MessageCenter drawerTitle="Message Center" />
      <div className={`${globalStyle} ${ossmcStyle} ${cssVariables.style}`}>
        <KialiController>{children}</KialiController>
      </div>
    </Provider>
  );
};
