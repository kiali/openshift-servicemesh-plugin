import { useMemo } from 'react';
import type { FC, ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom-v5-compat';
import { useK8sWatchResource, Timestamp } from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Grid,
  GridItem,
  Label,
  PageSection,
  Spinner,
  Title,
  Tooltip
} from '@patternfly/react-core';
import type { MultiClusterMesh, ClusterMeshStatus } from '../types/multiClusterMesh';
import type { K8sCondition } from '../types/common';
import { multiClusterMeshGroupVersionKind } from '../types/multiClusterMesh';
import { useMultiClusterMeshes } from '../hooks/useMultiClusterMeshes';
import { useMeshControlPlanes } from '../hooks/useMeshControlPlanes';
import { useManagedClusterMap } from '../hooks/useManagedClusterMap';
import { useDiscoveredKialis } from '../hooks/useDiscoveredKialis';
import { useMeshPlacement } from '../hooks/useMeshPlacement';
import type { SelectionState } from '../hooks/useMeshPlacement';
import { buildKialiLinkMap, toControlPlaneLinkTargets } from '../utils/kialiLinkUtils';
import { isObservabilityDataReady } from '../utils/observabilityReady';
import { mergeManagedMeshStatus } from '../utils/worstConditions';
import type { ManagedCluster } from '../types/managedCluster';
import { getClusterAvailability, availabilityColor, availabilityLabelKey } from '../types/managedCluster';
import { clusterDetailLink } from '../utils/linkUtils';
import { buildMembershipRows, getPlacementProblem } from '../utils/placementSelection';
import type { Membership, MembershipRow } from '../utils/placementSelection';
import { ConditionsTable } from './ConditionsTable';
import { ControlPlanesCard } from './ControlPlanesCard';
import { MeshStatus } from './MeshStatus';
import { PlacementSummaryCard } from './PlacementSummaryCard';
import { TrustStatusCard } from './TrustStatusCard';
import { VirtualFilterTable } from './VirtualFilterTable';
import type { CategoryLabel, VirtualFilterColumn } from './VirtualFilterTable';
import { useKialiTranslation } from 'utils/I18nUtils';

type ClusterCategory = 'inSync' | 'pendingDeployment' | 'pendingRemoval' | 'unavailable';

function categorizeCluster(row: MembershipRow): ClusterCategory {
  switch (row.membership) {
    case 'meshOnly':
      return 'pendingRemoval';
    case 'selectedAndMesh':
      return 'inSync';
    case 'selectedOnly':
      return 'pendingDeployment';
    case 'selectionUnavailable':
      return 'unavailable';
  }
}

function syncStatusLabel(membership: Membership, t: (key: string) => string): string {
  switch (membership) {
    case 'meshOnly':
      return t('Pending Removal');
    case 'selectedAndMesh':
      return t('In Sync');
    case 'selectedOnly':
      return t('Pending Deployment');
    case 'selectionUnavailable':
      return t('Sync Status Unavailable');
  }
}

function syncStatusTooltip(membership: Membership, t: (key: string) => string): string {
  switch (membership) {
    case 'meshOnly':
      return t(
        'MultiClusterMesh status still reports this cluster as deployed, but the Placement no longer selects it.'
      );
    case 'selectedAndMesh':
      return t('The Placement selects this cluster, and MultiClusterMesh status reports that it is deployed there.');
    case 'selectedOnly':
      return t('The Placement selects this cluster, but MultiClusterMesh status does not yet report it as deployed.');
    case 'selectionUnavailable':
      return t(
        'The current Placement selection cannot be determined because it is loading, changing, unavailable, or inaccessible.'
      );
  }
}

function syncStatusHeaderTooltip(t: (key: string) => string): ReactNode {
  return (
    <div>
      <div>{t('Shows whether the Placement selection and MultiClusterMesh status agree for this cluster.')}</div>
      <div style={{ marginTop: '0.5rem' }}>
        <div>
          <strong>{t('In Sync')}:</strong> {t('both report the cluster as deployed.')}
        </div>
        <div>
          <strong>{t('Pending Deployment')}:</strong> {t('selected by Placement, not yet reported as deployed.')}
        </div>
        <div>
          <strong>{t('Pending Removal')}:</strong> {t('no longer selected, but still reported as deployed.')}
        </div>
        <div>
          <strong>{t('Sync Status Unavailable')}:</strong> {t('current Placement selection cannot be determined.')}
        </div>
      </div>
    </div>
  );
}

/** Per-cluster membership table with filter toggles and search for a single mesh. */
export const ClusterStatusSection: FC<{
  clusterStatuses: ClusterMeshStatus[];
  managedClusterMap?: Map<string, ManagedCluster>;
  managedClustersLoaded?: boolean;
  placementProblem?: K8sCondition;
  selectedNames?: string[] | null;
  selectionState?: SelectionState;
}> = ({
  clusterStatuses,
  managedClusterMap,
  managedClustersLoaded = true,
  placementProblem,
  selectedNames,
  selectionState
}) => {
  const { t } = useKialiTranslation();
  const rows = useMemo(
    () => buildMembershipRows(selectedNames ?? null, clusterStatuses),
    [selectedNames, clusterStatuses]
  );
  const categoryLabels = useMemo<CategoryLabel[]>(
    () => [
      { key: 'all', label: t('All ({{count}})') },
      { key: 'inSync', label: t('In Sync ({{count}})') },
      { key: 'pendingDeployment', label: t('Pending Deployment ({{count}})') },
      { key: 'pendingRemoval', label: t('Pending Removal ({{count}})') },
      { key: 'unavailable', label: t('Sync Status Unavailable ({{count}})') }
    ],
    [t]
  );

  const columns = useMemo<VirtualFilterColumn<MembershipRow>[]>(
    () => [
      {
        key: 'cluster',
        headerTooltip: t('The managed cluster this row applies to. Links to the ACM cluster detail page.'),
        label: t('Cluster'),
        render: row => <Link to={clusterDetailLink(row.clusterName)}>{row.clusterName}</Link>,
        width: '30%'
      },
      {
        key: 'membership',
        headerTooltip: syncStatusHeaderTooltip(t),
        label: t('Sync Status'),
        render: row => (
          <Tooltip content={syncStatusTooltip(row.membership, t)}>
            <span>{syncStatusLabel(row.membership, t)}</span>
          </Tooltip>
        ),
        width: '35%'
      },
      {
        key: 'clusterStatus',
        headerTooltip: t('The availability of the managed cluster, as reported by ACM.'),
        label: t('Cluster Status'),
        render: row => {
          if (!managedClustersLoaded) return '-';
          const availability = getClusterAvailability(managedClusterMap?.get(row.clusterName));
          return (
            <Label color={availabilityColor(availability)} isCompact>
              {t(availabilityLabelKey(availability))}
            </Label>
          );
        },
        width: '35%'
      }
    ],
    [managedClusterMap, managedClustersLoaded, t]
  );

  if (rows.length === 0) {
    let emptyMessage = t('No clusters are part of this mesh yet.');
    if (selectionState === 'missing') {
      emptyMessage = t('The referenced Placement was not found in this mesh namespace.');
    } else if (selectionState === 'forbidden' || selectionState === 'error') {
      emptyMessage = t('Selection details are unavailable. Mesh cluster status remains available when reported.');
    } else if (placementProblem) {
      emptyMessage = placementProblem.message || placementProblem.reason || t('Placement is not satisfied');
    } else if (selectionState === 'loading' || selectionState === 'waiting' || selectionState === 'updating') {
      emptyMessage = t('Waiting for Placement decisions and mesh reconciliation.');
    } else if (selectionState === 'ready' && selectedNames?.length === 0) {
      emptyMessage = t('The Placement currently selects no clusters.');
    }
    return (
      <Card isCompact>
        <CardTitle>
          <strong>{t('Clusters (0)')}</strong>
        </CardTitle>
        <CardBody>
          <EmptyState variant="xs">
            <EmptyStateBody>{emptyMessage}</EmptyStateBody>
          </EmptyState>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card isCompact>
      <CardTitle>
        <strong>{t('Clusters ({{count}})', { count: rows.length })}</strong>
      </CardTitle>
      <CardBody>
        <VirtualFilterTable
          categorize={categorizeCluster}
          categoryLabels={categoryLabels}
          columns={columns}
          emptyMessage={t('No clusters match the current filter.')}
          items={rows}
          rowKey={row => row.clusterName}
          searchMatch={(row, query) => row.clusterName.toLowerCase().includes(query.toLowerCase())}
          searchPlaceholder={t('Filter by cluster name')}
        />
      </CardBody>
    </Card>
  );
};

const MeshSelectionSection: FC<{
  managedClusterMap: Map<string, ManagedCluster>;
  managedClustersLoaded: boolean;
  mcms: MultiClusterMesh[];
  mesh: MultiClusterMesh;
  namespace: string;
}> = ({ managedClusterMap, managedClustersLoaded, mcms, mesh, namespace }) => {
  const placementName = mesh.spec.placementRef.name;
  const result = useMeshPlacement(namespace, placementName);
  const clusterStatuses = mesh.status?.clusterStatus ?? [];
  const sharedMeshCount = Math.max(
    1,
    mcms.filter(mcm => mcm.metadata?.namespace === namespace && mcm.spec?.placementRef?.name === placementName).length
  );

  return (
    <>
      <GridItem span={12}>
        <PlacementSummaryCard
          clusterStatuses={clusterStatuses}
          meshConditions={mesh.status?.conditions}
          meshGeneration={mesh.metadata?.generation}
          namespace={namespace}
          placementName={placementName}
          result={result}
          sharedMeshCount={sharedMeshCount}
        />
      </GridItem>
      <GridItem span={12}>
        <ClusterStatusSection
          clusterStatuses={clusterStatuses}
          managedClusterMap={managedClusterMap}
          managedClustersLoaded={managedClustersLoaded}
          placementProblem={
            result.placementLoaded && !result.placementError ? getPlacementProblem(result.placement) : undefined
          }
          selectedNames={result.selectedNames}
          selectionState={result.state}
        />
      </GridItem>
    </>
  );
};

const MeshDetailContent: FC<{ name: string; ns: string }> = ({ ns, name }) => {
  const { t } = useKialiTranslation();
  const [mesh, loaded, loadError] = useK8sWatchResource<MultiClusterMesh>({
    groupVersionKind: multiClusterMeshGroupVersionKind,
    name,
    namespace: ns
  });
  const [mcms] = useMultiClusterMeshes();
  const [managedClusterMap, managedClustersLoaded] = useManagedClusterMap();
  const clusterNames = useMemo(() => (mesh?.status?.clusterStatus ?? []).map(cs => cs.clusterName), [mesh]);
  const [enrichedPlanes, , enrichmentError] = useMeshControlPlanes(clusterNames, mcms ?? []);
  const managedPlanes = useMemo(
    () => enrichedPlanes.filter(cp => cp.managedBy?.name === name && cp.managedBy?.namespace === ns),
    [enrichedPlanes, name, ns]
  );

  // The controller publishes the derived control plane namespace only after the first
  // reconcile, so Kiali discovery is deferred until it (and the cluster list) exist.
  const cpNamespace = mesh?.status?.controlPlaneNamespace;
  const kialiScopeFilter = useMemo(
    () => (cpNamespace ? clusterNames.map(c => ({ cluster: c, namespace: cpNamespace })) : undefined),
    [clusterNames, cpNamespace]
  );
  const { kialis, loaded: discoveredKialisLoaded, ossmcs } = useDiscoveredKialis(kialiScopeFilter);
  const observabilityReady = isObservabilityDataReady(managedClustersLoaded, discoveredKialisLoaded);
  const kialiLinkMap = useMemo(
    () =>
      observabilityReady
        ? buildKialiLinkMap(kialis, ossmcs, managedClusterMap, toControlPlaneLinkTargets(managedPlanes))
        : new Map(),
    [kialis, managedClusterMap, managedPlanes, observabilityReady, ossmcs]
  );

  if (loadError) {
    return (
      <PageSection>
        <EmptyState>
          <Title headingLevel="h2" size="lg">
            {t('Error loading mesh')}
          </Title>
          <EmptyStateBody>{t('An unexpected error occurred.')}</EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  if (!loaded) {
    return (
      <PageSection>
        <Spinner aria-label={t('Loading mesh details')} />
      </PageSection>
    );
  }

  if (!mesh) {
    return (
      <PageSection>
        <EmptyState>
          <Title headingLevel="h2" size="lg">
            {t('Mesh not found')}
          </Title>
          <EmptyStateBody>
            {t('MultiClusterMesh "{{name}}" was not found in namespace "{{ns}}".', { name, ns })}
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  const spec = mesh.spec;
  const status = mesh.status;
  const clusterStatuses = status?.clusterStatus ?? [];
  const conditions = status?.conditions ?? [];
  // Header status mirrors the merged status shown on the Meshes list and
  // Overview: MCM status worsened by unhealthy member control planes. The
  // Conditions card below keeps the raw MCM conditions.
  const { conditions: mergedConditions } = mergeManagedMeshStatus(status?.conditions, managedPlanes);
  const issuerRef = spec.security?.trust?.certManager?.issuerRef;
  const issuerName = issuerRef?.name;

  return (
    <>
      <PageSection>
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to="/fleet-mesh/meshes">{t('Meshes')}</Link>
          </BreadcrumbItem>
          <BreadcrumbItem>{t('Managed')}</BreadcrumbItem>
          <BreadcrumbItem isActive>{mesh.metadata?.name}</BreadcrumbItem>
        </Breadcrumb>
        <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginTop: '1rem' }}>
          <FlexItem>
            <Title headingLevel="h1">{mesh.metadata?.name}</Title>
          </FlexItem>
          <FlexItem>{ns}</FlexItem>
          <FlexItem>
            <MeshStatus conditions={mergedConditions} conditionType="Ready" />
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection>
        <Grid hasGutter>
          {!!enrichmentError && (
            <GridItem span={12}>
              <Alert
                variant="warning"
                isInline
                title={t('Unable to load control plane data. Some information may be incomplete.')}
              />
            </GridItem>
          )}

          <GridItem span={12}>
            <Card isCompact>
              <CardBody>
                <DescriptionList isCompact columnModifier={{ default: '2Col' }}>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <Tooltip content={t('The identity shared by the Istio control planes that make up this mesh.')}>
                        <span>
                          <strong>{t('Mesh ID')}</strong>
                        </span>
                      </Tooltip>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {managedPlanes[0]?.meshID ?? `${ns}-${name}`}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <Tooltip
                        content={t(
                          'The namespace where the mesh control plane runs on each selected cluster. The add-on controller derives it and reports it in the mesh status.'
                        )}
                      >
                        <span>
                          <strong>{t('Control Plane Namespace')}</strong>
                        </span>
                      </Tooltip>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {status?.controlPlaneNamespace || t('Not yet reconciled')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <Tooltip
                        content={t(
                          'The cert-manager issuer that signs the root CA distributed to the clusters in this mesh. Empty means trust distribution is not configured.'
                        )}
                      >
                        <span>
                          <strong>{t('cert-manager Issuer')}</strong>
                        </span>
                      </Tooltip>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {issuerName ? `${issuerName} (${issuerRef?.kind || 'Issuer'})` : t('Not configured')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <Tooltip content={t('When the MultiClusterMesh resource was created.')}>
                        <span>
                          <strong>{t('Created')}</strong>
                        </span>
                      </Tooltip>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      <Timestamp timestamp={mesh.metadata?.creationTimestamp ?? ''} />
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </CardBody>
            </Card>
          </GridItem>

          <MeshSelectionSection
            key={`${ns}/${spec.placementRef.name}`}
            managedClusterMap={managedClusterMap}
            managedClustersLoaded={managedClustersLoaded}
            mcms={mcms ?? []}
            mesh={mesh}
            namespace={ns}
          />

          <GridItem span={12}>
            <ControlPlanesCard kialiLinks={kialiLinkMap} planes={managedPlanes} />
          </GridItem>

          <GridItem span={12}>
            <TrustStatusCard
              clusterStatuses={clusterStatuses}
              issuerName={issuerName ?? ''}
              meshName={mesh.metadata?.name ?? ''}
              meshNamespace={ns}
            />
          </GridItem>

          {conditions.length > 0 && (
            <GridItem span={12}>
              <Card isCompact>
                <CardTitle>
                  <strong>{t('Conditions')}</strong>
                </CardTitle>
                <CardBody>
                  <ConditionsTable conditions={conditions} />
                </CardBody>
              </Card>
            </GridItem>
          )}
        </Grid>
      </PageSection>
    </>
  );
};

const MeshDetailPage: FC = () => {
  const { t } = useKialiTranslation();
  const { ns, name } = useParams<{ name: string; ns: string }>();

  if (!ns || !name) {
    return (
      <PageSection>
        <EmptyState>
          <Title headingLevel="h2" size="lg">
            {t('Not Found')}
          </Title>
          <EmptyStateBody>
            {t('Invalid mesh URL. Expected /fleet-mesh/meshes/managed/:namespace/:name.')}
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return <MeshDetailContent ns={ns} name={name} />;
};

/** Detail page for a single MultiClusterMesh, reached via /fleet-mesh/meshes/managed/:ns/:name. */
export default MeshDetailPage;
