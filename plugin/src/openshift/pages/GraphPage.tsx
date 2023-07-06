import * as React from 'react';
import { Provider } from 'react-redux';
import { store } from 'store/ConfigStore';
import { GraphPage } from 'pages/Graph/GraphPage';
import { GraphPagePF } from 'pages/GraphPF/GraphPagePF';
import { KialiController } from '../components/KialiController';
import { getPluginConfig, useInitKialiListeners } from '../utils/KialiIntegration';
import { useHistory } from 'react-router';
import { setHistory } from 'app/History';

const GraphPageOSSMC = () => {
  useInitKialiListeners();

  const [pluginConfig, setPluginConfig] = React.useState({
    graph: 'pf'
  });

  React.useEffect(() => {
    getPluginConfig()
      .then(config => setPluginConfig(config))
      .catch(e => console.error(e));
  }, []);

  const history = useHistory();
  setHistory(history.location.pathname);

  return (
    <Provider store={store}>
      <KialiController>
        {pluginConfig.graph === 'cy' && <GraphPage></GraphPage>}
        {pluginConfig.graph === 'pf' && <GraphPagePF></GraphPagePF>}
      </KialiController>
    </Provider>
  );
};

export default GraphPageOSSMC;
