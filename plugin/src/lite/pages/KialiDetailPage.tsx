import * as React from 'react';
import { useMemo } from 'react';
import type { FC } from 'react';
import { Link, useParams } from 'react-router-dom-v5-compat';
import { ResourceLink, Timestamp, useAccessReview, useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  AlertActionCloseButton,
  AlertVariant,
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
  Button,
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
  Title,
  Tooltip
} from '@patternfly/react-core';
import { LiteConditionsTable } from '../components/LiteConditionsTable';
import type { LiteKialiResource } from '../types/kiali';
import { kialiGVK } from '../types/kiali';
import type { LiteOssmConsoleResource } from '../types/ossmconsole';
import { ossmConsoleGVK } from '../types/ossmconsole';
import { getKialiServiceTarget as getServiceTarget } from '../utils/kialiServiceTarget';
import {
  demoteFromConsole,
  findActiveOssmConsole,
  getActionUnavailableReason,
  isPromoted,
  promoteToConsole
} from '../utils/ossmConsoleUtils';
import { useLiteTranslation } from '../utils/i18nUtils';

const KialiDetailContent: FC<{ name: string; namespace: string }> = ({ name, namespace }) => {
  const { t } = useLiteTranslation();
  const [resource, loaded, loadError] = useK8sWatchResource<LiteKialiResource>({
    groupVersionKind: kialiGVK,
    name,
    namespace,
    namespaced: true
  });

  const [ossmConsoles, ossmConsolesLoaded, ossmConsolesLoadError] = useK8sWatchResource<LiteOssmConsoleResource[]>({
    groupVersionKind: ossmConsoleGVK,
    isList: true,
    namespaced: true
  });

  const [pendingIntent, setPendingIntent] = React.useState<'demote' | 'promote' | null>(null);
  const [alert, setAlert] = React.useState<{ message: string; variant: AlertVariant } | null>(null);

  // A loadError here most commonly means the logged-in user lacks list/get RBAC on
  // ossmconsoles.kiali.io. We treat that as "unknown", not "nothing promoted", since guessing
  // wrong in either direction would be misleading.
  const ossmConsoleStatusUnknown = ossmConsolesLoaded && !!ossmConsolesLoadError;

  const activeOssmConsole = useMemo(() => {
    if (!ossmConsolesLoaded || ossmConsolesLoadError || !Array.isArray(ossmConsoles)) return null;
    return findActiveOssmConsole(ossmConsoles);
  }, [ossmConsoles, ossmConsolesLoaded, ossmConsolesLoadError]);

  const [canPatchOssmConsole] = useAccessReview({
    group: 'kiali.io',
    name: activeOssmConsole?.metadata?.name,
    namespace: activeOssmConsole?.metadata?.namespace,
    resource: 'ossmconsoles',
    verb: 'patch'
  });

  const { name: serviceName, namespace: serviceNamespace } = resource
    ? getServiceTarget(resource)
    : { name: '', namespace: '' };
  const promoted =
    !!resource && !ossmConsoleStatusUnknown && isPromoted(activeOssmConsole, serviceName, serviceNamespace);

  // The button stays in its "Connecting…"/"Disconnecting…" state until the OSSMConsole watch confirms
  // the change actually took effect (the kiali-operator reconciles asynchronously, which can take
  // anywhere from a few seconds to a few minutes), rather than reverting right after the PATCH
  // call returns, which would make the click look like it did nothing.
  const isOperationComplete =
    pendingIntent !== null && !ossmConsoleStatusUnknown && !!resource && promoted === (pendingIntent === 'promote');

  const activePendingIntent = isOperationComplete ? null : pendingIntent;

  const completionAlert = isOperationComplete
    ? {
        message:
          pendingIntent === 'promote'
            ? t('Kiali "{{name}}" is now connected to Console.', { name })
            : t('Kiali "{{name}}" has been disconnected from Console.', { name }),
        variant: AlertVariant.success
      }
    : null;

  const displayAlert = alert ?? completionAlert;

  if (!loaded) {
    return (
      <PageSection>
        <Bullseye>
          <Spinner aria-label={t('Loading Kiali instance')} size="xl" />
        </Bullseye>
      </PageSection>
    );
  }

  if (loadError || !resource) {
    return (
      <PageSection>
        <EmptyState headingLevel="h2" titleText={t('Kiali instance not found')} variant={EmptyStateVariant.lg}>
          <EmptyStateBody>
            {t('Kiali "{{name}}" was not found in namespace "{{namespace}}".', { name, namespace })}
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  const spec = resource.spec;
  const status = resource.status;
  const conditions = status?.conditions ?? [];
  const unavailableReason = getActionUnavailableReason(
    t,
    ossmConsoleStatusUnknown,
    activeOssmConsole,
    canPatchOssmConsole
  );
  const isDisabled = activePendingIntent !== null || unavailableReason !== null;

  const handlePromote = async (): Promise<void> => {
    if (!activeOssmConsole) return;
    setPendingIntent('promote');
    setAlert(null);
    try {
      await promoteToConsole(activeOssmConsole, serviceName, serviceNamespace);
    } catch (err) {
      setPendingIntent(null);
      setAlert({
        message: t('Failed to connect: {{error}}', { error: err instanceof Error ? err.message : String(err) }),
        variant: AlertVariant.danger
      });
    }
  };

  const handleDemote = async (): Promise<void> => {
    if (!activeOssmConsole) return;
    setPendingIntent('demote');
    setAlert(null);
    try {
      await demoteFromConsole(activeOssmConsole);
    } catch (err) {
      setPendingIntent(null);
      setAlert({
        message: t('Failed to disconnect: {{error}}', { error: err instanceof Error ? err.message : String(err) }),
        variant: AlertVariant.danger
      });
    }
  };

  return (
    <>
      <PageSection>
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to="/ossmconsole/kialis">{t('Kiali instances')}</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{`${namespace}/${name}`}</BreadcrumbItem>
        </Breadcrumb>
        <Flex
          alignItems={{ default: 'alignItemsCenter' }}
          justifyContent={{ default: 'justifyContentSpaceBetween' }}
          style={{ marginTop: '1rem' }}
        >
          <FlexItem>
            <Title headingLevel="h1">{name}</Title>
          </FlexItem>
          <FlexItem>
            {(() => {
              const actionButton = promoted ? (
                <Button
                  isAriaDisabled={isDisabled}
                  isLoading={activePendingIntent === 'demote'}
                  onClick={() => void handleDemote()}
                  variant="warning"
                >
                  {activePendingIntent === 'demote' ? t('Disconnecting…') : t('Disconnect')}
                </Button>
              ) : (
                <Button
                  isAriaDisabled={isDisabled}
                  isLoading={activePendingIntent === 'promote'}
                  onClick={() => void handlePromote()}
                  variant="primary"
                >
                  {activePendingIntent === 'promote' ? t('Connecting…') : t('Connect')}
                </Button>
              );
              const actionTooltip = unavailableReason
                ? unavailableReason
                : promoted
                  ? t(
                      'Disconnect this Kiali instance from OpenShift Console. Service mesh information from this instance will no longer appear in the console. Connect another Kiali instance to restore service mesh information in the console.'
                    )
                  : t(
                      'Configure OpenShift Console to use service mesh information from this Kiali instance. This removes service mesh information from any currently connected Kiali instance from the console.'
                    );
              return <Tooltip content={actionTooltip}>{actionButton}</Tooltip>;
            })()}
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection>
        {displayAlert && (
          <Alert
            actionClose={
              <AlertActionCloseButton
                onClose={() => {
                  setAlert(null);
                  if (isOperationComplete) setPendingIntent(null);
                }}
              />
            }
            isInline
            style={{ marginBottom: '1rem' }}
            title={displayAlert.message}
            variant={displayAlert.variant}
          />
        )}

        <Grid hasGutter>
          <GridItem span={5}>
            <Card isCompact>
              <CardBody>
                <DescriptionList columnModifier={{ default: '2Col' }} isCompact>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Version')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>{spec?.version ?? t('Not specified')}</DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Installation Tag')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.installation_tag ?? t('Not specified')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Server Namespace')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.deployment?.namespace ? (
                        <ResourceLink kind="Namespace" name={spec.deployment.namespace} />
                      ) : (
                        t('Not specified')
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Instance Name')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.deployment?.instance_name ?? t('Not specified')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Replicas')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.deployment?.replicas != null ? String(spec.deployment.replicas) : t('Not specified')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Auth Strategy')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.auth?.strategy ?? t('Not specified')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Cluster-wide Access')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.deployment?.cluster_wide_access != null
                        ? String(spec.deployment.cluster_wide_access)
                        : t('Not specified')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('View-only Mode')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.deployment?.view_only_mode != null
                        ? String(spec.deployment.view_only_mode)
                        : t('Not specified')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Web FQDN')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.server?.web_fqdn ?? t('Not specified')}
                    </DescriptionListDescription>
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
                </DescriptionList>
              </CardBody>
            </Card>
          </GridItem>

          <GridItem span={5}>
            <Card isCompact>
              <CardTitle>
                <strong>{t('External Services')}</strong>
              </CardTitle>
              <CardBody>
                <DescriptionList isCompact>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Prometheus')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.external_services?.prometheus?.url ?? t('Not specified')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Grafana')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.external_services?.grafana?.enabled === false
                        ? t('Disabled')
                        : (spec?.external_services?.grafana?.url ?? t('Not specified'))}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Tracing')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec?.external_services?.tracing?.enabled === false
                        ? t('Disabled')
                        : (spec?.external_services?.tracing?.url ?? t('Not specified'))}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </CardBody>
            </Card>
          </GridItem>

          {status?.progress?.message && (
            <GridItem span={5}>
              <Card isCompact>
                <CardTitle>
                  <strong>{t('Reconcile Progress')}</strong>
                </CardTitle>
                <CardBody>{status.progress.message}</CardBody>
              </Card>
            </GridItem>
          )}

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

const KialiDetailPage: FC = () => {
  const { t } = useLiteTranslation();
  const { name, namespace } = useParams<{ name: string; namespace: string }>();

  if (!name || !namespace) {
    return (
      <PageSection>
        <EmptyState headingLevel="h2" titleText={t('Not Found')} variant={EmptyStateVariant.lg}>
          <EmptyStateBody>{t('Invalid URL. Expected /ossmconsole/kialis/:namespace/:name.')}</EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return <KialiDetailContent name={name} namespace={namespace} />;
};

export default KialiDetailPage;
