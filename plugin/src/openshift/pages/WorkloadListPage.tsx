import * as React from 'react';
import { useLocation } from 'react-router';

import { KialiContainer } from 'openshift/components/KialiContainer';
import { WorkloadListPage } from 'pages/WorkloadList/WorkloadListPage';

import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';

const WorkloadListPageOSSMC: React.FC<void> = () => {
  const { pathname } = useLocation();

  setRouterBasename(pathname);

  useInitKialiListeners();

  return (
    <KialiContainer>
      <WorkloadListPage />
    </KialiContainer>
  );
};

export default WorkloadListPageOSSMC;
