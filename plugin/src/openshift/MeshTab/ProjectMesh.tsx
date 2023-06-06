import { store, persistor, PersistGate, ActionKeys } from '@kiali/types';
import * as React from 'react';
import { Provider } from 'react-redux';
import { useHistory } from 'react-router';
import GraphPage from '../../pages/Graph/GraphPage';
import KialiController from '../KialiController';

const ProjectMeshTab = () => {
  const history = useHistory();
  const path = history.location.pathname.substring(8);
  const items = path.split('/');
  const namespace = items[2];

  // Set namespace of the project as active namespace in redux store
  store.dispatch({ type: ActionKeys.SET_ACTIVE_NAMESPACES, payload: [{ name: namespace }] });

  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <KialiController>
          <GraphPage></GraphPage>
        </KialiController>
      </PersistGate>
    </Provider>
  );
};

export default ProjectMeshTab;
