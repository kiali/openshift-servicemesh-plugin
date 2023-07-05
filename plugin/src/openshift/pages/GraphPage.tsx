import * as React from 'react';
import { Provider } from 'react-redux';
import { store } from 'store/ConfigStore';
import { GraphPagePF } from 'pages/GraphPF/GraphPagePF';
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
        <GraphPagePF></GraphPagePF>
      </KialiController>
    </Provider>
  );
};

export default GraphPageOSSMC;
