import * as React from 'react';
import { connect } from 'react-redux';
import { KialiAppState } from 'store/Store';
import { namespaceItemsSelector } from 'store/Selectors';
import { ISortBy, SortByDirection } from '@patternfly/react-table';
import { Workload } from 'types/Workload';
import { EnvoyProxyDump, Pod } from 'types/IstioObjects';
import * as API from '../../services/Api';
import * as AlertUtils from '../../utils/AlertUtils';
import {
  Button,
  ButtonVariant,
  Card,
  CardBody,
  Grid,
  GridItem,
  Tab,
  Tabs,
  Tooltip,
  TooltipPosition
} from '@patternfly/react-core';
import { SummaryTableBuilder } from './tables/BaseTable';
import { Namespace } from 'types/Namespace';
import { style } from 'typestyle';
import AceEditor from 'react-ace';
import { PFBadge, PFBadges } from 'components/Pf/PfBadges';
import { ToolbarDropdown } from 'components/ToolbarDropdown/ToolbarDropdown';
import { activeTab } from '../../components/Tab/Tabs';
import { KialiIcon, defaultIconStyle } from 'config/KialiIcon';
import { aceOptions } from 'types/IstioConfigDetails';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { RenderComponentScroll } from 'components/Nav/Page';
import { DashboardRef } from 'types/Runtimes';
import { CustomMetrics } from 'components/Metrics/CustomMetrics';
import { serverConfig } from 'config';
import { FilterSelected } from 'components/Filters/StatefulFilters';
import { history } from '../../app/History';
import {
  tabName as workloadTabName,
  defaultTab as workloadDefaultTab
} from '../../pages/WorkloadDetails/WorkloadDetailsPage';
import { TimeInMilliseconds } from '../../types/Common';

// Enables the search box for the ACEeditor
require('ace-builds/src-noconflict/ext-searchbox');

const resources: string[] = ['clusters', 'listeners', 'routes', 'bootstrap', 'config', 'metrics'];

const iconStyle = style({
  display: 'inline-block',
  paddingTop: '5px'
});

const envoyTabs = ['clusters', 'listeners', 'routes', 'bootstrap', 'config', 'metrics'];
const tabName = 'envoyTab';
const defaultTab = 'clusters';

export type ResourceSorts = { [resource: string]: ISortBy };

type ReduxProps = {
  kiosk: string;
  namespaces: Namespace[];
};

type EnvoyDetailsProps = ReduxProps & {
  lastRefreshAt: TimeInMilliseconds;
  namespace: string;
  workload: Workload;
};

type EnvoyDetailsState = {
  config: EnvoyProxyDump;
  pod: Pod;
  tableSortBy: ResourceSorts;
  fetch: boolean;
  tabHeight: number;
  activeKey: number;
  resource: string;
};

const fullHeightStyle = style({
  height: '100%'
});

class EnvoyDetailsComponent extends React.Component<EnvoyDetailsProps, EnvoyDetailsState> {
  aceEditorRef: React.RefObject<AceEditor>;

  constructor(props: EnvoyDetailsProps) {
    super(props);

    this.aceEditorRef = React.createRef();

    this.state = {
      pod: this.sortedPods()[0],
      config: {},
      tabHeight: 300,
      fetch: true,
      activeKey: envoyTabs.indexOf(activeTab(tabName, defaultTab)),
      resource: activeTab(tabName, defaultTab),
      tableSortBy: {
        clusters: {
          index: 0,
          direction: 'asc'
        },
        listeners: {
          index: 0,
          direction: 'asc'
        },
        routes: {
          index: 0,
          direction: 'asc'
        }
      }
    };
  }

  componentDidMount() {
    this.fetchContent();
  }

  componentDidUpdate(_prevProps: EnvoyDetailsProps, prevState: EnvoyDetailsState) {
    const currentTabIndex = envoyTabs.indexOf(activeTab(tabName, defaultTab));
    if (this.state.pod.name !== prevState.pod.name || this.state.resource !== prevState.resource) {
      this.fetchContent();
      if (currentTabIndex !== this.state.activeKey) {
        this.setState({ activeKey: currentTabIndex });
      }
    }
  }

  envoyHandleTabClick = (_event, tabIndex) => {
    const resourceIdx: number = +tabIndex;
    const targetResource: string = resources[resourceIdx];
    if (targetResource !== this.state.resource) {
      this.setState({
        config: {},
        fetch: true,
        resource: targetResource,
        activeKey: tabIndex
      });
      const mainTab = new URLSearchParams(history.location.search).get(workloadTabName) || workloadDefaultTab;
      const urlParams = new URLSearchParams(history.location.search);
      urlParams.set(tabName, targetResource);
      urlParams.set(workloadTabName, mainTab);
      history.push(history.location.pathname + '?' + urlParams.toString());
    }
  };

  fetchEnvoyProxyResourceEntries = (resource: string) => {
    API.getPodEnvoyProxyResourceEntries(
      this.props.namespace,
      this.state.pod.name,
      resource,
      this.props.workload.cluster
    )
      .then(resultEnvoyProxy => {
        this.setState({
          config: resultEnvoyProxy.data,
          fetch: false
        });
      })
      .catch(error => {
        AlertUtils.addError(`Could not fetch envoy config ${resource} entries for ${this.state.pod.name}.`, error);
      });
  };

  fetchEnvoyProxy = () => {
    API.getPodEnvoyProxy(this.props.namespace, this.state.pod.name, this.props.workload.cluster)
      .then(resultEnvoyProxy => {
        this.setState({
          config: resultEnvoyProxy.data,
          fetch: false
        });
      })
      .catch(error => {
        AlertUtils.addError(`Could not fetch envoy config for ${this.state.pod.name}.`, error);
      });
  };

  fetchContent = () => {
    if (this.state.fetch === true) {
      if (this.state.resource === 'config') {
        this.fetchEnvoyProxy();
      } else {
        this.fetchEnvoyProxyResourceEntries(this.state.resource);
      }
    }
  };

  setPod = (podName: string) => {
    const podIdx: number = +podName;
    const targetPod: Pod = this.sortedPods()[podIdx];
    if (targetPod.name !== this.state.pod.name) {
      this.setState({
        config: {},
        pod: targetPod,
        fetch: true
      });
    }
  };

  sortedPods = (): Pod[] => {
    return this.props.workload.pods.sort((p1: Pod, p2: Pod) => (p1.name >= p2.name ? 1 : -1));
  };

  onSort = (tab: string, index: number, direction: SortByDirection) => {
    if (this.state.tableSortBy[tab].index !== index || this.state.tableSortBy[tab].direction !== direction) {
      let tableSortBy = this.state.tableSortBy;
      tableSortBy[tab].index = index;
      tableSortBy[tab].direction = direction;
      this.setState({
        tableSortBy: tableSortBy
      });
    }
  };

  editorContent = () => JSON.stringify(this.state.config, null, '  ');

  onCopyToClipboard = (_text: string, _result: boolean) => {
    const editor = this.aceEditorRef.current!['editor'];
    if (editor) {
      editor.selectAll();
    }
  };

  showEditor = () => {
    return this.state.resource === 'config' || this.state.resource === 'bootstrap';
  };

  showMetrics = () => {
    return this.state.resource === 'metrics';
  };

  getEnvoyMetricsDashboardRef = (): DashboardRef | undefined => {
    var envoyDashboardRef: DashboardRef | undefined = undefined;
    this.props.workload.runtimes.forEach(runtime => {
      runtime.dashboardRefs.forEach(dashboardRef => {
        if (dashboardRef.template === 'envoy') {
          envoyDashboardRef = dashboardRef;
        }
      });
    });
    return envoyDashboardRef;
  };

  isLoadingConfig = () => {
    return Object.keys(this.state.config).length < 1;
  };

  onRouteLinkClick = () => {
    this.setState({
      config: {},
      fetch: true,
      resource: 'routes',
      activeKey: 2 // Routes index
    });

    // Forcing to regenerate the active filters
    FilterSelected.resetFilters();
  };

  render() {
    const builder = SummaryTableBuilder(
      this.state.resource,
      this.state.config,
      this.state.tableSortBy,
      this.props.namespaces,
      this.props.namespace,
      this.onRouteLinkClick,
      this.props.kiosk,
      this.props.workload.name
    );
    const SummaryWriterComp = builder[0];
    const summaryWriter = builder[1];
    const height = this.state.tabHeight - 226;
    const app = this.props.workload.labels[serverConfig.istioLabels.appLabelName];
    const version = this.props.workload.labels[serverConfig.istioLabels.versionLabelName];
    const envoyMetricsDashboardRef = this.getEnvoyMetricsDashboardRef();
    let filteredEnvoyTabs = envoyTabs;
    if (!envoyMetricsDashboardRef) {
      filteredEnvoyTabs = envoyTabs.slice(0, envoyTabs.length - 1);
    }
    const tabs = filteredEnvoyTabs.map((value, index) => {
      const title = value.charAt(0).toUpperCase() + value.slice(1);
      return (
        <Tab style={{ backgroundColor: 'white' }} key={'tab_' + value} eventKey={index} title={title}>
          <Card className={fullHeightStyle}>
            <CardBody>
              {this.showEditor() ? (
                <div className={fullHeightStyle}>
                  <div style={{ marginBottom: '20px' }}>
                    <div key="service-icon" className={iconStyle}>
                      <PFBadge badge={PFBadges.Pod} position={TooltipPosition.top} />
                    </div>
                    <ToolbarDropdown
                      id="envoy_pods_list"
                      tooltip="Display envoy config for the selected pod"
                      handleSelect={key => this.setPod(key)}
                      value={this.state.pod.name}
                      label={this.state.pod.name}
                      options={this.props.workload.pods.map((pod: Pod) => pod.name).sort()}
                    />
                    <Tooltip key="copy_config" position="top" content="Copy config dump to clipboard">
                      <CopyToClipboard
                        style={{ float: 'right', marginTop: '15px' }}
                        onCopy={this.onCopyToClipboard}
                        text={this.editorContent()}
                      >
                        <Button variant={ButtonVariant.link} isInline>
                          <KialiIcon.Copy className={defaultIconStyle} />
                        </Button>
                      </CopyToClipboard>
                    </Tooltip>
                  </div>
                  <AceEditor
                    ref={this.aceEditorRef}
                    mode="yaml"
                    theme="eclipse"
                    width={'100%'}
                    height={height.toString() + 'px'}
                    className={'istio-ace-editor'}
                    wrapEnabled={true}
                    readOnly={true}
                    setOptions={aceOptions || { foldStyle: 'markbegin' }}
                    value={this.editorContent()}
                  />
                </div>
              ) : this.showMetrics() && envoyMetricsDashboardRef ? (
                <CustomMetrics
                  lastRefreshAt={this.props.lastRefreshAt}
                  namespace={this.props.namespace}
                  app={app}
                  version={version}
                  workload={this.props.workload!.name}
                  template={envoyMetricsDashboardRef.template}
                  embedded={true}
                  height={this.state.tabHeight - 40 - 24 + 13}
                  data-test="envoy-metrics-component"
                />
              ) : (
                <SummaryWriterComp
                  writer={summaryWriter}
                  sortBy={this.state.tableSortBy}
                  onSort={this.onSort}
                  pod={this.state.pod.name}
                  pods={this.props.workload.pods.map(pod => pod.name)}
                  setPod={this.setPod}
                />
              )}
            </CardBody>
          </Card>
        </Tab>
      );
    });

    return (
      <RenderComponentScroll onResize={height => this.setState({ tabHeight: height })}>
        <Grid>
          <GridItem span={12}>
            <Tabs
              id="envoy-details"
              activeKey={this.state.activeKey}
              onSelect={this.envoyHandleTabClick}
              mountOnEnter={true}
              unmountOnExit={true}
            >
              {tabs}
            </Tabs>
          </GridItem>
        </Grid>
      </RenderComponentScroll>
    );
  }
}

const mapStateToProps = (state: KialiAppState) => ({
  kiosk: state.globalState.kiosk,
  namespaces: namespaceItemsSelector(state)!
});

export const EnvoyDetails = connect(mapStateToProps)(EnvoyDetailsComponent);
