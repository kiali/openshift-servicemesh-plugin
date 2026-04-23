import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom-v5-compat';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { ErrorPage } from 'openshift/components/ErrorPage';
import { meshTabPageStyle } from 'openshift/styles/GlobalStyle';
import { ResourceURLPathProps } from 'openshift/utils/IstioResources';
import { WorkloadDetailsPage } from 'pages/WorkloadDetails/WorkloadDetailsPage';
import * as API from 'services/Api';
import { WorkloadId, WorkloadQuery } from 'types/Workload';
import { useKialiTranslation } from 'utils/I18nUtils';
import { centerVerticalHorizontalStyle } from '../../components/KialiController';
import { setRouterBasename, useInitKialiListeners } from '../../utils/KialiIntegration';
import { parseWorkloadName } from '../../utils/PodNameParser';

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
        <h1 className={centerVerticalHorizontalStyle}>Loading...</h1>
      </KialiContainer>
    );
  }

  // Only render WorkloadDetailsPage once validated the correct workload name
  const workloadId: WorkloadId = {
    namespace: ns,
    workload: finalWorkload
  };

  return (
    <KialiContainer className={meshTabPageStyle}>
      <WorkloadDetailsPage workloadId={workloadId}></WorkloadDetailsPage>
    </KialiContainer>
  );
};

export default WorkloadMeshTab;
