import * as React from 'react';
import { useLocation } from 'react-router';

import { KialiContainer } from 'openshift/components/KialiContainer';
import { ServiceListPage } from 'pages/ServiceList/ServiceListPage';

import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';

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
