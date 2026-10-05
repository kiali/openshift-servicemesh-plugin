import { useMemo, useCallback } from 'react';
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
  ResourceLink
} from '@openshift-console/dynamic-plugin-sdk';
import type { TableColumn, RowProps } from '@openshift-console/dynamic-plugin-sdk';
import { Alert, EmptyState, EmptyStateBody, Label, Spinner, Tooltip } from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { useFleetMeshItems } from '../hooks/useFleetMeshItems';
import type { FleetMeshItem } from '../types/fleetMesh';
import { MeshStatus } from './MeshStatus';
import { placementGroupVersionKind } from '../types/placement';
import { fuzzyCaseInsensitive } from '../utils/filterUtils';
import type { RowSearchFilter } from '../utils/filterUtils';
import { useKialiTranslation } from 'utils/I18nUtils';
import { sortWithComparator } from '../utils/tableCallbacks';
import { isOssmAcmAddonMissing } from '../../openshift/utils/watchErrors';

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

function buildColumns(t: (key: string) => string): TableColumn<FleetMeshItem>[] {
  return [
    {
      title: t('Mesh ID'),
      id: 'meshID',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshID)
    },
    {
      title: t('Type'),
      id: 'type',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshType)
    },
    {
      title: t('Name'),
      id: 'name',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshName)
    },
    {
      title: t('Namespace'),
      id: 'namespace',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshNamespace)
    },
    {
      title: t('Placement'),
      id: 'placement',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshPlacement)
    },
    {
      title: t('Clusters'),
      header: {
        info: {
          tooltip: t('Managed: clusters in MultiClusterMesh status. Discovered: clusters with observed control planes.')
        }
      },
      id: 'clusters',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshClusterCount)
    },
    {
      title: t('Trust'),
      id: 'trust',
      sort: (data: FleetMeshItem[], dir: string) => sortWithComparator(data, dir, compareMeshTrust)
    },
    {
      title: t('Status'),
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

const MeshRow: FC<RowProps<FleetMeshItem>> = ({ obj, activeColumnIDs }) => {
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
      <TableData id="name" activeColumnIDs={activeColumnIDs}>
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
          <ResourceLink
            groupVersionKind={placementGroupVersionKind}
            name={obj.placementName}
            namespace={obj.placementNamespace}
          />
        ) : (
          '-'
        )}
      </TableData>
      <TableData id="clusters" activeColumnIDs={activeColumnIDs}>
        {obj.clusterCount}
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

function buildSearchFilters(t: (key: string) => string): RowSearchFilter<FleetMeshItem>[] {
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
      filter: (input, obj) => fuzzyCaseInsensitive(input.selected?.[0], obj.placementName ?? ''),
      filterGroupName: t('Placement'),
      placeholder: t('Filter by placement...'),
      type: 'placement'
    }
  ];
}

const ServiceMeshPage: FC = () => {
  const { items, loaded, enrichmentLoaded, enrichmentError, mcmsLoaded, mcmsError, searchLoaded, searchError } =
    useFleetMeshItems();
  const { t } = useKialiTranslation();
  const ossmAcmAddonMissing = isOssmAcmAddonMissing(mcmsLoaded, mcmsError);
  const discoveryError = searchError ?? enrichmentError;
  const columns = useMemo(() => buildColumns(t), [t]);
  const searchFilters = useMemo(() => buildSearchFilters(t), [t]);
  const [staticData, filteredData, onFilterChange] = useListPageFilter(items, searchFilters);
  const [activeColumns, userSettingsLoaded] = useActiveColumns({
    columns,
    showNamespaceOverride: false,
    columnManagementID: 'fleet-service-mesh~placement'
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
          <VirtualizedTable<FleetMeshItem>
            data={filteredData}
            unfilteredData={items}
            loaded={loaded}
            loadError={null}
            columns={activeColumns}
            Row={MeshRow}
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
