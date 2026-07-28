import * as React from 'react';
import {
  Alert,
  AlertActionCloseButton,
  AlertVariant,
  Bullseye,
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateVariant,
  PageSection,
  Spinner,
  Title
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { CheckCircleIcon, SearchIcon } from '@patternfly/react-icons';
import {
  K8sResourceCommon,
  ResourceLink,
  Timestamp,
  consoleFetch,
  useK8sWatchResource
} from '@openshift-console/dynamic-plugin-sdk';

const kialiGVK = { group: 'kiali.io', version: 'v1alpha1', kind: 'Kiali' };
const CONSOLE_PLUGIN_URL = '/api/kubernetes/apis/console.openshift.io/v1/consoleplugins/ossmconsole';
const PROXY_ALIAS = 'kiali';
const KIALI_PORT = 20001;

type ProxyEntry = {
  alias: string;
  endpoint: {
    type: string;
    service: { name: string; namespace: string; port: number };
  };
};

type ConsolePluginResource = K8sResourceCommon & {
  spec?: { proxy?: ProxyEntry[] };
};

const promoteToConsole = async (name: string, namespace: string): Promise<void> => {
  const patch = {
    spec: {
      proxy: [
        {
          alias: PROXY_ALIAS,
          endpoint: {
            type: 'Service',
            service: { name, namespace, port: KIALI_PORT }
          },
          authorization: 'UserToken'
        }
      ]
    }
  };

  await consoleFetch(CONSOLE_PLUGIN_URL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/merge-patch+json' },
    body: JSON.stringify(patch)
  });
};

const isPromoted = (plugin: ConsolePluginResource | null, name: string, namespace: string): boolean => {
  const proxy = plugin?.spec?.proxy?.find(p => p.alias === PROXY_ALIAS);
  if (!proxy) return false;
  const svc = proxy.endpoint?.service;
  return svc?.name === name && svc?.namespace === namespace;
};

const KialisPage: React.FC = () => {
  const [resources, loaded, loadError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: kialiGVK,
    isList: true,
    namespaced: true
  });

  const [plugin, setPlugin] = React.useState<ConsolePluginResource | null>(null);
  const [promoting, setPromoting] = React.useState<string | null>(null);
  const [alert, setAlert] = React.useState<{ variant: AlertVariant; message: string } | null>(null);

  const fetchPlugin = React.useCallback(async () => {
    try {
      const response = await consoleFetch(CONSOLE_PLUGIN_URL);
      const data = await response.json();
      setPlugin(data);
    } catch {
      // ConsolePlugin not found — not critical
    }
  }, []);

  React.useEffect(() => {
    fetchPlugin();
  }, [fetchPlugin]);

  const sorted = React.useMemo(() => {
    if (!loaded || loadError || !Array.isArray(resources)) return [];
    return [...resources].sort((a, b) => (a.metadata?.name ?? '').localeCompare(b.metadata?.name ?? ''));
  }, [resources, loaded, loadError]);

  const crdMissing = loaded && !!loadError;

  const handlePromote = async (name: string, namespace: string): Promise<void> => {
    const key = `${namespace}/${name}`;
    setPromoting(key);
    setAlert(null);
    try {
      await promoteToConsole(name, namespace);
      await fetchPlugin();
      setAlert({ variant: AlertVariant.success, message: `Kiali "${name}" promoted to console. Refresh the page to activate.` });
    } catch (err) {
      setAlert({ variant: AlertVariant.danger, message: `Failed to promote: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setPromoting(null);
    }
  };

  return (
    <>
      <PageSection>
        <Title headingLevel="h1">Kialis</Title>
      </PageSection>
      <PageSection>
        {alert && (
          <Alert variant={alert.variant} title={alert.message} isInline actionClose={<AlertActionCloseButton onClose={() => setAlert(null)} />} />
        )}
        {!loaded ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : crdMissing ? (
          <EmptyState
            headingLevel="h2"
            icon={SearchIcon}
            titleText="Kiali Operator is not installed"
            variant={EmptyStateVariant.lg}
          >
            <EmptyStateBody>
              The Kiali custom resource definition was not found on this cluster. Install the Kiali Operator from the{' '}
              <a href="/catalog/ns/openshift-operators?keyword=kiali">OperatorHub</a> to manage Kiali instances.
            </EmptyStateBody>
          </EmptyState>
        ) : sorted.length === 0 ? (
          <EmptyState
            headingLevel="h2"
            icon={SearchIcon}
            titleText="No Kiali resources found"
            variant={EmptyStateVariant.lg}
          >
            <EmptyStateBody>
              The Kiali Operator is installed but no Kiali instances have been created yet.
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <Table aria-label="Kiali resources" variant="compact">
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Namespace</Th>
                <Th>Created</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sorted.map(resource => {
                const name = resource.metadata?.name ?? '';
                const namespace = resource.metadata?.namespace ?? '';
                const key = `${namespace}/${name}`;
                const promoted = isPromoted(plugin, name, namespace);

                return (
                  <Tr key={key}>
                    <Td>
                      <ResourceLink
                        groupVersionKind={kialiGVK}
                        name={name}
                        namespace={namespace}
                      />
                    </Td>
                    <Td>
                      {namespace && <ResourceLink kind="Namespace" name={namespace} />}
                    </Td>
                    <Td>
                      <Timestamp timestamp={resource.metadata?.creationTimestamp ?? ''} />
                    </Td>
                    <Td>
                      {promoted ? (
                        <Button variant="link" isDisabled icon={<CheckCircleIcon color="var(--pf-v5-global--success-color--100)" />}>
                          Promoted
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          isLoading={promoting === key}
                          isDisabled={promoting !== null}
                          onClick={() => handlePromote(name, namespace)}
                        >
                          Promote to Console
                        </Button>
                      )}
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

export default KialisPage;
