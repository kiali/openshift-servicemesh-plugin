import * as React from 'react';
import { useLocation } from 'react-router-dom-v5-compat';
import { ServiceListPage } from 'pages/ServiceList/ServiceListPage';
import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';

const ServiceListPageOSSMC: React.FC<void> = () => {
  const { pathname } = useLocation();

  setRouterBasename(pathname);

  useInitKialiListeners();

  return (
    <KialiContainer>
      <ServiceListPage />
    </KialiContainer>
  );
};

export default ServiceListPageOSSMC;
