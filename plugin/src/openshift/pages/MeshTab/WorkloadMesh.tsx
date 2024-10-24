import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom-v5-compat';
import { WorkloadId } from 'types/Workload';
import { WorkloadDetailsPage } from 'pages/WorkloadDetails/WorkloadDetailsPage';
import { setRouterBasename, useInitKialiListeners } from '../../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { ResourceURLPathProps } from 'openshift/utils/IstioResources';
import { grayContainer } from 'openshift/styles/GlobalStyle';
import { ErrorPage } from 'openshift/components/ErrorPage';
import { useKialiTranslation } from 'utils/I18nUtils';

const WorkloadMeshTab: React.FC<void> = () => {
  const { t } = useKialiTranslation();
  const { pathname } = useLocation();
  const { ns, name, plural } = useParams<ResourceURLPathProps>();

  setRouterBasename(pathname);

  useInitKialiListeners();

  const errorPage = (
    <ErrorPage title={t('Workload detail error')} message={t('Workload is not defined correctly')}></ErrorPage>
  );

  if (ns && name && plural) {
    let workload = name;

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
      namespace: ns,
      workload
    };

    return (
      <KialiContainer>
        <div className={grayContainer}>
          <WorkloadDetailsPage workloadId={workloadId}></WorkloadDetailsPage>
        </div>
      </KialiContainer>
    );
  } else {
    return errorPage;
  }
};

export default WorkloadMeshTab;
