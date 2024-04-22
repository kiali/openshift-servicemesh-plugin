import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom-v5-compat';
import { WorkloadId } from 'types/Workload';
import { WorkloadDetailsPage } from 'pages/WorkloadDetails/WorkloadDetailsPage';
import { useInitKialiListeners } from '../../utils/KialiIntegration';
import { setHistory } from 'app/History';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { ResourceURLPathProps } from 'openshift/utils/IstioResources';

const WorkloadMeshTab: React.FC<void> = () => {
  useInitKialiListeners();

  const location = useLocation();
  setHistory(location.pathname);

  const { ns, name, plural } = useParams<ResourceURLPathProps>();

  let workload = name!;

  if (plural === 'pods') {
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
    namespace: ns!,
    workload
  };

  return (
    <KialiContainer>
      <WorkloadDetailsPage workloadId={workloadId}></WorkloadDetailsPage>
    </KialiContainer>
  );
};

export default WorkloadMeshTab;
