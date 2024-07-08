import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom-v5-compat';
import { GraphPage, GraphURLPathProps } from 'pages/Graph/GraphPage';
import { GraphPagePF } from 'pages/GraphPF/GraphPagePF';
import { getPluginConfig, setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { paddingContainer } from 'openshift/styles/GlobalStyle';

const GraphPageOSSMC: React.FC<void> = () => {
  useInitKialiListeners();

  const [pluginConfig, setPluginConfig] = React.useState({
    graph: {
      impl: 'pf'
    }
  });

  const { pathname } = useLocation();
  const { aggregate, aggregateValue, app, namespace, service, version, workload } = useParams<GraphURLPathProps>();

  React.useEffect(() => {
    getPluginConfig()
      .then(config => setPluginConfig(config))
      .catch(e => console.error(e));
  }, []);

  setRouterBasename(pathname);

  return (
    <KialiContainer>
      <div className={paddingContainer}>
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
