import * as React from 'react';
import {
  Bullseye,
  EmptyState,
  EmptyStateBody,
  EmptyStateVariant,
  PageSection,
  Spinner,
  Title
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { SearchIcon } from '@patternfly/react-icons';
import {
  K8sResourceCommon,
  ResourceLink,
  Timestamp,
  useK8sWatchResource
} from '@openshift-console/dynamic-plugin-sdk';

type IstioResource = K8sResourceCommon & {
  spec?: { namespace?: string };
};

const istioGVK = { group: 'sailoperator.io', version: 'v1', kind: 'Istio' };

const IstiosPage: React.FC = () => {
  const [resources, loaded, loadError] = useK8sWatchResource<IstioResource[]>({
    groupVersionKind: istioGVK,
    isList: true,
    namespaced: false
  });

  const sorted = React.useMemo(() => {
    if (!loaded || loadError || !Array.isArray(resources)) return [];
    return [...resources].sort((a, b) => (a.metadata?.name ?? '').localeCompare(b.metadata?.name ?? ''));
  }, [resources, loaded, loadError]);

  return (
    <>
      <PageSection>
        <Title headingLevel="h1">Istios</Title>
      </PageSection>
      <PageSection>
        {!loaded ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : sorted.length === 0 ? (
          <EmptyState
            headingLevel="h2"
            icon={SearchIcon}
            titleText="No Istio resources found"
            variant={EmptyStateVariant.lg}
          >
            <EmptyStateBody>
              No Istio resources were found on this cluster. The Sail Operator may not be installed, or no Istio
              instances have been created yet.
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <Table aria-label="Istio resources" variant="compact">
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Namespace</Th>
                <Th>Created</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sorted.map(resource => (
                <Tr key={resource.metadata?.name}>
                  <Td>
                    <ResourceLink
                      groupVersionKind={istioGVK}
                      name={resource.metadata?.name}
                    />
                  </Td>
                  <Td>
                    {resource.spec?.namespace && (
                      <ResourceLink kind="Namespace" name={resource.spec.namespace} />
                    )}
                  </Td>
                  <Td>
                    <Timestamp timestamp={resource.metadata?.creationTimestamp ?? ''} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </PageSection>
    </>
  );
};

export default IstiosPage;
