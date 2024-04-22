import * as React from 'react';
import { useLocation } from 'react-router-dom-v5-compat';
import { OverviewPage } from 'pages/Overview/OverviewPage';
import { useInitKialiListeners } from '../utils/KialiIntegration';
import { setHistory } from 'app/History';
import { KialiContainer } from 'openshift/components/KialiContainer';

const OverviewPageOSSMC: React.FC<void> = () => {
  useInitKialiListeners();

  const location = useLocation();
  setHistory(location.pathname);

  return (
    <KialiContainer>
      <OverviewPage></OverviewPage>
    </KialiContainer>
  );
};

export default OverviewPageOSSMC;
