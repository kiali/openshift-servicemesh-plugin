import { TrafficDetails, IstioMetrics, TracesComponent, WorkloadInfo, WorkloadPodLogs } from '@kiali/core-ui';
import { PromisesRegistry, MetricsObjectTypes, Workload, WorkloadHealth, getWorkload } from '@kiali/types';
import { K8sGroupVersionKind, ResourceLink } from '@openshift-console/dynamic-plugin-sdk';
import { EmptyState, EmptyStateBody, EmptyStateVariant, Tab, Tabs, Title, TitleSizes } from '@patternfly/react-core';
import * as React from 'react';
import { useHistory } from 'react-router';
import { istioResources } from '../../k8s/resources';
import { getKialiConfig, KialiConfig } from '../../kialiIntegration';

const tabNames = ['info', 'traffic', 'logs', 'in_metrics', 'out_metrics', 'traces'];

const duration = 1000;

const WorkloadMesh = () => {
  const history = useHistory();
  const path = history.location.pathname.substring(8);
  const items = path.split('/');
  const namespace = items[0];

  let objectId = items[2];

  if (items[1] === 'pods') {
    let count = 0;
    let index = 0;
    // Get the parent workload (app-version) from pod identifier
    for (let i = 0; i < objectId.length; i++) {
      if (objectId[i] === '-') {
        count++;
        if (count === 2) {
          index = i;
        }
      }
    }
    if (index > 0) {
      objectId = objectId.substring(0, index);
    }
  }

  const activeTab = (): number => {
    const tabName = new URLSearchParams(history.location.search).get('tab');
    const tabIndex = tabNames.indexOf(tabName);
    return tabIndex !== -1 ? tabIndex : 0;
  };

  const [kialiConfig, setKialiConfig] = React.useState<KialiConfig>(undefined);
  const [workload, setWorkload] = React.useState<Workload>(undefined);
  const [health, setHealth] = React.useState<WorkloadHealth>(undefined);
  const [currentTab, setCurrentTab] = React.useState<number>(activeTab());
  const [load, setLoad] = React.useState(true);
  const promises = new PromisesRegistry();

  const mtlsEnabled = kialiConfig?.meshTLSStatus.autoMTLSEnabled;

  //   const hasIstioSidecars = (workload: Workload): boolean => {
  //     let hasIstioSidecars = false;

  //     if (workload.pods.length > 0) {
  //       workload.pods.forEach(pod => {
  //         if (pod.istioContainers && pod.istioContainers.length > 0) {
  //           hasIstioSidecars = true;
  //         } else {
  //           hasIstioSidecars =
  //             hasIstioSidecars || (!!pod.containers && pod.containers.some(cont => cont.name === 'istio-proxy'));
  //         }
  //       });
  //     }
  //     return hasIstioSidecars;
  //   };

  const linkTemplate = (name: string, namespace: string, objectType: string) => {
    let groupVersionKind: K8sGroupVersionKind;

    switch (objectType) {
      case 'service':
        groupVersionKind = { group: '', version: 'v1', kind: 'Service' };
        break;
      // TODO add objectType in workloadReferences to know exact workload type
      case 'workload':
        groupVersionKind = { group: 'apps', version: 'v1', kind: 'Deployment' };
        break;
      case 'gateway':
        groupVersionKind = { group: 'networking.istio.io', version: 'v1beta1', kind: 'Gateway' };
        break;
      default:
        groupVersionKind = istioResources.find(resource => resource.kind.toLowerCase() === objectType);
        break;
    }

    return <ResourceLink groupVersionKind={groupVersionKind} name={name} namespace={namespace} />;
  };

  const fetchWorkload = () => {
    const params: { [key: string]: string } = {
      validate: 'true',
      rateInterval: String(duration) + 's',
      health: 'true'
    };
    promises.cancelAll();
    return getWorkload(namespace, objectId, params);
  };

  const tabSelectHandler = (tabKey: number) => {
    const tabName = tabNames[tabKey];
    const urlParams = new URLSearchParams(history.location.search);

    urlParams.set('tab', tabName);
    history.push(history.location.pathname + '?' + urlParams.toString());

    setCurrentTab(tabKey);
  };

  React.useEffect(() => {
    getKialiConfig()
      .then(kialiConfig => {
        setKialiConfig(kialiConfig);
      })
      .catch(error => console.error('Error getting Kiali API config', error));
  }, []);

  React.useEffect(() => {
    if (kialiConfig && load) {
      fetchWorkload()
        .then(response => {
          setWorkload(response.data);
          setHealth(
            WorkloadHealth.fromJson(kialiConfig.server, namespace, objectId, response.data.health, {
              rateInterval: duration,
              hasSidecar: response.data.istioSidecar
            })
          );
        })
        .catch(error => {
          // AlertUtils.addError('Could not fetch Gateways list.', gwError);
          //
          // AlertUtils.addError('Could not fetch Service Details.', error);
          // const msg: ErrorMsg = {
          //   title: 'No Service is selected',
          //   description: this.props.match.params.service + ' is not found in the mesh'
          // };
          // this.setState({ error: msg });
          //
          //   AlertUtils.addError('Could not fetch PeerAuthentications.', error);
          console.error(error);
        })
        .finally(() => {
          setLoad(false);
        });
    }
  }, [kialiConfig, load]);

  const hasPods = workload?.pods.length;

  const renderTabs = () => {
    const tabsArray: JSX.Element[] = [];

    tabsArray.push(
      <Tab title="Overview" eventKey={0}>
        <WorkloadInfo
          workload={workload}
          duration={60}
          health={health}
          namespace={namespace}
          refreshWorkload={fetchWorkload}
          serverConfig={kialiConfig.server}
          userSettings={kialiConfig.userSettings}
          graphSettings={kialiConfig.graphSettings}
          mtlsEnabled={mtlsEnabled}
          linkTemplate={linkTemplate}
        />
      </Tab>
    );

    tabsArray.push(
      <Tab eventKey={1} title="Traffic" key="Traffic">
        <TrafficDetails
          itemName={objectId}
          itemType={MetricsObjectTypes.WORKLOAD}
          lastRefreshAt={60000}
          namespace={namespace}
          duration={60}
          serverConfig={kialiConfig.server}
        />
      </Tab>
    );

    if (!kialiConfig.server.kialiFeatureFlags.disabledFeatures?.includes('logs-tab')) {
      tabsArray.push(
        <Tab title="Logs" eventKey={2} key={'Logs'} data-test={'workload-details-logs-tab'}>
          {hasPods ? (
            <WorkloadPodLogs
              lastRefreshAt={1000}
              namespace={namespace}
              workload={objectId}
              pods={workload!.pods}
              timeRange={{ rangeDuration: 600 }}
              serverConfig={kialiConfig.server}
            />
          ) : (
            <EmptyState variant={EmptyStateVariant.full}>
              <Title headingLevel="h5" size={TitleSizes.lg}>
                No logs for Workload {objectId}
              </Title>
              <EmptyStateBody>There are no logs to display because the workload has no pods.</EmptyStateBody>
            </EmptyState>
          )}
        </Tab>
      );
    }

    tabsArray.push(
      <Tab eventKey={3} title="Inbound Metrics" key="Inbound Metrics">
        <IstioMetrics
          data-test="inbound-metrics-component"
          lastRefreshAt={1000}
          namespace={namespace}
          object={objectId}
          objectType={MetricsObjectTypes.WORKLOAD}
          direction={'inbound'}
          jaegerIntegration={kialiConfig.jaegerInfo.integration}
          timeRange={{ rangeDuration: 600 }}
          setTimeRange={() => {}}
          refreshInterval={1000}
          serverConfig={kialiConfig.server}
        />
      </Tab>
    );

    tabsArray.push(
      <Tab eventKey={4} title="Outbound Metrics" key="Outbound Metrics">
        <IstioMetrics
          data-test="outbound-metrics-component"
          lastRefreshAt={1000}
          namespace={namespace}
          object={objectId}
          objectType={MetricsObjectTypes.WORKLOAD}
          direction={'outbound'}
          jaegerIntegration={kialiConfig.jaegerInfo.integration}
          timeRange={{ rangeDuration: 600 }}
          setTimeRange={() => {}}
          refreshInterval={1000}
          serverConfig={kialiConfig.server}
        />
      </Tab>
    );

    if (kialiConfig.jaegerInfo && kialiConfig.jaegerInfo.enabled && kialiConfig.jaegerInfo.integration) {
      tabsArray.push(
        <Tab eventKey={5} title="Traces" key="Traces">
          <TracesComponent
            lastRefreshAt={1000}
            namespace={namespace}
            target={objectId}
            targetKind={'workload'}
            jaegerInfo={kialiConfig.jaegerInfo}
            timeRange={{}}
            serverConfig={kialiConfig.server}
          />
        </Tab>
      );
    }

    // if (workload && hasIstioSidecars(workload)) {
    //   tabsArray.push(
    //     <Tab title="Envoy" eventKey={6} key={'Envoy'}>
    //       {workload && <EnvoyDetails lastRefreshAt={1000} namespace={namespace} workload={workload} />}
    //     </Tab>
    //   );
    // }

    return tabsArray;
  };

  return (
    // <Drawer className={drawerStyle} isExpanded={isExpanded} isInline={true}>
    //   <DrawerContent panelContent={showCards ? panelContent : undefined}>
    //     <DrawerContentBody>{editor}</DrawerContentBody>
    //   </DrawerContent>
    // </Drawer>
    <>
      {workload ? (
        <Tabs
          id={objectId}
          activeKey={currentTab}
          onSelect={(_, tabKey) => {
            tabSelectHandler(tabKey as number);
          }}
          mountOnEnter={true}
          unmountOnExit={true}
        >
          {renderTabs()}
        </Tabs>
      ) : null}
    </>
  );
};

export default WorkloadMesh;
