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
  Divider,
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
import type { ManagedCluster } from '../types/managedCluster';
import { getClusterAvailability, availabilityColor, availabilityLabelKey } from '../types/managedCluster';
import { clusterDetailLink, placementDetailLink } from '../utils/linkUtils';
import { buildMembershipRows, getPlacementProblem } from '../utils/placementSelection';
import { isConditionStale } from '../utils/statusUtils';
import type { Membership, MembershipRow } from '../utils/placementSelection';
import { ConditionsTable } from './ConditionsTable';
import { ControlPlanesCard } from './ControlPlanesCard';
import { MeshStatus } from './MeshStatus';
import { PlacementSummaryCard } from './PlacementSummaryCard';
import { TrustStatusCard } from './TrustStatusCard';
import { VirtualFilterTable } from './VirtualFilterTable';
import type { CategoryLabel, VirtualFilterColumn } from './VirtualFilterTable';
import { useKialiTranslation } from 'utils/I18nUtils';

function conditionMessage(condition: K8sCondition): string {
  if (condition.message) return condition.message;
  if (condition.reason) return condition.reason;
  return condition.status;
}

type ClusterCategory = 'ready' | 'notReady' | 'unknown';

function categorizeCluster(row: MembershipRow): ClusterCategory {
  const op = row.clusterStatus?.conditions?.find(c => c.type === 'OperatorInstalled');
  if (!op) return 'unknown';
  if (op.status === 'True') return 'ready';
  if (op.status === 'Unknown') return 'unknown';
  return 'notReady';
}

const CONFLICT_REASONS = ['OperatorConfigConflict', 'NamespaceConflict'];

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
      <div>{t('Shows whether the Placement decision and MultiClusterMesh status agree for this cluster.')}</div>
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

/** Per-cluster operator status table with filter toggles and search for a single mesh. */
export const ClusterStatusSection: FC<{
  clusterStatuses: ClusterMeshStatus[];
  managedClusterMap?: Map<string, ManagedCluster>;
  managedClustersLoaded?: boolean;
  meshConditions?: K8sCondition[];
  meshGeneration?: number;
  placementProblem?: K8sCondition;
  selectedNames?: string[] | null;
  selectionState?: SelectionState;
}> = ({
  clusterStatuses,
  managedClusterMap,
  managedClustersLoaded = true,
  meshConditions,
  meshGeneration,
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
      { key: 'ready', label: t('Operator installed ({{count}})') },
      { key: 'notReady', label: t('Not installed ({{count}})') },
      { key: 'unknown', label: t('Unknown ({{count}})') }
    ],
    [t]
  );

  const columns = useMemo<VirtualFilterColumn<MembershipRow>[]>(
    () => [
      {
        key: 'cluster',
        label: t('Cluster'),
        render: row => <Link to={clusterDetailLink(row.clusterName)}>{row.clusterName}</Link>,
        width: '22%'
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
        width: '22%'
      },
      {
        key: 'clusterStatus',
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
        width: '18%'
      },
      {
        key: 'operatorStatus',
        label: t('Operator Status'),
        render: row =>
          row.clusterStatus ? (
            <MeshStatus conditions={row.clusterStatus.conditions} conditionType="OperatorInstalled" isCompact />
          ) : (
            '-'
          ),
        width: '18%'
      },
      {
        key: 'message',
        label: t('Message'),
        render: row => {
          const operatorCondition = row.clusterStatus?.conditions?.find(c => c.type === 'OperatorInstalled');
          const msg = operatorCondition ? conditionMessage(operatorCondition) : '-';
          return (
            <Tooltip content={msg}>
              <span>{msg}</span>
            </Tooltip>
          );
        },
        width: '20%'
      }
    ],
    [managedClusterMap, managedClustersLoaded, t]
  );

  if (rows.length === 0) {
    const readyCondition = meshConditions?.find(c => c.type === 'Ready');
    const isConflict =
      readyCondition?.status === 'False' &&
      !isConditionStale(readyCondition, meshGeneration) &&
      CONFLICT_REASONS.includes(readyCondition.reason ?? '');
    let emptyMessage = t('No clusters are part of this mesh yet.');
    if (selectionState === 'missingReference') {
      emptyMessage = t('This mesh does not have a Placement reference.');
    } else if (selectionState === 'missing') {
      emptyMessage = t('The referenced Placement was not found in this mesh namespace.');
    } else if (selectionState === 'forbidden' || selectionState === 'error') {
      emptyMessage = t('Selection details are unavailable. Mesh cluster status remains available when reported.');
    } else if (placementProblem) {
      emptyMessage = placementProblem.message || placementProblem.reason || t('Placement is not satisfied');
    } else if (selectionState === 'loading' || selectionState === 'waiting' || selectionState === 'updating') {
      emptyMessage = t('Waiting for Placement decisions and mesh reconciliation.');
    } else if (isConflict) {
      emptyMessage = t('This mesh is blocked: {{reason}}. Resolve the conflict to allow reconciliation.', {
        reason: readyCondition.message || readyCondition.reason
      });
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
  const placementName = mesh.spec?.placementRef?.name;
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
          meshConditions={mesh.status?.conditions}
          meshGeneration={mesh.metadata?.generation}
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

  const cpNamespace = mesh?.spec?.controlPlane?.namespace || 'istio-system';
  const kialiScopeFilter = useMemo(
    () => clusterNames.map(c => ({ cluster: c, namespace: cpNamespace })),
    [clusterNames, cpNamespace]
  );
  const {
    kialis,
    loaded: discoveredKialisLoaded,
    ossmcs
  } = useDiscoveredKialis(kialiScopeFilter.length > 0 ? kialiScopeFilter : undefined);
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
            <MeshStatus conditions={conditions} conditionType="Ready" />
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
                      <strong>{t('Mesh ID')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {managedPlanes[0]?.meshID ?? `${ns}-${name}`}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Placement')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec.placementRef?.name ? (
                        <Link to={placementDetailLink(ns, spec.placementRef.name)}>{spec.placementRef.name}</Link>
                      ) : (
                        '-'
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Control Plane Namespace')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec.controlPlane?.namespace || 'istio-system'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('cert-manager Issuer')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {issuerName ? `${issuerName} (${issuerRef?.kind || 'Issuer'})` : t('Not configured')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Created')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      <Timestamp timestamp={mesh.metadata?.creationTimestamp ?? ''} />
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
                <Divider style={{ margin: '0.75rem 0' }} />
                <Title headingLevel="h4" size="md" style={{ marginBottom: '0.5rem' }}>
                  {t('OSSM Operator')}
                </Title>
                <DescriptionList isCompact columnModifier={{ default: '2Col' }}>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Namespace')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec.operator?.namespace || t('(platform default)')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Channel')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>{spec.operator?.channel || 'stable'}</DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Source')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec.operator?.source || t('(platform default)')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>
                      <strong>{t('Install Plan Approval')}</strong>
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {spec.operator?.installPlanApproval || 'Automatic'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </CardBody>
            </Card>
          </GridItem>

          <MeshSelectionSection
            key={`${ns}/${spec.placementRef?.name ?? ''}`}
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
