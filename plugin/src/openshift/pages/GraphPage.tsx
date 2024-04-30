import * as React from 'react';
import { GraphPage } from 'pages/Graph/GraphPage';
import { GraphPagePF } from 'pages/GraphPF/GraphPagePF';
import { getPluginConfig, useInitKialiListeners } from '../utils/KialiIntegration';
import { useHistory } from 'react-router-dom';
import { setHistory } from 'app/History';
import { kialiStyle } from 'styles/StyleUtils';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { configure } from 'mobx';

// Configure MobX to isolate different versions in OCP 4.15
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

  // Obtain graph params from url pathname
  const path = history.location.pathname.substring(19);
  const items = path.split('/');

  let namespace = '';
  let aggregate = '';
  let aggregateValue = '';
  let app = '';
  let version = '';
  let service = '';
  let workload = '';

  if (items[0] === 'ns') {
    namespace = items[1];

    switch (items[2]) {
      // URL pathname: ns/:namespace/aggregates/:aggregate/:aggregateValue
      case 'aggregates':
        aggregate = items[3];
        aggregateValue = items[4];
        break;
      // URL pathname: ns/:namespace/applications/:app/versions/:version
      case 'applications':
        app = items[3];
        version = items[5];
        break;
      // URL pathname: ns/:namespace/services/:service
      case 'services':
        service = items[3];
        break;
      // URL pathname: ns/:namespace/workloads/:workload
      case 'workload':
        workload = items[3];
        break;
    }
  }

  return (
    <KialiContainer>
      <div className={containerPadding}>
        {pluginConfig.graph.impl === 'cy' && (
          <GraphPage
            aggregate={aggregate}
            aggregateValue={aggregateValue}
            app={app}
            namespace={namespace}
            service={service}
            version={version}
            workload={workload}
          ></GraphPage>
        )}
        {pluginConfig.graph.impl === 'pf' && (
          <GraphPagePF
            aggregate={aggregate}
            aggregateValue={aggregateValue}
            app={app}
            namespace={namespace}
            service={service}
            version={version}
            workload={workload}
          ></GraphPagePF>
        )}
      </div>
    </KialiContainer>
  );
};

export default GraphPageOSSMC;
