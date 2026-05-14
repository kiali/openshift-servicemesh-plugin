import * as React from 'react';
import { useParams, useLocation, useSearchParams, Link } from 'react-router-dom-v5-compat';
import { Breadcrumb, BreadcrumbItem, Title, TitleSizes } from '@patternfly/react-core';
import { AppDetailsPage } from 'pages/AppDetails/AppDetailsPage';
import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { PFBadge, PFBadges } from 'components/Pf/PfBadges';
import { AppId } from 'types/App';
import { useKialiTranslation } from 'utils/I18nUtils';
import { ErrorPage } from 'openshift/components/ErrorPage';
import { kialiStyle } from 'styles/StyleUtils';
import { detailTitleMainStyle, detailPageTitleStyle } from 'styles/FlexStyles';
import { PFSpacer } from 'styles/PfSpacer';

const headerStyle = kialiStyle({
  paddingBottom: '0.5rem'
});

const detailTitleRowStyle = kialiStyle({
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'nowrap',
  gap: PFSpacer.sm,
  marginTop: '1rem',
  minWidth: 0,
  width: '100%'
});

const AppDetailsPageOSSMC: React.FC<void> = () => {
  const { t } = useKialiTranslation();
  const { pathname } = useLocation();
  const { namespace, app } = useParams<AppId>();
  const [searchParams] = useSearchParams();
  const cluster = searchParams.get('clusterName') || undefined;

  setRouterBasename(pathname);

  useInitKialiListeners();

  const errorPage = (
    <ErrorPage title={t('Application detail error')} message={t('Application is not defined correctly')}></ErrorPage>
  );

  if (namespace && app) {
    return (
      <KialiContainer>
        <div className={headerStyle}>
          <Breadcrumb>
            <BreadcrumbItem>
              <Link to="/ossmconsole/applications">{t('Applications')}</Link>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <Link to={`/ossmconsole/applications?namespaces=${namespace}`}>
                {t('Namespace: {{namespace}}', { namespace })}
              </Link>
            </BreadcrumbItem>
            <BreadcrumbItem isActive>{app}</BreadcrumbItem>
          </Breadcrumb>
          <div className={detailTitleRowStyle}>
            <PFBadge badge={PFBadges.App} size="global" />
            <div className={detailTitleMainStyle}>
              <Title headingLevel="h1" size={TitleSizes.xl} className={detailPageTitleStyle}>
                {app}
              </Title>
            </div>
          </div>
        </div>
        <AppDetailsPage appId={{ namespace, app, cluster }} />
      </KialiContainer>
    );
  } else {
    return errorPage;
  }
};

export default AppDetailsPageOSSMC;
