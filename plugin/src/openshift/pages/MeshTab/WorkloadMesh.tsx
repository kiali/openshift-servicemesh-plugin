import * as React from 'react';
import { Provider } from 'react-redux';
import { useHistory } from 'react-router';
import { store } from 'store/ConfigStore';
import { WorkloadId } from 'types/Workload';
import WorkloadDetailsPage from 'pages/WorkloadDetails/WorkloadDetailsPage';
import { KialiController } from '../../components/KialiController';
import { useInitKialiListeners } from '../../utils/KialiIntegration';
import { setHistory } from 'app/History';

const WorkloadMeshTab = () => {
  useInitKialiListeners();

  const history = useHistory();
  setHistory(history.location.pathname);

  const path = history.location.pathname.substring(8);
  const items = path.split('/');
  const namespace = items[0];
  let workload = items[2];

  if (items[1] === 'pods') {
    let count = 0;
    let index = 0;
    // Get the parent workload (app-version) from pod identifier
    for (let i = 0; i < workload.length; i++) {
      if (workload[i] === '-') {
        count++;

        if (count === 2) {
          index = i;
        }
      }
    }
    if (index > 0) {
      workload = workload.substring(0, index);
    }
  }

  const workloadId: WorkloadId = {
    namespace,
    workload
  };

  return (
    <Provider store={store}>
      <KialiController>
        <WorkloadDetailsPage workloadId={workloadId}></WorkloadDetailsPage>
      </KialiController>
    </Provider>
  );
};

export default WorkloadMeshTab;
