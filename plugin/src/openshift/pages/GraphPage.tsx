import * as React from 'react';
import { Provider } from 'react-redux';
import { store } from 'store/ConfigStore';
import { GraphPage } from 'pages/Graph/GraphPage';
import { KialiController } from '../components/KialiController';
import { useInitKialiListeners } from '../utils/KialiIntegration';
import { useHistory } from 'react-router';
import { setHistory } from 'app/History';

const GraphPageOSSMC = () => {
  useInitKialiListeners();

  const history = useHistory();
  setHistory(history.location.pathname);

  return (
    <Provider store={store}>
      <KialiController>
        <GraphPage></GraphPage>
      </KialiController>
    </Provider>
  );
};

export default GraphPageOSSMC;
