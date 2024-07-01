import * as React from 'react';
import { OverviewPage } from 'pages/Overview/OverviewPage';
import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';
import { useHistory } from 'react-router-dom';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { configure } from 'mobx';

// Configure MobX to isolate different versions in OCP 4.15
configure({ isolateGlobalState: true });

const OverviewPageOSSMC: React.FC<void> = () => {
  useInitKialiListeners();

  const history = useHistory();
  setRouterBasename(history.location.pathname);

  return (
    <KialiContainer>
      <OverviewPage></OverviewPage>
    </KialiContainer>
  );
};

export default OverviewPageOSSMC;
