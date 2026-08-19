import React from 'react';
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
  useActiveColumns,
  useK8sWatchResource,
  useListPageFilter
} from '@openshift-console/dynamic-plugin-sdk';
import type { RowProps, TableColumn } from '@openshift-console/dynamic-plugin-sdk';
import { EmptyState, EmptyStateBody, EmptyStateVariant } from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { LiteStatus } from '../components/LiteStatus';
import { OssmOperatorMissingEmptyState } from '../components/OssmOperatorMissingEmptyState';
import type { LiteIstioResource } from '../types/istio';
import { istioGVK } from '../types/istio';
import { useKialiTranslation } from 'utils/I18nUtils';
import { getStatusRank } from '../utils/statusUtils';
import { isMissingModelError } from '../../openshift/utils/watchErrors';

const sortWithComparator = <T,>(data: T[], dir: string, cmp: (a: T, b: T) => number): T[] =>
  [...data].sort((a, b) => (dir === 'asc' ? cmp(a, b) : cmp(b, a)));

const compareStatus = (a: LiteIstioResource, b: LiteIstioResource): number =>
  getStatusRank(a.status?.conditions) - getStatusRank(b.status?.conditions);

function buildColumns(t: (key: string) => string): TableColumn<LiteIstioResource>[] {
  return [
    { id: 'name', sort: 'metadata.name', title: t('Name') },
    { id: 'namespace', sort: 'spec.namespace', title: t('Control Plane NS') },
    { id: 'version', sort: 'spec.version', title: t('Version') },
    { id: 'profile', sort: 'spec.profile', title: t('Profile') },
    { id: 'updateStrategy', sort: 'spec.updateStrategy.type', title: t('Update Strategy') },
    {
      id: 'status',
      sort: (data: LiteIstioResource[], dir: string) => sortWithComparator(data, dir, compareStatus),
      title: t('Status')
    },
    { id: 'created', sort: 'metadata.creationTimestamp', title: t('Created') }
  ];
}

const NoIstiosMsg: FC = () => {
  const { t } = useKialiTranslation();
  return (
    <EmptyState
      headingLevel="h2"
      icon={SearchIcon}
      titleText={t('No Istio control planes found')}
      variant={EmptyStateVariant.lg}
    >
      <EmptyStateBody>
        {t('The OSSM Operator is installed but no Istio control planes have been created yet.')}
      </EmptyStateBody>
    </EmptyState>
  );
};

const NoMatchMsg: FC = () => {
  const { t } = useKialiTranslation();
  return (
    <EmptyState variant="xs">
      <EmptyStateBody>{t('No Istio control planes match the current filter.')}</EmptyStateBody>
    </EmptyState>
  );
};

const IstioRow: FC<RowProps<LiteIstioResource>> = ({ obj, activeColumnIDs }) => (
  <>
    <TableData activeColumnIDs={activeColumnIDs} id="name">
      <Link to={`/ossmconsole/istios/${encodeURIComponent(obj.metadata?.name ?? '')}`}>{obj.metadata?.name ?? ''}</Link>
    </TableData>
    <TableData activeColumnIDs={activeColumnIDs} id="namespace">
      {obj.spec?.namespace ?? '-'}
    </TableData>
    <TableData activeColumnIDs={activeColumnIDs} id="version">
      {obj.spec?.version ?? '-'}
    </TableData>
    <TableData activeColumnIDs={activeColumnIDs} id="profile">
      {obj.spec?.profile ?? '-'}
    </TableData>
    <TableData activeColumnIDs={activeColumnIDs} id="updateStrategy">
      {obj.spec?.updateStrategy?.type ?? '-'}
    </TableData>
    <TableData activeColumnIDs={activeColumnIDs} id="status">
      <LiteStatus conditions={obj.status?.conditions} conditionType="Ready" isCompact />
    </TableData>
    <TableData activeColumnIDs={activeColumnIDs} id="created">
      {obj.metadata?.creationTimestamp ? <Timestamp timestamp={obj.metadata.creationTimestamp} /> : '-'}
    </TableData>
  </>
);

const IstiosPage: FC = () => {
  const { t } = useKialiTranslation();
  const [resources, loaded, loadError] = useK8sWatchResource<LiteIstioResource[]>({
    groupVersionKind: istioGVK,
    isList: true,
    namespaced: false
  });

  const data = useMemo(() => {
    if (!loaded || loadError || !Array.isArray(resources)) return [];
    return resources;
  }, [resources, loaded, loadError]);

  const ossmOperatorMissing = loaded && !!loadError && isMissingModelError(loadError);

  const columns = useMemo(() => buildColumns(t), [t]);
  const [staticData, filteredData, onFilterChange] = useListPageFilter(data);
  const [activeColumns] = useActiveColumns({
    columnManagementID: 'ossmconsole~istios',
    columns,
    showNamespaceOverride: false
  });

  return (
    <>
      <ListPageHeader title={t('Istios')} />
      <ListPageBody>
        <ListPageFilter data={staticData} hideLabelFilter loaded={loaded} onFilterChange={onFilterChange} />
        <VirtualizedTable<LiteIstioResource>
          EmptyMsg={NoMatchMsg}
          NoDataEmptyMsg={ossmOperatorMissing ? OssmOperatorMissingEmptyState : NoIstiosMsg}
          Row={IstioRow}
          columns={activeColumns}
          data={filteredData}
          loadError={ossmOperatorMissing ? undefined : loadError}
          loaded={loaded}
          unfilteredData={data}
        />
      </ListPageBody>
    </>
  );
};

export default IstiosPage;
