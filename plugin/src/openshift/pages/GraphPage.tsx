import * as React from 'react';
import { GraphPage } from 'pages/Graph/GraphPage';
import { GraphPagePF } from 'pages/GraphPF/GraphPagePF';
import { getPluginConfig, useInitKialiListeners } from '../utils/KialiIntegration';
import { useHistory } from 'react-router';
import { setHistory } from 'app/History';
import { kialiStyle } from 'styles/StyleUtils';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { configure } from 'mobx';

// Configure MobX to isolate different versions (from OCP 4.15 and OSSMC 1.73)
configure({ isolateGlobalState: true });

const containerPadding = kialiStyle({ padding: '0 20px 0 20px' });

const GraphPageOSSMC: React.FC<void> = () => {
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
    <KialiContainer>
      <div className={containerPadding}>
        {pluginConfig.graph.impl === 'cy' && <GraphPage></GraphPage>}
        {pluginConfig.graph.impl === 'pf' && <GraphPagePF></GraphPagePF>}
      </div>
    </KialiContainer>
  );
};

export default GraphPageOSSMC;
