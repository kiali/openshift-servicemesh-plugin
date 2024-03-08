import * as React from 'react';
import { OverviewPage } from 'pages/Overview/OverviewPage';
import { useInitKialiListeners } from '../utils/KialiIntegration';
import { setHistory } from 'app/History';
import { useHistory } from 'react-router';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { configure } from 'mobx';

// Configure MobX to isolate different versions (from OCP 4.15 and OSSMC 1.73)
configure({ isolateGlobalState: true });

const OverviewPageOSSMC: React.FC<void> = () => {
  useInitKialiListeners();

  const history = useHistory();
  setHistory(history.location.pathname);

  return (
    <KialiContainer>
      <OverviewPage></OverviewPage>
    </KialiContainer>
  );
};

export default OverviewPageOSSMC;
