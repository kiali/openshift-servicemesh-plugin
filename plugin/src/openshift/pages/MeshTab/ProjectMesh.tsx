import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom-v5-compat';
import { ActionKeys } from 'actions/ActionKeys';
import { store } from 'store/ConfigStore';
import { GraphPage } from 'pages/Graph/GraphPage';
import { setRouterBasename, useInitKialiListeners } from '../../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { ResourceURLPathProps } from 'openshift/utils/IstioResources';
import { meshTabPageStyle } from 'openshift/styles/GlobalStyle';

const ProjectMeshTab: React.FC<void> = () => {
  const { pathname } = useLocation();
  const { name: namespace } = useParams<ResourceURLPathProps>();

  setRouterBasename(pathname);

  useInitKialiListeners();

  // Set namespace of the project as active namespace in redux store
  store.dispatch({ type: ActionKeys.SET_ACTIVE_NAMESPACES, payload: [{ name: namespace! }] });

  return (
    <KialiContainer className={meshTabPageStyle}>
      <GraphPage></GraphPage>
    </KialiContainer>
  );
};

export default ProjectMeshTab;
