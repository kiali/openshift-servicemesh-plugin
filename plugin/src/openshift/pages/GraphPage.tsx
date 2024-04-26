import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom-v5-compat';
import { GraphPage, GraphURLPathProps } from 'pages/Graph/GraphPage';
import { GraphPagePF } from 'pages/GraphPF/GraphPagePF';
import { getPluginConfig, useInitKialiListeners } from '../utils/KialiIntegration';
import { setHistory } from 'app/History';
import { kialiStyle } from 'styles/StyleUtils';
import { KialiContainer } from 'openshift/components/KialiContainer';

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

  const { aggregate, aggregateValue, app, namespace, service, version, workload } = useParams<GraphURLPathProps>();

  const location = useLocation();
  setHistory(location.pathname);

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
