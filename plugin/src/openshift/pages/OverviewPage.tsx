import * as React from 'react';
import { OverviewPage } from 'pages/Overview/OverviewPage';
import { useInitKialiListeners } from '../utils/KialiIntegration';
import { setHistory } from 'app/History';
import { useHistory } from 'react-router';
import { KialiContainer } from 'openshift/components/KialiContainer';

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
