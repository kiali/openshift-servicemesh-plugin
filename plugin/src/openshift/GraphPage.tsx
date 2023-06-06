import { store, persistor, PersistGate } from '@kiali/types';
import * as React from 'react';
import { Provider } from 'react-redux';
import GraphPage from '../pages/Graph/GraphPage';
import KialiController from './KialiController';

const GraphContainer = () => {
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

export default GraphContainer;
