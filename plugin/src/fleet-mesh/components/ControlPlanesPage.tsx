import { useMemo } from 'react';
import type { FC } from 'react';
import { Link } from 'react-router-dom-v5-compat';
import {
  ListPageHeader,
  ListPageBody,
  ListPageFilter,
  VirtualizedTable,
  TableData,
  useListPageFilter,
  useActiveColumns,
  Timestamp
} from '@openshift-console/dynamic-plugin-sdk';
import type { TableColumn, RowProps } from '@openshift-console/dynamic-plugin-sdk';
import { EmptyState, EmptyStateBody, Label } from '@patternfly/react-core';
import { useMultiClusterMeshes } from '../hooks/useMultiClusterMeshes';
import { useDiscoveredControlPlanes } from '../hooks/useDiscoveredControlPlanes';
import { useEnrichedControlPlanes } from '../hooks/useEnrichedControlPlanes';
import { useDiscoveredKialis } from '../hooks/useDiscoveredKialis';
import { useManagedClusterMap } from '../hooks/useManagedClusterMap';
import { buildKialiLinkMap, controlPlaneLinkKey, toControlPlaneLinkTargets } from '../utils/kialiLinkUtils';
import type { EnrichedControlPlane } from '../types/istio';
import type { KialiLink } from '../types/kiali';
import { MeshStatus } from './MeshStatus';
import { getStatusRank } from '../utils/statusUtils';
import { cpTypeSegment } from '../utils/cpTypeSegment';
import { clusterDetailLink } from '../utils/linkUtils';
import { fuzzyCaseInsensitive } from '../utils/filterUtils';
import type { RowSearchFilter } from '../utils/filterUtils';
import { useKialiTranslation } from 'utils/I18nUtils';
import { isObservabilityDataReady } from '../utils/observabilityReady';
import { sortWithComparator } from '../utils/tableCallbacks';
import { renderObservabilityLink } from './ObservabilityLinks';

type ControlPlaneRowData = {
  kialiLinkMap: Map<string, KialiLink[]>;
  observabilityReady: boolean;
};

const compareCpMeshID = (a: EnrichedControlPlane, b: EnrichedControlPlane): number =>
  (a.meshID ?? '').localeCompare(b.meshID ?? '');
const compareCpStatusRank = (a: EnrichedControlPlane, b: EnrichedControlPlane): number =>
  getStatusRank(a.status?.conditions) - getStatusRank(b.status?.conditions);
const cpTypeRank = (cp: EnrichedControlPlane): number => (cp.managedBy ? 0 : cp.meshID ? 1 : 2);
const compareCpType = (a: EnrichedControlPlane, b: EnrichedControlPlane): number => cpTypeRank(a) - cpTypeRank(b);

function buildColumns(t: (key: string) => string): TableColumn<EnrichedControlPlane>[] {
  return [
    {
      title: t('Mesh ID'),
      id: 'meshID',
      sort: (data: EnrichedControlPlane[], dir: string) => sortWithComparator(data, dir, compareCpMeshID)
    },
    {
      title: t('Type'),
      id: 'type',
      sort: (data: EnrichedControlPlane[], dir: string) => sortWithComparator(data, dir, compareCpType)
    },
    { title: t('Name'), id: 'name', sort: 'metadata.name' },
    { title: t('Cluster'), id: 'cluster', sort: 'clusterName' },
    { title: t('Namespace'), id: 'namespace', sort: 'controlPlaneNamespace' },
    { title: t('Version'), id: 'version', sort: 'version' },
    { title: t('Observe'), id: 'observe' },
    { title: t('Created'), id: 'created', sort: 'metadata.creationTimestamp' },
    {
      title: t('Status'),
      id: 'status',
      sort: (data: EnrichedControlPlane[], dir: string) => sortWithComparator(data, dir, compareCpStatusRank)
    }
  ];
}

const NoControlPlanesMsg: FC = () => {
  const { t } = useKialiTranslation();
  return (
    <EmptyState variant="xs">
      <EmptyStateBody>{t('No control planes discovered across the fleet.')}</EmptyStateBody>
    </EmptyState>
  );
};

const NoMatchMsg: FC = () => {
  const { t } = useKialiTranslation();
  return (
    <EmptyState variant="xs">
      <EmptyStateBody>{t('No control planes match the current filter.')}</EmptyStateBody>
    </EmptyState>
  );
};

function renderKialiCell(
  links: KialiLink[] | undefined,
  observabilityReady: boolean,
  t: (key: string) => string
): React.ReactNode {
  if (!observabilityReady) return '-';
  if (!links || links.length === 0) return '-';
  return renderObservabilityLink(links[0], t, { kiali: 'Kiali', ossmc: 'OSSMC' });
}

const ControlPlaneRow: FC<RowProps<EnrichedControlPlane, ControlPlaneRowData>> = ({
  obj,
  activeColumnIDs,
  rowData
}) => {
  const { t } = useKialiTranslation();
  const kialiLinks = rowData?.observabilityReady
    ? rowData.kialiLinkMap.get(controlPlaneLinkKey(obj.clusterName, obj.metadata.name))
    : undefined;
  return (
    <>
      <TableData id="meshID" activeColumnIDs={activeColumnIDs}>
        {obj.managedBy ? (
          <Link
            to={`/fleet-mesh/meshes/managed/${encodeURIComponent(obj.managedBy.namespace)}/${encodeURIComponent(obj.managedBy.name)}`}
          >
            {obj.meshID ?? '-'}
          </Link>
        ) : obj.meshID ? (
          <Link to={`/fleet-mesh/meshes/discovered/${encodeURIComponent(obj.meshID)}`}>{obj.meshID}</Link>
        ) : (
          <span>-</span>
        )}
      </TableData>
      <TableData id="type" activeColumnIDs={activeColumnIDs}>
        {obj.managedBy ? t('Managed') : obj.meshID ? t('Discovered') : t('Standalone')}
      </TableData>
      <TableData id="name" activeColumnIDs={activeColumnIDs}>
        <Link
          to={`/fleet-mesh/control-planes/${cpTypeSegment(obj)}/${encodeURIComponent(obj.clusterName)}/${encodeURIComponent(obj.metadata.name)}`}
        >
          {obj.metadata.name}
        </Link>
      </TableData>
      <TableData id="cluster" activeColumnIDs={activeColumnIDs}>
        <Link to={clusterDetailLink(obj.clusterName)}>{obj.clusterName}</Link>
      </TableData>
      <TableData id="namespace" activeColumnIDs={activeColumnIDs}>
        {obj.controlPlaneNamespace ?? '-'}
      </TableData>
      <TableData id="version" activeColumnIDs={activeColumnIDs}>
        {obj.version ?? '-'}
      </TableData>
      <TableData id="observe" activeColumnIDs={activeColumnIDs}>
        {renderKialiCell(kialiLinks, rowData?.observabilityReady ?? false, t)}
      </TableData>
      <TableData id="created" activeColumnIDs={activeColumnIDs}>
        {obj.metadata.creationTimestamp ? <Timestamp timestamp={obj.metadata.creationTimestamp} /> : '-'}
      </TableData>
      <TableData id="status" activeColumnIDs={activeColumnIDs}>
        {obj.status?.conditions ? (
          <MeshStatus conditions={obj.status.conditions} conditionType="Ready" isCompact />
        ) : (
          <Label color="grey">{t('Unknown')}</Label>
        )}
      </TableData>
    </>
  );
};

function buildSearchFilters(t: (key: string) => string): RowSearchFilter<EnrichedControlPlane>[] {
  return [
    {
      filter: (input, obj) => fuzzyCaseInsensitive(input.selected?.[0], obj.meshID ?? ''),
      filterGroupName: t('Mesh ID'),
      placeholder: t('Filter by mesh ID...'),
      type: 'meshID'
    },
    {
      filter: (input, obj) => {
        const typeLabel = obj.managedBy ? 'managed' : obj.meshID ? 'discovered' : 'standalone';
        return fuzzyCaseInsensitive(input.selected?.[0], typeLabel);
      },
      filterGroupName: t('Type'),
      placeholder: t('Filter by type...'),
      type: 'type'
    },
    {
      filter: (input, obj) => fuzzyCaseInsensitive(input.selected?.[0], obj.clusterName),
      filterGroupName: t('Cluster'),
      placeholder: t('Filter by cluster...'),
      type: 'cluster'
    },
    {
      filter: (input, obj) => fuzzyCaseInsensitive(input.selected?.[0], obj.controlPlaneNamespace ?? ''),
      filterGroupName: t('Namespace'),
      placeholder: t('Filter by namespace...'),
      type: 'namespace'
    },
    {
      filter: (input, obj) => fuzzyCaseInsensitive(input.selected?.[0], obj.version ?? ''),
      filterGroupName: t('Version'),
      placeholder: t('Filter by version...'),
      type: 'version'
    }
  ];
}

const ControlPlanesPage: FC = () => {
  const { t } = useKialiTranslation();
  const { results: searchResults, loaded: searchLoaded, error: searchError } = useDiscoveredControlPlanes();
  const [mcms] = useMultiClusterMeshes();
  const [enrichedPlanes, , , enrichmentError] = useEnrichedControlPlanes(searchResults, mcms ?? []);
  const [managedClusterMap, managedClustersLoaded] = useManagedClusterMap();
  const { kialis, loaded: discoveredKialisLoaded, ossmcs } = useDiscoveredKialis();
  const observabilityReady = isObservabilityDataReady(managedClustersLoaded, discoveredKialisLoaded);
  const kialiLinkMap = useMemo(
    () =>
      observabilityReady
        ? buildKialiLinkMap(kialis, ossmcs, managedClusterMap, toControlPlaneLinkTargets(enrichedPlanes))
        : new Map<string, KialiLink[]>(),
    [enrichedPlanes, kialis, managedClusterMap, observabilityReady, ossmcs]
  );

  const columns = useMemo(() => buildColumns(t), [t]);
  const searchFilters = useMemo(() => buildSearchFilters(t), [t]);
  const [staticData, filteredData, onFilterChange] = useListPageFilter(enrichedPlanes, searchFilters);
  const [activeColumns, userSettingsLoaded] = useActiveColumns({
    columns,
    showNamespaceOverride: false,
    columnManagementID: 'fleet-service-mesh~control-planes'
  });

  return (
    <>
      <ListPageHeader title={t('Control Planes')} />
      <ListPageBody>
        <ListPageFilter
          data={staticData}
          loaded={searchLoaded}
          onFilterChange={onFilterChange}
          rowSearchFilters={searchFilters}
          hideLabelFilter
        />
        {userSettingsLoaded && (
          <VirtualizedTable<EnrichedControlPlane, ControlPlaneRowData>
            data={filteredData}
            unfilteredData={enrichedPlanes}
            loaded={searchLoaded}
            loadError={searchError ?? enrichmentError}
            columns={activeColumns}
            Row={ControlPlaneRow}
            rowData={{ kialiLinkMap, observabilityReady }}
            NoDataEmptyMsg={NoControlPlanesMsg}
            EmptyMsg={NoMatchMsg}
          />
        )}
      </ListPageBody>
    </>
  );
};

/** Fleet-wide list page showing all discovered Istio control planes across managed clusters. */
export default ControlPlanesPage;
