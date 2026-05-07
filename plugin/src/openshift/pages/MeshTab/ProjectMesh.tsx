import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom-v5-compat';
import { NamespaceDetailsPage } from 'pages/NamespaceDetails/NamespaceDetailsPage';
import { setRouterBasename, useInitKialiListeners } from '../../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { ErrorPage } from 'openshift/components/ErrorPage';
import { meshTabPageStyle } from 'openshift/styles/GlobalStyle';
import { ResourceURLPathProps } from 'openshift/utils/IstioResources';
import { useKialiTranslation } from 'utils/I18nUtils';

const ProjectMeshTab: React.FC<void> = () => {
  const { t } = useKialiTranslation();
  const { pathname } = useLocation();
  const { name: namespace } = useParams<ResourceURLPathProps>();

  setRouterBasename(pathname);

  useInitKialiListeners();

  if (!namespace) {
    return (
      <ErrorPage title={t('Namespace detail error')} message={t('Namespace is not defined correctly')} />
    );
  }

  return (
    <KialiContainer className={meshTabPageStyle}>
      <NamespaceDetailsPage namespace={namespace} />
    </KialiContainer>
  );
};

export default ProjectMeshTab;
