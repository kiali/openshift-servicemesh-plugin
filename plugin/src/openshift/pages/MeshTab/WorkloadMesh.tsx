import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom-v5-compat';
import { WorkloadId, WorkloadQuery } from 'types/Workload';
import { WorkloadDetailsPage } from 'pages/WorkloadDetails/WorkloadDetailsPage';
import { setRouterBasename, useInitKialiListeners } from '../../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { ResourceURLPathProps } from 'openshift/utils/IstioResources';
import { grayContainer } from 'openshift/styles/GlobalStyle';
import { ErrorPage } from 'openshift/components/ErrorPage';
import { useKialiTranslation } from 'utils/I18nUtils';
import * as API from 'services/Api';
import {centerVerticalHorizontalStyle} from "../../components/KialiController";

// validateWorkload validate in the backend if a workload exists
const validateWorkload = async (namespace: string, workloadName: string): Promise<boolean> => {
  try {
    const params: WorkloadQuery = {
      validate: 'false',
      health: 'false',
      rateInterval: '600s'
    };
    await API.getWorkload(namespace, workloadName, params);
    return true;
  } catch {
    return false;
  }
};

// parseWorkloadName Parse workload name from pod name (Usually containing a hash)
const parseWorkloadName = (podName: string): string => {
  const parts = podName.split('-');

  if (parts.length >= 3) {
    // More than 2 segments -> likely Deployment / ReplicaSet
    // e.g. details-v1-77b775f46-c7vjb -> details-v1
    // e.g. istiod-866fd6ccd7-7v8p5 -> istiod
    return parts.slice(0, -2).join('-');
  }

  if (parts.length === 2) {
    // Two segments only -> likely DaemonSet or normal name
    // e.g. ztunnel-f94gp -> ztunnel
    return parts.slice(0, -1).join('-');
  }

  // Single segment or no parsing needed
  return podName;
};

const WorkloadMeshTab: React.FC<void> = () => {
  const { t } = useKialiTranslation();
  const { pathname } = useLocation();
  const { ns, name, plural } = useParams<ResourceURLPathProps>();
  const [finalWorkload, setFinalWorkload] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [isInitialized, setIsInitialized] = React.useState<boolean>(false);

  setRouterBasename(pathname);
  useInitKialiListeners();

  const errorPage = (
    <ErrorPage title={t('Workload detail error')} message={t('Workload is not defined correctly')}></ErrorPage>
  );

  React.useEffect(() => {
    if (!ns || !name || !plural) {
      setIsInitialized(true);
      setIsLoading(false);
      return;
    }

    const checkWorkloadName = async (): Promise<void> => {
      setIsLoading(true);
      setIsInitialized(false);

      let parsedWorkload = name;

      if (plural === 'pods') {
        parsedWorkload = parseWorkloadName(name);
      }

      // Only validate if the parsed name is different from the original
      if (parsedWorkload !== name) {
        const isValid = await validateWorkload(ns, parsedWorkload);
        if (!isValid) {
          // If validation fails, try with just removing the last part
          // e.g. kiali-traffic-generator-n2d9n -> kiali-traffic-generator
          const parts = name.split('-');
          if (parts.length >= 3) {
            const fallbackWorkload = parts.slice(0, -1).join('-');
            const isFallbackValid = await validateWorkload(ns, fallbackWorkload);
            setFinalWorkload(isFallbackValid ? fallbackWorkload : name);
          } else {
            setFinalWorkload(name);
          }
        } else {
          setFinalWorkload(parsedWorkload);
        }
      } else {
        setFinalWorkload(name);
      }

      setIsLoading(false);
      setIsInitialized(true);
    };

    checkWorkloadName();
  }, [ns, name, plural]);

  // Show error page if required params are missing
  if (!ns || !name || !plural) {
    return errorPage;
  }

  // Show loading state while determining the correct workload name
  if (isLoading || !isInitialized) {
    return (
      <KialiContainer>
        <div className={grayContainer}>
        <h1 className={centerVerticalHorizontalStyle}>Loading...</h1>
        </div>
      </KialiContainer>
    );
  }

  // Only render WorkloadDetailsPage once validated the correct workload name
  const workloadId: WorkloadId = {
    namespace: ns,
    workload: finalWorkload
  };

  return (
    <KialiContainer>
      <div className={grayContainer}>
        <WorkloadDetailsPage workloadId={workloadId}></WorkloadDetailsPage>
      </div>
    </KialiContainer>
  );
};

export default WorkloadMeshTab;
