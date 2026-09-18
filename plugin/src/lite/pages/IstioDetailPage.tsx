import type { FC } from 'react';
import { Link, useParams } from 'react-router-dom-v5-compat';
import { ResourceLink, Timestamp, useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import {
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  EmptyStateVariant,
  Flex,
  FlexItem,
  Grid,
  GridItem,
  PageSection,
  Spinner,
  Title
} from '@patternfly/react-core';
import { LiteConditionsTable } from '../components/LiteConditionsTable';
import { IstioRelatedCard } from '../components/IstioRelatedCard';
import { LiteStatus } from '../components/LiteStatus';
import { OssmOperatorMissingEmptyState } from '../components/OssmOperatorMissingEmptyState';
import type { LiteIstioResource } from '../types/istio';
import { istioGVK } from '../types/istio';
import { useKialiTranslation } from 'utils/I18nUtils';
import { isMissingModelError } from '../../openshift/utils/watchErrors';

const IstioDetailContent: FC<{ name: string }> = ({ name }) => {
  const { t } = useKialiTranslation();
  const [resource, loaded, loadError] = useK8sWatchResource<LiteIstioResource>({
    groupVersionKind: istioGVK,
    name,
    namespaced: false
  });

  if (!loaded) {
    return (
      <PageSection>
        <Bullseye>
          <Spinner aria-label={t('Loading Istio control plane')} size="xl" />
        </Bullseye>
      </PageSection>
    );
  }

  if (loadError && isMissingModelError(loadError)) {
    return (
      <PageSection>
        <OssmOperatorMissingEmptyState />
      </PageSection>
    );
  }

  if (loadError || !resource) {
    return (
      <PageSection>
        <EmptyState headingLevel="h2" titleText={t('Istio control plane not found')} variant={EmptyStateVariant.lg}>
          <EmptyStateBody>{t('Istio "{{name}}" was not found on this cluster.', { name })}</EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  const spec = resource.spec;
  const status = resource.status;
  const conditions = status?.conditions ?? [];

  return (
    <>
      <PageSection>
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to="/ossmconsole/istios">{t('Istios')}</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{name}</BreadcrumbItem>
        </Breadcrumb>
        <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginTop: '1rem' }}>
          <FlexItem>
            <Title headingLevel="h1">{name}</Title>
          </FlexItem>
          <FlexItem>
            <LiteStatus conditions={conditions} conditionType="Ready" />
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection>
        <Grid hasGutter>
          <GridItem span={5}>
            <Card isCompact>
              <CardBody>
                <DescriptionList columnModifier={{ default: '2Col' }} isCompact>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Mesh ID')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.values?.global?.meshID ?? t('Not specified')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Network')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.values?.global?.network ?? t('Not specified')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Control Plane Namespace')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.namespace ? <ResourceLink kind="Namespace" name={spec.namespace} /> : t('Not specified')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Version')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>{spec?.version ?? t('Not specified')}</DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Created')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {resource.metadata?.creationTimestamp ? (
                        <Timestamp timestamp={resource.metadata.creationTimestamp} />
                      ) : (
                        t('Not specified')
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Profile')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>{spec?.profile ?? t('Not specified')}</DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Update Strategy')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.updateStrategy?.type ?? t('Not specified')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </CardBody>
            </Card>
          </GridItem>

          <GridItem span={5}>
            <IstioRelatedCard activeRevisionName={status?.activeRevisionName} controlPlaneNamespace={spec?.namespace} />
          </GridItem>

          {conditions.length > 0 && (
            <GridItem span={12}>
              <Card isCompact>
                <CardTitle>
                  <strong>{t('Conditions')}</strong>
                </CardTitle>
                <CardBody>
                  <LiteConditionsTable conditions={conditions} />
                </CardBody>
              </Card>
            </GridItem>
          )}
        </Grid>
      </PageSection>
    </>
  );
};

const IstioDetailPage: FC = () => {
  const { t } = useKialiTranslation();
  const { name } = useParams<{ name: string }>();

  if (!name) {
    return (
      <PageSection>
        <EmptyState headingLevel="h2" titleText={t('Not Found')} variant={EmptyStateVariant.lg}>
          <EmptyStateBody>{t('Invalid URL. Expected /ossmconsole/istios/:name.')}</EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return <IstioDetailContent name={name} />;
};

export default IstioDetailPage;
