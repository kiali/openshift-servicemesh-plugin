import type { FC } from 'react';
import { Link } from 'react-router-dom-v5-compat';
import {
  Alert,
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Tooltip
} from '@patternfly/react-core';
import type { MeshPlacementResult, SelectionState } from '../hooks/useMeshPlacement';
import type { ClusterMeshStatus } from '../types/multiClusterMesh';
import type { K8sCondition } from '../types/common';
import type { Placement } from '../types/placement';
import { getPlacementProblem, operatorInstalledCount } from '../utils/placementSelection';
import { isConditionStale } from '../utils/statusUtils';
import { placementDetailLink } from '../utils/linkUtils';
import { useKialiTranslation } from 'utils/I18nUtils';

interface PlacementSummaryCardProps {
  clusterStatuses: ClusterMeshStatus[];
  meshConditions?: K8sCondition[];
  meshGeneration?: number;
  namespace: string;
  placementName?: string;
  result: MeshPlacementResult;
  sharedMeshCount: number;
}

function selectionStateLabel(state: SelectionState, t: (key: string) => string): string {
  switch (state) {
    case 'error':
      return t('Cannot load placement decisions');
    case 'forbidden':
      return t('Access to Placement decisions is denied');
    case 'loading':
      return t('Placement decisions are currently loading');
    case 'missing':
      return t('Placement not found');
    case 'missingReference':
      return t('Placement reference missing');
    case 'ready':
      return t('Placement decisions are up to date');
    case 'updating':
      return t('Placement decisions are updating');
    case 'waiting':
      return t('Waiting for placement decisions');
  }
}

function selectionPolicy(spec: Placement['spec'], t: (key: string, options?: { count: number }) => string): string {
  if (!spec) return '-';
  const details: string[] = [];
  const target = spec.numberOfClusters;
  details.push(
    typeof target === 'number' ? t('Target clusters: {{count}}', { count: target }) : t('All eligible clusters')
  );
  const predicates = spec.predicates;
  if (Array.isArray(predicates) && predicates.length > 0) {
    details.push(t('Predicates configured; view Placement YAML'));
  }
  if (Array.isArray(spec.tolerations) && spec.tolerations.length > 0) details.push(t('Tolerations configured'));
  if (spec.prioritizerPolicy && Object.keys(spec.prioritizerPolicy).length > 0)
    details.push(t('Prioritizers configured'));
  if (spec.spreadPolicy && Object.keys(spec.spreadPolicy).length > 0) details.push(t('Spread policy configured'));
  if (spec.decisionStrategy && Object.keys(spec.decisionStrategy).length > 0)
    details.push(t('Decision groups configured'));
  return details.join(' · ');
}

/** Selection data belongs to ACM; MCM status remains the operational mesh view. */
export const PlacementSummaryCard: FC<PlacementSummaryCardProps> = ({
  clusterStatuses,
  meshConditions,
  meshGeneration,
  namespace,
  placementName,
  result,
  sharedMeshCount
}) => {
  const { t } = useKialiTranslation();
  const condition =
    result.placementLoaded && !result.placementError ? getPlacementProblem(result.placement) : undefined;
  const misconfigured = condition?.type === 'PlacementMisconfigured';
  const readyCondition = meshConditions?.find(c => c.type === 'Ready');
  const meshStatusStale = isConditionStale(readyCondition, meshGeneration);
  const diagnostic =
    result.state === 'missing'
      ? t('Create the referenced Placement in this mesh namespace, or update the mesh reference.')
      : result.state === 'forbidden'
        ? t(
            'You cannot read the Placement or its decisions in this namespace. Mesh operational data remains available.'
          )
        : result.state === 'error'
          ? t('Unable to read selection details. Mesh operational data remains available.')
          : result.state === 'updating'
            ? t(
                'Placement selection is updating. Membership will appear when its status and decisions are current and consistent.'
              )
            : result.state === 'waiting'
              ? t('Waiting for ACM to publish Placement decisions.')
              : undefined;

  return (
    <Card isCompact data-test="placement-summary-card">
      <CardTitle>
        <strong>{t('Cluster selection')}</strong>
      </CardTitle>
      <CardBody>
        <DescriptionList isCompact columnModifier={{ default: '2Col' }}>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <Tooltip content={t('The Placement resource that determines which clusters are selected for this mesh.')}>
                <span>{t('Placement')}</span>
              </Tooltip>
            </DescriptionListTerm>
            <DescriptionListDescription>
              {placementName ? <Link to={placementDetailLink(namespace, placementName)}>{placementName}</Link> : '-'}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <Tooltip content={t('Shows whether current Placement decisions are available and up to date.')}>
                <span>{t('Selection status')}</span>
              </Tooltip>
            </DescriptionListTerm>
            <DescriptionListDescription>
              {result.state === 'ready' && condition
                ? misconfigured
                  ? t('Placement misconfigured')
                  : t('Placement unsatisfied')
                : selectionStateLabel(result.state, t)}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <Tooltip
                content={t(
                  'The number of clusters currently selected by this Placement. These are the intended deployment targets.'
                )}
              >
                <span>{t('Placement selection')}</span>
              </Tooltip>
            </DescriptionListTerm>
            <DescriptionListDescription data-test="placement-selected-count">
              {result.selectedNames?.length ?? t('Unavailable')}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <Tooltip
                content={t(
                  'The number of clusters that MultiClusterMesh status reports as deployed. This can temporarily differ from Placement selection while deployment or removal is in progress.'
                )}
              >
                <span>{t('Deployed clusters')}</span>
              </Tooltip>
            </DescriptionListTerm>
            <DescriptionListDescription data-test="placement-mesh-count">
              {clusterStatuses.length}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <Tooltip
                content={t(
                  'The number of deployed clusters whose MultiClusterMesh status reports the OSSM operator as installed.'
                )}
              >
                <span>{t('Operator installed')}</span>
              </Tooltip>
            </DescriptionListTerm>
            <DescriptionListDescription data-test="placement-operator-installed-count">
              {operatorInstalledCount(clusterStatuses)}
            </DescriptionListDescription>
          </DescriptionListGroup>
          {result.placement && (
            <DescriptionListGroup>
              <DescriptionListTerm>
                <Tooltip
                  content={t(
                    'A summary of the rules this Placement uses to select clusters. View the Placement for complete policy details.'
                  )}
                >
                  <span>{t('Selection policy')}</span>
                </Tooltip>
              </DescriptionListTerm>
              <DescriptionListDescription>{selectionPolicy(result.placement.spec, t)}</DescriptionListDescription>
            </DescriptionListGroup>
          )}
        </DescriptionList>
        {diagnostic && <Alert variant="warning" isInline title={diagnostic} style={{ marginTop: '1rem' }} />}
        {meshStatusStale && (
          <Alert
            variant="info"
            isInline
            title={t('Mesh status is updating for the latest Placement reference.')}
            style={{ marginTop: '1rem' }}
          />
        )}
        {condition && (
          <Alert
            variant={misconfigured ? 'danger' : 'warning'}
            isInline
            title={condition.message || condition.reason || t('Placement is not satisfied')}
            style={{ marginTop: '1rem' }}
          >
            {condition.reason === 'NoManagedClusterSetBindings' &&
              t('Create a ManagedClusterSetBinding for the required ClusterSet in this mesh namespace.')}
          </Alert>
        )}
        {sharedMeshCount > 1 && (
          <Alert
            variant="info"
            isInline
            title={t('This Placement is shared by {{count}} meshes.', { count: sharedMeshCount })}
            style={{ marginTop: '1rem' }}
          />
        )}
      </CardBody>
    </Card>
  );
};
