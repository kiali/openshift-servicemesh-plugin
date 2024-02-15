import * as React from 'react';
import { useHistory } from 'react-router';
import { ActionKeys } from 'actions/ActionKeys';
import { store } from 'store/ConfigStore';
import { GraphPage } from 'pages/Graph/GraphPage';
import { GraphPagePF } from 'pages/GraphPF/GraphPagePF';
import { getPluginConfig, useInitKialiListeners } from '../../utils/KialiIntegration';
import { setHistory } from 'app/History';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { kialiStyle } from 'styles/StyleUtils';

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

  const history = useHistory();
  setHistory(history.location.pathname);

  const path = history.location.pathname.substring(8);
  const items = path.split('/');
  const namespace = items[2];

  // Set namespace of the project as active namespace in redux store
  store.dispatch({ type: ActionKeys.SET_ACTIVE_NAMESPACES, payload: [{ name: namespace }] });

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
