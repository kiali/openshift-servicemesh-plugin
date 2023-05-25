import { store, persistor, PersistGate } from '@kiali/types';
import * as React from 'react';
import { Provider } from 'react-redux';
import OverviewPage from '../pages/Overview/OverviewPage';
import KialiController from './KialiController';

const OverviewContainer = () => {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <KialiController>
          <OverviewPage></OverviewPage>
        </KialiController>
      </PersistGate>
    </Provider>
  );
};

export default OverviewContainer;
