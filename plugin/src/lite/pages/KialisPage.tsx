import * as React from 'react';
import { useMemo } from 'react';
import type { FC } from 'react';
import { Link } from 'react-router-dom-v5-compat';
import {
  ListPageBody,
  ListPageFilter,
  ListPageHeader,
  TableData,
  Timestamp,
  VirtualizedTable,
  useAccessReview,
  useActiveColumns,
  useK8sWatchResource,
  useListPageFilter
} from '@openshift-console/dynamic-plugin-sdk';
import type { RowProps, TableColumn } from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  AlertActionCloseButton,
  AlertVariant,
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateVariant,
  Tooltip
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { ConsoleConnectionStatus } from '../components/ConsoleConnectionStatus';
import { renderKialiObserveLinks } from '../utils/kialiObserveLinks';
import type { LiteKialiResource } from '../types/kiali';
import { kialiGVK } from '../types/kiali';
import type { LiteOssmConsoleResource } from '../types/ossmconsole';
import { ossmConsoleGVK } from '../types/ossmconsole';
import { useKialiRouteHosts } from '../hooks/useKialiRouteHosts';
import { useConnectDisconnectPending } from '../hooks/useConnectDisconnectPending';
import { getKialiServiceTarget } from '../utils/kialiServiceTarget';
import {
  demoteFromConsole,
  findActiveOssmConsole,
  getActionUnavailableReason,
  isPromoted,
  promoteToConsole
} from '../utils/ossmConsoleUtils';
import { useKialiTranslation } from 'utils/I18nUtils';

export { getKialiServiceTarget };

const compactButtonStyle: React.CSSProperties = {
  fontSize: '0.80rem',
  lineHeight: 1.2,
  minWidth: 0,
  padding: '0.30rem 0.80rem'
};

type PendingAction = { intent: 'demote' | 'promote'; key: string; name: string; namespace: string };

type KialiRowData = {
  activeOssmConsole: LiteOssmConsoleResource | null;
  canPatchOssmConsole: boolean;
  handleDemote: () => Promise<void>;
  handlePromote: (name: string, namespace: string) => Promise<void>;
  ossmConsoleStatusUnknown: boolean;
  pendingKey: string | null;
  routeHostMap: Map<string, string>;
};

function buildColumns(t: (key: string) => string): TableColumn<LiteKialiResource>[] {
  return [
    { id: 'name', sort: 'metadata.name', title: t('Name') },
    { id: 'namespace', sort: 'metadata.namespace', title: t('Namespace') },
    { id: 'serverNamespace', sort: 'spec.deployment.namespace', title: t('Server Namespace') },
    { id: 'version', sort: 'spec.version', title: t('Version') },
    { id: 'observe', title: t('Observe') },
    { id: 'connected', title: t('Connected') },
    { id: 'created', sort: 'metadata.creationTimestamp', title: t('Created') },
    { id: 'actions', title: t('Actions') }
  ];
}

const NoCrdMsg: FC = () => {
  const { t } = useKialiTranslation();
  return (
    <EmptyState
      headingLevel="h2"
      icon={SearchIcon}
      titleText={t('Kiali Operator is not installed')}
      variant={EmptyStateVariant.lg}
    >
      <EmptyStateBody>
        {t('The Kiali custom resource definition was not found on this cluster. Install the Kiali Operator from the')}{' '}
        <a href="/catalog/ns/openshift-operators?keyword=kiali">{t('OperatorHub')}</a> {t('to manage Kiali instances.')}
      </EmptyStateBody>
    </EmptyState>
  );
};

const NoKialisMsg: FC = () => {
  const { t } = useKialiTranslation();
  return (
    <EmptyState
      headingLevel="h2"
      icon={SearchIcon}
      titleText={t('No Kiali instances found')}
      variant={EmptyStateVariant.lg}
    >
      <EmptyStateBody>
        {t('The Kiali Operator is installed but no Kiali instances have been created yet.')}
      </EmptyStateBody>
    </EmptyState>
  );
};

const NoMatchMsg: FC = () => {
  const { t } = useKialiTranslation();
  return (
    <EmptyState variant="xs">
      <EmptyStateBody>{t('No Kiali instances match the current filter.')}</EmptyStateBody>
    </EmptyState>
  );
};

const KialiRow: FC<RowProps<LiteKialiResource, KialiRowData>> = ({ obj, activeColumnIDs, rowData }) => {
  const { t } = useKialiTranslation();
  const crName = obj.metadata?.name ?? '';
  const crNamespace = obj.metadata?.namespace ?? '';
  const { name: serviceName, namespace: serviceNamespace } = getKialiServiceTarget(obj);
  const promoteKey = `${serviceNamespace}/${serviceName}`;
  const promoted =
    rowData && !rowData.ossmConsoleStatusUnknown
      ? isPromoted(rowData.activeOssmConsole, serviceName, serviceNamespace)
      : false;
  const unavailableReason = rowData
    ? getActionUnavailableReason(
        t,
        rowData.ossmConsoleStatusUnknown,
        rowData.activeOssmConsole,
        rowData.canPatchOssmConsole,
        promoted ? undefined : serviceName,
        promoted ? undefined : serviceNamespace
      )
    : null;
  const isPending = rowData?.pendingKey === promoteKey;
  const isDisabled = unavailableReason !== null || rowData?.pendingKey !== null;

  const actionButton = promoted ? (
    <Button
      isAriaDisabled={isDisabled}
      isLoading={isPending}
      onClick={() => void rowData?.handleDemote()}
      size="sm"
      style={compactButtonStyle}
      variant="warning"
    >
      {isPending ? t('Disconnecting…') : t('Disconnect')}
    </Button>
  ) : (
    <Button
      isAriaDisabled={isDisabled}
      isLoading={isPending}
      onClick={() => void rowData?.handlePromote(serviceName, serviceNamespace)}
      size="sm"
      style={compactButtonStyle}
      variant="primary"
    >
      {isPending ? t('Connecting…') : t('Connect')}
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

  return (
    <>
      <TableData activeColumnIDs={activeColumnIDs} id="name">
        <Link to={`/ossmconsole/kialis/${encodeURIComponent(crNamespace)}/${encodeURIComponent(crName)}`}>
          {crName}
        </Link>
      </TableData>
      <TableData activeColumnIDs={activeColumnIDs} id="namespace">
        {crNamespace || '-'}
      </TableData>
      <TableData activeColumnIDs={activeColumnIDs} id="serverNamespace">
        {obj.spec?.deployment?.namespace ?? '-'}
      </TableData>
      <TableData activeColumnIDs={activeColumnIDs} id="version">
        {obj.spec?.version ?? '-'}
      </TableData>
      <TableData activeColumnIDs={activeColumnIDs} id="observe">
        {renderKialiObserveLinks(obj, promoted, rowData?.routeHostMap ?? new Map(), t)}
      </TableData>
      <TableData activeColumnIDs={activeColumnIDs} id="connected">
        <ConsoleConnectionStatus
          active={promoted}
          isCompact
          statusUnknown={rowData?.ossmConsoleStatusUnknown ?? false}
        />
      </TableData>
      <TableData activeColumnIDs={activeColumnIDs} id="created">
        {obj.metadata?.creationTimestamp ? <Timestamp timestamp={obj.metadata.creationTimestamp} /> : '-'}
      </TableData>
      <TableData activeColumnIDs={activeColumnIDs} id="actions">
        <Tooltip content={actionTooltip}>{actionButton}</Tooltip>
      </TableData>
    </>
  );
};

const KialisPage: FC = () => {
  const { t } = useKialiTranslation();
  const [resources, loaded, loadError] = useK8sWatchResource<LiteKialiResource[]>({
    groupVersionKind: kialiGVK,
    isList: true,
    namespaced: true
  });

  const [ossmConsoles, ossmConsolesLoaded, ossmConsolesLoadError] = useK8sWatchResource<LiteOssmConsoleResource[]>({
    groupVersionKind: ossmConsoleGVK,
    isList: true,
    namespaced: true
  });

  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null);
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

  const data = useMemo(() => {
    if (!loaded || loadError || !Array.isArray(resources)) return [];
    return resources;
  }, [resources, loaded, loadError]);

  const routeHostMap = useKialiRouteHosts(data);

  const crdMissing = loaded && !!loadError;

  // The button stays in its "Connecting…"/"Disconnecting…" state until the OSSMConsole watch confirms
  // the change actually took effect (the kiali-operator reconciles asynchronously, which can take
  // anywhere from a few seconds to a few minutes), rather than reverting right after the PATCH
  // call returns, which would make the click look like it did nothing.
  const isOperationComplete =
    pendingAction !== null &&
    !ossmConsoleStatusUnknown &&
    isPromoted(activeOssmConsole, pendingAction.name, pendingAction.namespace) === (pendingAction.intent === 'promote');

  const activePendingAction = isOperationComplete ? null : pendingAction;

  const completionAlert = isOperationComplete
    ? {
        message:
          pendingAction.intent === 'promote'
            ? t('Kiali "{{name}}" is now connected to Console.', { name: pendingAction.name })
            : t('Kiali "{{name}}" has been disconnected from Console.', { name: pendingAction.name }),
        variant: AlertVariant.success
      }
    : null;

  const displayAlert = alert ?? completionAlert;

  const clearPendingAction = React.useCallback(() => setPendingAction(null), []);

  useConnectDisconnectPending({
    isOperationComplete,
    isPending: activePendingAction !== null,
    onTimeout: clearPendingAction,
    setAlert,
    timeoutMessage: t(
      'Timed out waiting for Console integration to update. The operator may still be reconciling — refresh the page to check.'
    )
  });

  const handlePromote = React.useCallback(
    async (name: string, namespace: string): Promise<void> => {
      if (!activeOssmConsole) return;
      setPendingAction({ intent: 'promote', key: `${namespace}/${name}`, name, namespace });
      setAlert(null);
      try {
        await promoteToConsole(activeOssmConsole, name, namespace);
      } catch (err) {
        setPendingAction(null);
        setAlert({
          message: t('Failed to connect: {{error}}', { error: err instanceof Error ? err.message : String(err) }),
          variant: AlertVariant.danger
        });
      }
    },
    [activeOssmConsole, t]
  );

  const handleDemote = React.useCallback(async (): Promise<void> => {
    if (!activeOssmConsole) return;
    const kiali = activeOssmConsole.status?.kiali;
    const name = kiali?.serviceName ?? '';
    const namespace = kiali?.serviceNamespace ?? '';
    setPendingAction({ intent: 'demote', key: `${namespace}/${name}`, name, namespace });
    setAlert(null);
    try {
      await demoteFromConsole(activeOssmConsole);
    } catch (err) {
      setPendingAction(null);
      setAlert({
        message: t('Failed to disconnect: {{error}}', { error: err instanceof Error ? err.message : String(err) }),
        variant: AlertVariant.danger
      });
    }
  }, [activeOssmConsole, t]);

  const columns = useMemo(() => buildColumns(t), [t]);
  const [staticData, filteredData, onFilterChange] = useListPageFilter(data);
  const [activeColumns] = useActiveColumns({
    columnManagementID: 'ossmconsole~kialis',
    columns,
    showNamespaceOverride: false
  });

  const rowData = useMemo<KialiRowData>(
    () => ({
      activeOssmConsole,
      canPatchOssmConsole,
      handleDemote,
      handlePromote,
      ossmConsoleStatusUnknown,
      pendingKey: activePendingAction?.key ?? null,
      routeHostMap
    }),
    [
      activeOssmConsole,
      canPatchOssmConsole,
      handleDemote,
      handlePromote,
      ossmConsoleStatusUnknown,
      activePendingAction,
      routeHostMap
    ]
  );

  return (
    <>
      <ListPageHeader title={t('Kiali instances')} />
      <ListPageBody>
        {displayAlert && (
          <Alert
            actionClose={
              <AlertActionCloseButton
                onClose={() => {
                  setAlert(null);
                  if (isOperationComplete) setPendingAction(null);
                }}
              />
            }
            isInline
            title={displayAlert.message}
            variant={displayAlert.variant}
          />
        )}
        <ListPageFilter data={staticData} hideLabelFilter loaded={loaded} onFilterChange={onFilterChange} />
        <VirtualizedTable<LiteKialiResource, KialiRowData>
          EmptyMsg={NoMatchMsg}
          NoDataEmptyMsg={crdMissing ? NoCrdMsg : NoKialisMsg}
          Row={KialiRow}
          columns={activeColumns}
          data={filteredData}
          loadError={crdMissing ? undefined : loadError}
          loaded={loaded}
          rowData={rowData}
          unfilteredData={data}
        />
      </ListPageBody>
    </>
  );
};

export default KialisPage;
