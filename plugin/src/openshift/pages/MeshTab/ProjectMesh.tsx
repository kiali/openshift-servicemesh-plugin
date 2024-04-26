import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom-v5-compat';
import { ActionKeys } from 'actions/ActionKeys';
import { store } from 'store/ConfigStore';
import { GraphPage } from 'pages/Graph/GraphPage';
import { GraphPagePF } from 'pages/GraphPF/GraphPagePF';
import { getPluginConfig, useInitKialiListeners } from '../../utils/KialiIntegration';
import { setHistory } from 'app/History';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { kialiStyle } from 'styles/StyleUtils';
import { ResourceURLPathProps } from 'openshift/utils/IstioResources';

const containerPadding = kialiStyle({ padding: '0 20px 0 20px' });

const ProjectMeshTab: React.FC<void> = () => {
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

  const location = useLocation();
  setHistory(location.pathname);

  const { name: namespace } = useParams<ResourceURLPathProps>();

  // Set namespace of the project as active namespace in redux store
  store.dispatch({ type: ActionKeys.SET_ACTIVE_NAMESPACES, payload: [{ name: namespace! }] });

  return (
    <KialiContainer>
      <div className={containerPadding}>
        {pluginConfig.graph.impl === 'cy' && <GraphPage></GraphPage>}
        {pluginConfig.graph.impl === 'pf' && <GraphPagePF></GraphPagePF>}
      </div>
    </KialiContainer>
  );
};

export default ProjectMeshTab;
