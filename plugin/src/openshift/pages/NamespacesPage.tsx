import * as React from 'react';
import { useLocation } from 'react-router-dom-v5-compat';
import { NamespacesPage } from 'pages/Namespaces/NamespacesPage';
import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { listPageStyle } from '../styles/GlobalStyle';

const NamespacesPageOSSMC: React.FC<void> = () => {
  const { pathname } = useLocation();

  setRouterBasename(pathname);

  useInitKialiListeners();

  return (
    <KialiContainer className={listPageStyle}>
      <NamespacesPage></NamespacesPage>
    </KialiContainer>
  );
};

export default NamespacesPageOSSMC;
