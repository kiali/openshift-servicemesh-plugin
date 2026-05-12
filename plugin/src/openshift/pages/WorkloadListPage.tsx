import * as React from 'react';
import { useLocation } from 'react-router-dom-v5-compat';
import { WorkloadListPage } from 'pages/WorkloadList/WorkloadListPage';
import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';

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
