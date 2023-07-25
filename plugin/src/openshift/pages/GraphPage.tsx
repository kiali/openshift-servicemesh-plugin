import * as React from 'react';
import { Provider } from 'react-redux';
import { store } from 'store/ConfigStore';
import { GraphPage } from 'pages/Graph/GraphPage';
import { GraphPagePF } from 'pages/GraphPF/GraphPagePF';
import { KialiController } from '../components/KialiController';
import { getPluginConfig, useInitKialiListeners } from '../utils/KialiIntegration';
import { useHistory } from 'react-router';
import { setHistory } from 'app/History';
import { kialiStyle } from 'styles/StyleUtils';

const containerPadding = kialiStyle({ padding: '0 20px 0 20px' });

const GraphPageOSSMC = () => {
  useInitKialiListeners();

  const [pluginConfig, setPluginConfig] = React.useState({
    graph: {
      impl: 'pf'
    }
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
      <div className={containerPadding}>
        <KialiController>
          {pluginConfig.graph.impl === 'cy' && <GraphPage></GraphPage>}
          {pluginConfig.graph.impl === 'pf' && <GraphPagePF></GraphPagePF>}
        </KialiController>
      </div>
    </Provider>
  );
};

export default GraphPageOSSMC;
