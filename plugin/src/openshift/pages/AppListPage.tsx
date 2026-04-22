import * as React from 'react';
import { useLocation } from 'react-router-dom-v5-compat';
import { AppListPage } from 'pages/AppList/AppListPage';
import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';

const AppListPageOSSMC: React.FC<void> = () => {
  const { pathname } = useLocation();

  setRouterBasename(pathname);

  useInitKialiListeners();

  return (
    <KialiContainer>
      <AppListPage></AppListPage>
    </KialiContainer>
  );
};

export default AppListPageOSSMC;
