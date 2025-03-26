import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom-v5-compat';
import { GraphPage, GraphURLPathProps } from 'pages/Graph/GraphPage';
import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { paddingContainer } from 'openshift/styles/GlobalStyle';

const GraphPageOSSMC: React.FC<void> = () => {
  const { pathname } = useLocation();
  const { aggregate, aggregateValue, app, namespace, service, version, workload } = useParams<GraphURLPathProps>();

  setRouterBasename(pathname);

  useInitKialiListeners();

  return (
    <KialiContainer>
      <div className={paddingContainer}>
        <GraphPage
          aggregate={aggregate}
          aggregateValue={aggregateValue}
          app={app}
          namespace={namespace}
          service={service}
          version={version}
          workload={workload}
        ></GraphPage>
      </div>
    </KialiContainer>
  );
};

export default GraphPageOSSMC;
