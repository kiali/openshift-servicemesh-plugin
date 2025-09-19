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
      const parts = workload.split('-');

      if (parts.length >= 3) {
        // More than 2 segments -> likely Deployment / ReplicaSet
        // e.g. details-v1-77b775f46-c7vjb -> details-v1
        // e.g. istiod-866fd6ccd7-7v8p5 -> istiod
        workload = parts.slice(0, -2).join('-');
      }
      if (parts.length === 2) {
        // Two segments only -> likely DaemonSet or normal name
        // e.g. ztunnel-f94gp -> ztunnel
        workload = parts.slice(0, -1).join('-');
      }
      // TODO: with hyphen in name (Still an issue)
      // e.g. kiali-traffic-generator-t9mlw, curl-client
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
