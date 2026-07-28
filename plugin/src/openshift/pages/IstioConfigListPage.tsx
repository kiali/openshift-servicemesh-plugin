import * as React from 'react';
import { useLocation } from 'react-router';
import { IstioConfigListPage } from 'pages/IstioConfigList/IstioConfigListPage';
import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';

const IstioConfigListPageOSSMC: React.FC<void> = () => {
  const { pathname } = useLocation();

  setRouterBasename(pathname);

  useInitKialiListeners();

  return (
    <KialiContainer>
      <IstioConfigListPage />
    </KialiContainer>
  );
};

export default IstioConfigListPageOSSMC;
