import { useMemo, useCallback } from 'react';
import type { FC } from 'react';
import { Link } from 'react-router';
import {
  ListPageHeader,
  ListPageBody,
  ListPageFilter,
  VirtualizedTable,
  TableData,
  useListPageFilter,
  useActiveColumns
} from '@openshift-console/dynamic-plugin-sdk';
import type { TableColumn, RowProps } from '@openshift-console/dynamic-plugin-sdk';
import { Alert, EmptyState, EmptyStateBody, Label, Spinner, Tooltip } from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { useFleetMeshItems } from '../hooks/useFleetMeshItems';
import { useOperatorPresence } from '../hooks/useOperatorPresence';
import type { FleetMeshItem } from '../types/fleetMesh';
import { MeshStatus } from './MeshStatus';
import { placementDetailLink } from '../utils/linkUtils';
import { fuzzyCaseInsensitive } from '../utils/filterUtils';
import type { RowSearchFilter } from '../utils/filterUtils';
import { useKialiTranslation } from 'utils/I18nUtils';
import { sortWithComparator } from '../utils/tableCallbacks';
import { isOssmAcmAddonMissing } from '../../openshift/utils/watchErrors';
import type { OperatorStatusByCluster } from '../utils/operatorPresence';
import { summarizeOperatorStatus } from '../utils/operatorPresence';

const compareMeshClusterCount = (a: FleetMeshItem, b: FleetMeshItem): number => a.clusterCount - b.clusterCount;
const compareMeshPlacement = (a: FleetMeshItem, b: FleetMeshItem): number =>
  `${a.placementNamespace ?? ''}/${a.placementName ?? ''}`.localeCompare(
    `${b.placementNamespace ?? ''}/${b.placementName ?? ''}`
  );
const compareMeshNamespace = (a: FleetMeshItem, b: FleetMeshItem): number =>
  (a.mcmNamespace ?? '').localeCompare(b.mcmNamespace ?? '');
const compareMeshID = (a: FleetMeshItem, b: FleetMeshItem): number => (a.meshID ?? '').localeCompare(b.meshID ?? '');
const compareMeshName = (a: FleetMeshItem, b: FleetMeshItem): number => a.metadata.name.localeCompare(b.metadata.name);
const compareMeshStatusRank = (a: FleetMeshItem, b: FleetMeshItem): number => a.statusRank - b.statusRank;
const compareMeshTrust = (a: FleetMeshItem, b: FleetMeshItem): number =>
  (a.trustIssuer ?? '').localeCompare(b.trustIssuer ?? '');
const compareMeshType = (a: FleetMeshItem, b: FleetMeshItem): number => a.kind.localeCompare(b.kind);

// Must match the columnManagementID passed to useActiveColumns: the column
// management modal writes and useActiveColumns reads the same user preference key.
const COLUMN_MANAGEMENT_ID = 'fleet-service-mesh~meshes';

const hasOperatorData = (item: FleetMeshItem, operatorStatus: OperatorStatusByCluster): boolean =>
  item.kind === 'managed' && !!item.mcm && (item.mcm.status?.clusterStatus ?? []).length > 0 && !!operatorStatus;

const meshOperatorRatio = (item: FleetMeshItem, operatorStatus: OperatorStatusByCluster): number => {
  const clusters = item.mcm?.status?.clusterStatus ?? [];
  if (!hasOperatorData(item, operatorStatus)) return 1;
  return summarizeOperatorStatus(clusters, operatorStatus).installed / clusters.length;
};

// Word the Operator row filter matches. Mirrors MeshOperatorCell exactly so
// filtering for a status always matches the rows that display it — including
// the grey Unknown pill rendered while Search data is unavailable. The valid
// words are listed in the Operator column header tooltip.
const meshOperatorFilterWord = (
  item: FleetMeshItem,
  operatorStatus: OperatorStatusByCluster,
  operatorStatusLoaded: boolean
): string => {
  if (item.kind !== 'managed' || !item.mcm || !operatorStatusLoaded) return '';
  if (!operatorStatus) return 'unknown';
  const clusters = item.mcm.status?.clusterStatus ?? [];
  if (clusters.length === 0) return '';
  const summary = summarizeOperatorStatus(clusters, operatorStatus);
  if (summary.missingClusters.length > 0) return 'missing';
  if (summary.unknownClusters.length > 0) return 'unknown';
  return 'installed';
};

function buildColumns(
  t: (key: string) => string,
  operatorStatus: OperatorStatusByCluster
): TableColumn<FleetMeshItem>[] {
  return [
    {
      title: t('Mesh ID'),
      props: {
        info: {
          tooltip: t(
            'The identity shared by the Istio control planes that make up this mesh. Links to the mesh detail page.'
          )
        }
      },
      id: 'meshID',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshID)
    },
    {
      title: t('Type'),
      props: {
        info: {
          tooltip: t(
            'Managed meshes are created by a MultiClusterMesh resource. Discovered meshes are observed in the fleet without one.'
          )
        }
      },
      id: 'type',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshType)
    },
    {
      title: t('Name'),
      additional: true,
      props: {
        info: {
          tooltip: t(
            'Managed: the MultiClusterMesh name. Discovered: the mesh ID, or the cluster and control plane name for standalone control planes.'
          )
        }
      },
      // Not 'name': the console's column management modal treats the id 'name' as a
      // read-only always-on column, which would make this hidden column untoggleable.
      id: 'meshName',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshName)
    },
    {
      title: t('Namespace'),
      additional: true,
      props: {
        info: {
          tooltip: t(
            'The namespace of the MultiClusterMesh resource on the hub. Discovered meshes are not attached to one.'
          )
        }
      },
      id: 'namespace',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshNamespace)
    },
    {
      title: t('Placement'),
      props: {
        info: {
          tooltip: t(
            'The ACM Placement that selects the member clusters of this managed mesh. Links to the Placement detail page.'
          )
        }
      },
      id: 'placement',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshPlacement)
    },
    {
      title: t('Clusters'),
      props: {
        info: {
          tooltip: t('Managed: clusters in MultiClusterMesh status. Discovered: clusters with observed control planes.')
        }
      },
      id: 'clusters',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshClusterCount)
    },
    {
      title: t('Operator'),
      props: {
        info: {
          tooltip: t(
            'Clusters with the OSSM operator installed, of the clusters in MultiClusterMesh status. To filter by this column, select Operator in the filter dropdown and type installed, missing, or unknown.'
          )
        }
      },
      id: 'operator',
      // Not sortWithComparator: meshes without operator data must sort last in
      // both directions, so the has-data key ignores the direction while the
      // installed ratio respects it.
      sort: (data: FleetMeshItem[], dir: string) => {
        const factor = dir === 'asc' ? 1 : -1;
        return [...data].sort((a, b) => {
          const aData = hasOperatorData(a, operatorStatus);
          const bData = hasOperatorData(b, operatorStatus);
          if (aData !== bData) return aData ? -1 : 1;
          return factor * (meshOperatorRatio(a, operatorStatus) - meshOperatorRatio(b, operatorStatus));
        });
      }
    },
    {
      title: t('Trust'),
      props: {
        info: {
          tooltip: t('Whether CA trust distribution is configured for the mesh through a cert-manager issuer.')
        }
      },
      id: 'trust',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshTrust)
    },
    {
      title: t('Status'),
      props: {
        info: {
          tooltip: t(
            "Managed: the MultiClusterMesh readiness, degraded by unhealthy member control planes. Discovered: the combined health of the mesh's control planes."
          )
        }
      },
      id: 'status',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshStatusRank)
    }
  ];
}

const NoMeshesDefaultMsg: FC = () => {
  const { t } = useKialiTranslation();
  return (
    <EmptyState variant="xs">
      <EmptyStateBody>{t('No managed or discovered meshes found.')}</EmptyStateBody>
    </EmptyState>
  );
};

const NoMatchMsg: FC = () => {
  const { t } = useKialiTranslation();
  return (
    <EmptyState variant="xs">
      <EmptyStateBody>{t('No meshes match the current filter.')}</EmptyStateBody>
    </EmptyState>
  );
};

const MeshOperatorCell: FC<{
  item: FleetMeshItem;
  operatorStatus?: OperatorStatusByCluster;
  operatorStatusLoaded?: boolean;
}> = ({ item, operatorStatus, operatorStatusLoaded = false }) => {
  const { t } = useKialiTranslation();
  if (item.kind !== 'managed' || !item.mcm) return <>-</>;
  if (!operatorStatusLoaded) return <>-</>;
  if (!operatorStatus) {
    return (
      <Label color="grey" isCompact>
        {t('Unknown')}
      </Label>
    );
  }
  const clusters = item.mcm.status?.clusterStatus ?? [];
  if (clusters.length === 0) return <>-</>;
  const summary = summarizeOperatorStatus(clusters, operatorStatus);
  const text = `${summary.installed}/${clusters.length}`;
  const unknownTooltip = t('Operator status could not be determined for: {{clusters}}', {
    clusters: summary.unknownClusters.join(', ')
  });
  if (summary.missingClusters.length > 0) {
    return (
      <Tooltip
        content={
          <>
            <div>{t('OSSM operator missing on: {{clusters}}', { clusters: summary.missingClusters.join(', ') })}</div>
            {summary.unknownClusters.length > 0 && <div>{unknownTooltip}</div>}
          </>
        }
      >
        <Label color="orange" isCompact>
          {text}
        </Label>
      </Tooltip>
    );
  }
  // Grey, not green: not every selected cluster is confirmed, but the count
  // still reports the confirmed ones. Only when no cluster has a definitive
  // status does the pill decline to count.
  if (summary.unknownClusters.length > 0) {
    return (
      <Tooltip content={unknownTooltip}>
        <Label color="grey" isCompact>
          {summary.installed > 0 ? text : t('Unknown')}
        </Label>
      </Tooltip>
    );
  }
  return (
    <Label color="green" isCompact>
      {text}
    </Label>
  );
};

type MeshRowData = {
  operatorStatus?: OperatorStatusByCluster;
  operatorStatusLoaded?: boolean;
};

// Receives the operator data through rowData rather than a closure so the
// component identity is stable: a new Row type on every operator data change
// would remount every row, losing hover and tooltip state.
const MeshRow: FC<RowProps<FleetMeshItem, MeshRowData>> = ({ obj, activeColumnIDs, rowData }) => {
  const { operatorStatus, operatorStatusLoaded = false } = rowData;
  const { t } = useKialiTranslation();
  const isManaged = obj.kind === 'managed';

  const nameContent = obj.metadata.name;

  return (
    <>
      <TableData id="meshID" activeColumnIDs={activeColumnIDs}>
        {obj.meshID ? <Link to={obj.detailLink}>{obj.meshID}</Link> : '-'}
      </TableData>
      <TableData id="type" activeColumnIDs={activeColumnIDs}>
        {isManaged ? t('Managed') : t('Discovered')}
      </TableData>
      <TableData id="meshName" activeColumnIDs={activeColumnIDs}>
        {nameContent}
        {obj.meshIDConflict && (
          <Tooltip content={t('Mesh ID Conflict')}>
            <ExclamationTriangleIcon
              style={{ color: 'var(--pf-v6-global--warning-color--100)', marginLeft: '0.5rem' }}
            />
          </Tooltip>
        )}
      </TableData>
      <TableData id="namespace" activeColumnIDs={activeColumnIDs}>
        {isManaged ? obj.mcmNamespace || '-' : '-'}
      </TableData>
      <TableData id="placement" activeColumnIDs={activeColumnIDs}>
        {isManaged && obj.placementName && obj.placementNamespace ? (
          <Link to={placementDetailLink(obj.placementNamespace, obj.placementName)}>{obj.placementName}</Link>
        ) : (
          '-'
        )}
      </TableData>
      <TableData id="clusters" activeColumnIDs={activeColumnIDs}>
        {obj.clusterCount}
      </TableData>
      <TableData id="operator" activeColumnIDs={activeColumnIDs}>
        <MeshOperatorCell item={obj} operatorStatus={operatorStatus} operatorStatusLoaded={operatorStatusLoaded} />
      </TableData>
      <TableData id="trust" activeColumnIDs={activeColumnIDs}>
        {isManaged ? (
          obj.trustIssuer ? (
            <Label color="green" isCompact>
              {t('Configured')}
            </Label>
          ) : (
            <Label color="grey" isCompact>
              {t('Not configured')}
            </Label>
          )
        ) : (
          '-'
        )}
      </TableData>
      <TableData id="status" activeColumnIDs={activeColumnIDs}>
        {obj.meshIDConflict ? (
          <Label color="red">{t('Mesh ID Conflict')}</Label>
        ) : (
          <MeshStatus conditions={obj.conditions} isCompact />
        )}
      </TableData>
    </>
  );
};

function buildSearchFilters(
  t: (key: string) => string,
  operatorStatus: OperatorStatusByCluster,
  operatorStatusLoaded: boolean
): RowSearchFilter<FleetMeshItem>[] {
  return [
    {
      filter: (input, obj) => fuzzyCaseInsensitive(input.selected?.[0], obj.meshID ?? ''),
      filterGroupName: t('Mesh ID'),
      placeholder: t('Filter by mesh ID...'),
      type: 'meshID'
    },
    {
      filter: (input, obj) => fuzzyCaseInsensitive(input.selected?.[0], obj.kind),
      filterGroupName: t('Type'),
      placeholder: t('Filter by type...'),
      type: 'type'
    },
    {
      filter: (input, obj) =>
        fuzzyCaseInsensitive(input.selected?.[0], meshOperatorFilterWord(obj, operatorStatus, operatorStatusLoaded)),
      filterGroupName: t('Operator'),
      placeholder: t('Filter by operator status...'),
      type: 'operator'
    }
  ];
}

const ServiceMeshPage: FC = () => {
  const { items, loaded, enrichmentLoaded, enrichmentError, mcmsLoaded, mcmsError, searchLoaded, searchError } =
    useFleetMeshItems();
  // Discovered-only fleets never render an operator status; skip its queries.
  const hasManagedMeshes = useMemo(() => items.some(item => item.kind === 'managed'), [items]);
  const { loaded: operatorStatusLoaded, statusByCluster: operatorStatus } = useOperatorPresence(hasManagedMeshes);
  const { t } = useKialiTranslation();
  const ossmAcmAddonMissing = isOssmAcmAddonMissing(mcmsLoaded, mcmsError);
  const discoveryError = searchError ?? enrichmentError;
  const columns = useMemo(() => buildColumns(t, operatorStatus), [t, operatorStatus]);
  const searchFilters = useMemo(
    () => buildSearchFilters(t, operatorStatus, operatorStatusLoaded),
    [t, operatorStatus, operatorStatusLoaded]
  );
  const [staticData, filteredData, onFilterChange] = useListPageFilter(items, searchFilters);
  const [activeColumns, userSettingsLoaded] = useActiveColumns({
    columns,
    showNamespaceOverride: false,
    columnManagementID: COLUMN_MANAGEMENT_ID
  });

  const NoMeshesMsg = useCallback(() => {
    if (discoveryError) {
      return (
        <EmptyState variant="xs">
          <EmptyStateBody>{t('Discovered meshes are unavailable.')}</EmptyStateBody>
        </EmptyState>
      );
    }
    if (!searchLoaded || !enrichmentLoaded) {
      return <Spinner size="md" aria-label={t('Loading discovered meshes')} />;
    }
    if (ossmAcmAddonMissing) {
      return (
        <EmptyState variant="xs">
          <EmptyStateBody>
            {t(
              'OSSM-ACM addon is not installed. Managed meshes are unavailable until the addon controller is installed.'
            )}
          </EmptyStateBody>
        </EmptyState>
      );
    }
    if (mcmsError) {
      return (
        <EmptyState variant="xs">
          <EmptyStateBody>{t('Managed meshes are unavailable. No discovered meshes found.')}</EmptyStateBody>
        </EmptyState>
      );
    }
    return <NoMeshesDefaultMsg />;
  }, [discoveryError, enrichmentLoaded, mcmsError, ossmAcmAddonMissing, searchLoaded, t]);

  return (
    <>
      <ListPageHeader title={t('Meshes')} />
      <ListPageBody>
        {ossmAcmAddonMissing && (
          <Alert variant="info" isInline title={t('OSSM-ACM addon is not installed')} style={{ marginBottom: '1rem' }}>
            {t('Managed meshes require the OSSM-ACM addon controller. Discovered meshes may still appear below.')}
          </Alert>
        )}
        {!!mcmsError && !ossmAcmAddonMissing && (
          <Alert
            variant="warning"
            isInline
            title={t('Unable to load managed meshes. Discovered data is still shown.')}
          />
        )}
        <ListPageFilter
          columnLayout={{
            columns,
            id: COLUMN_MANAGEMENT_ID,
            selectedColumns: new Set(activeColumns.map(col => col.id)),
            // Intentionally different from useActiveColumns' flag above: false
            // there means the Namespace column is not forced into the table
            // (it is user-toggleable), while true here keeps the column
            // management modal from rendering its "only shown in All projects"
            // note, which does not apply to a perspective with no project
            // selector.
            showNamespaceOverride: true,
            type: t('Meshes')
          }}
          data={staticData}
          loaded={loaded}
          onFilterChange={onFilterChange}
          rowSearchFilters={searchFilters}
          hideLabelFilter
        />
        {!!discoveryError && (
          <Alert
            variant="warning"
            isInline
            isPlain
            title={t('Unable to load control plane data. Some meshes may not be shown.')}
            style={{ marginBottom: '1rem' }}
          />
        )}
        {userSettingsLoaded && (
          <VirtualizedTable<FleetMeshItem, MeshRowData>
            data={filteredData}
            unfilteredData={items}
            loaded={loaded}
            loadError={null}
            columns={activeColumns}
            Row={MeshRow}
            rowData={{ operatorStatus, operatorStatusLoaded }}
            NoDataEmptyMsg={NoMeshesMsg}
            EmptyMsg={NoMatchMsg}
          />
        )}
      </ListPageBody>
    </>
  );
};

/** List page showing all managed and discovered fleet meshes. */
export default ServiceMeshPage;
