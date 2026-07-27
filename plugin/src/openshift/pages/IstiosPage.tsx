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
  useK8sWatchResources,
  WatchK8sResources
} from '@openshift-console/dynamic-plugin-sdk';
import { istioResources, referenceFor } from '../utils/IstioResources';

type IstioResource = K8sResourceCommon & {
  _resourceId?: string;
};

const watchConfig: WatchK8sResources<Record<string, K8sResourceCommon[]>> = {};
for (const r of istioResources) {
  watchConfig[r.id] = {
    groupVersionKind: { group: r.group, version: r.version, kind: r.kind },
    isList: true,
    namespaced: true
  };
}

const IstiosPage: React.FC = () => {
  const resources = useK8sWatchResources<Record<string, K8sResourceCommon[]>>(watchConfig);

  const { allResources, loaded } = React.useMemo(() => {
    const items: IstioResource[] = [];
    let allDone = true;

    for (const [id, result] of Object.entries(resources)) {
      if (!result.loaded && !result.loadError) {
        allDone = false;
        continue;
      }
      if (result.loaded && !result.loadError && Array.isArray(result.data)) {
        for (const item of result.data) {
          items.push({ ...item, _resourceId: id });
        }
      }
    }

    items.sort((a, b) => {
      const kindCmp = (a.kind ?? '').localeCompare(b.kind ?? '');
      if (kindCmp !== 0) return kindCmp;
      const nsCmp = (a.metadata?.namespace ?? '').localeCompare(b.metadata?.namespace ?? '');
      if (nsCmp !== 0) return nsCmp;
      return (a.metadata?.name ?? '').localeCompare(b.metadata?.name ?? '');
    });

    return { allResources: items, loaded: allDone };
  }, [resources]);

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
        ) : allResources.length === 0 ? (
          <EmptyState
            headingLevel="h2"
            icon={SearchIcon}
            titleText="No Istio resources found"
            variant={EmptyStateVariant.lg}
          >
            <EmptyStateBody>
              No Istio resources were found on this cluster. Istio CRDs may not be installed, or no resources have been
              created yet.
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <Table aria-label="Istio resources" variant="compact">
            <Thead>
              <Tr>
                <Th>Kind</Th>
                <Th>Name</Th>
                <Th>Namespace</Th>
                <Th>Created</Th>
              </Tr>
            </Thead>
            <Tbody>
              {allResources.map(resource => {
                const gvk = {
                  group: resource.apiVersion?.includes('/') ? resource.apiVersion.split('/')[0] : '',
                  version: resource.apiVersion?.includes('/') ? resource.apiVersion.split('/')[1] : resource.apiVersion ?? '',
                  kind: resource.kind ?? ''
                };
                const ref = referenceFor(gvk);

                return (
                  <Tr key={`${ref}/${resource.metadata?.namespace}/${resource.metadata?.name}`}>
                    <Td>{resource.kind}</Td>
                    <Td>
                      <ResourceLink
                        groupVersionKind={gvk}
                        name={resource.metadata?.name}
                        namespace={resource.metadata?.namespace}
                      />
                    </Td>
                    <Td>
                      {resource.metadata?.namespace && (
                        <ResourceLink kind="Namespace" name={resource.metadata.namespace} />
                      )}
                    </Td>
                    <Td>
                      <Timestamp timestamp={resource.metadata?.creationTimestamp ?? ''} />
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </PageSection>
    </>
  );
};

export default IstiosPage;
