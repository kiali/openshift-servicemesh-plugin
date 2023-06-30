import * as React from 'react';
import { Provider } from 'react-redux';
import { store } from 'store/ConfigStore';
import OverviewPage from 'pages/Overview/OverviewPage';
import { KialiController } from '../components/KialiController';
import { useInitKialiListeners } from '../utils/KialiIntegration';
import { setHistory } from 'app/History';
import { useHistory } from 'react-router';

const OverviewPageOSSMC = () => {
  useInitKialiListeners();

  const history = useHistory();
  setHistory(history.location.pathname);

  return (
    <Provider store={store}>
      <KialiController>
        <OverviewPage></OverviewPage>
      </KialiController>
    </Provider>
  );
};

export default OverviewPageOSSMC;
