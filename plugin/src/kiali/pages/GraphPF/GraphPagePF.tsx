import * as React from 'react';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import FlexView from 'react-flexview';
import { style } from 'typestyle';
import { DurationInSeconds, IntervalInMilliseconds, TimeInMilliseconds, TimeInSeconds } from '../../types/Common';
import { Namespace } from '../../types/Namespace';
import {
  GraphEvent,
  DecoratedGraphElements,
  EdgeLabelMode,
  GraphDefinition,
  GraphType,
  Layout,
  NodeParamsType,
  NodeType,
  SummaryData,
  UNKNOWN,
  TrafficRate,
  RankMode,
  RankResult,
  EdgeMode
} from '../../types/Graph';
import { computePrometheusRateParams } from '../../services/Prometheus';
import * as AlertUtils from '../../utils/AlertUtils';
import { ErrorBoundary } from '../../components/ErrorBoundary/ErrorBoundary';
import { GraphToolbar } from '../Graph/GraphToolbar/GraphToolbar';
import { GraphLegend } from '../Graph/GraphLegend';
import { EmptyGraphLayout } from '../../components/CytoscapeGraph/EmptyGraphLayout';
import { SummaryPanel } from '../Graph/SummaryPanel';
import {
  activeNamespacesSelector,
  durationSelector,
  edgeLabelsSelector,
  edgeModeSelector,
  findValueSelector,
  graphTypeSelector,
  hideValueSelector,
  meshWideMTLSEnabledSelector,
  refreshIntervalSelector,
  replayActiveSelector,
  replayQueryTimeSelector,
  trafficRatesSelector
} from '../../store/Selectors';
import { KialiAppState } from '../../store/Store';
import { GraphActions } from '../../actions/GraphActions';
import { GraphToolbarActions } from '../../actions/GraphToolbarActions';
import { PFColors } from 'components/Pf/PfColors';
import { TourActions } from 'actions/TourActions';
import { arrayEquals } from 'utils/Common';
import { isKioskMode, getFocusSelector, unsetFocusSelector, getTraceId } from 'utils/SearchParamUtils';
import { Badge, Chip } from '@patternfly/react-core';
import { toRangeString } from 'components/Time/Utils';
import { replayBorder } from 'components/Time/Replay';
import { GraphDataSource, FetchParams, EMPTY_GRAPH_DATA } from '../../services/GraphDataSource';
import { NamespaceActions } from '../../actions/NamespaceAction';
import { GraphThunkActions } from '../../actions/GraphThunkActions';
import { JaegerTrace } from 'types/JaegerInfo';
import { KialiDispatch } from 'types/Redux';
import { JaegerThunkActions } from 'actions/JaegerThunkActions';
import { GraphTour } from 'pages/Graph/GraphHelpTour';
import { getNextTourStop, TourInfo } from 'components/Tour/TourStop';
import { ServiceWizard } from 'components/IstioWizards/ServiceWizard';
import { ServiceDetailsInfo } from 'types/ServiceInfo';
import { DestinationRuleC, PeerAuthentication } from 'types/IstioObjects';
import { WizardAction, WizardMode } from 'components/IstioWizards/WizardActions';
import { ConfirmDeleteTrafficRoutingModal } from 'components/IstioWizards/ConfirmDeleteTrafficRoutingModal';
import { deleteServiceTrafficRouting } from 'services/Api';
import { canCreate, canUpdate } from '../../types/Permissions';
import { connectRefresh } from '../../components/Refresh/connectRefresh';
import { triggerRefresh } from '../../hooks/refresh';
import { GraphData } from 'pages/Graph/GraphPage';
import { GraphPF, FocusNode } from './GraphPF';
import * as CytoscapeGraphUtils from '../../components/CytoscapeGraph/CytoscapeGraphUtils';
import { Controller } from '@patternfly/react-topology';

// GraphURLPathProps holds path variable values.  Currently all path variables are relevant only to a node graph
export type GraphURLPathProps = {
  aggregate: string;
  aggregateValue: string;
  app: string;
  namespace: string;
  service: string;
  version: string;
  workload: string;
};

type ReduxProps = {
  activeNamespaces: Namespace[];
  activeTour?: TourInfo;
  boxByCluster: boolean;
  boxByNamespace: boolean;
  compressOnHide: boolean;
  duration: DurationInSeconds; // current duration (dropdown) setting
  edgeLabels: EdgeLabelMode[];
  edgeMode: EdgeMode;
  endTour: () => void;
  findValue: string;
  graphType: GraphType;
  hideValue: string;
  istioAPIEnabled: boolean;
  isPageVisible: boolean;
  kiosk: string;
  layout: Layout;
  namespaceLayout: Layout;
  mtlsEnabled: boolean;
  node?: NodeParamsType;
  onNamespaceChange: () => void;
  onReady: (controller: any) => void;
  rankBy: RankMode[];
  refreshInterval: IntervalInMilliseconds;
  replayActive: boolean;
  replayQueryTime: TimeInMilliseconds;
  setActiveNamespaces: (namespaces: Namespace[]) => void;
  setEdgeMode: (edgeMode: EdgeMode) => void;
  setGraphDefinition: (graphDefinition: GraphDefinition) => void;
  setLayout: (layout: Layout) => void;
  setRankResult: (result: RankResult) => void;
  setNode: (node?: NodeParamsType) => void;
  setTraceId: (traceId?: string) => void;
  setUpdateTime: (val: TimeInMilliseconds) => void;
  showIdleEdges: boolean;
  showIdleNodes: boolean;
  showLegend: boolean;
  showMissingSidecars: boolean;
  showOperationNodes: boolean;
  showRank: boolean;
  showSecurity: boolean;
  showServiceNodes: boolean;
  showTrafficAnimation: boolean;
  showVirtualServices: boolean;
  startTour: ({ info, stop }) => void;
  summaryData: SummaryData | null;
  trace?: JaegerTrace;
  trafficRates: TrafficRate[];
  toggleIdleNodes: () => void;
  toggleLegend: () => void;
  updateSummary: (event: GraphEvent) => void;
};

export type GraphPagePropsPF = Partial<GraphURLPathProps> &
  ReduxProps & {
    lastRefreshAt: TimeInMilliseconds; // redux by way of ConnectRefresh
  };

type WizardsData = {
  // Wizard configuration
  showWizard: boolean;
  wizardType: string;
  updateMode: boolean;

  // Data (payload) sent to the wizard or the confirm delete dialog
  gateways: string[];
  k8sGateways: string[];
  peerAuthentications: PeerAuthentication[];
  namespace: string;
  serviceDetails?: ServiceDetailsInfo;
};

type GraphPageStatePF = {
  graphData: GraphData;
  showConfirmDeleteTrafficRouting: boolean;
  wizardsData: WizardsData;
};

const NUMBER_OF_DATAPOINTS = 30;

const containerStyle = style({
  minHeight: '350px',
  // TODO: try flexbox to remove this calc
  height: 'calc(100vh - 113px)' // View height minus top bar height minus secondary masthead
});

const kioskContainerStyle = style({
  minHeight: '350px',
  height: 'calc(100vh - 10px)' // View height minus top bar height
});

const graphContainerStyle = style({ flex: '1', minWidth: '350px', zIndex: 0, paddingRight: '5px' });
const graphWrapperDivStyle = style({ position: 'relative', backgroundColor: PFColors.Black200 });

const graphTimeRange = style({
  position: 'absolute',
  top: '10px',
  left: '10px',
  width: 'auto',
  zIndex: 2,
  backgroundColor: PFColors.White
});

const whiteBackground = style({
  backgroundColor: PFColors.White
});

const replayBackground = style({
  backgroundColor: PFColors.Replay
});

const graphLegendStyle = style({
  right: '0',
  bottom: '10px',
  position: 'absolute',
  overflow: 'hidden'
});

const GraphErrorBoundaryFallback = () => {
  return (
    <div className={graphContainerStyle}>
      <EmptyGraphLayout
        isError={true}
        isMiniGraph={false}
        namespaces={[]}
        showIdleNodes={false}
        toggleIdleNodes={() => undefined}
      />
    </div>
  );
};

class GraphPagePFComponent extends React.Component<GraphPagePropsPF, GraphPageStatePF> {
  private controller?: Controller;
  private readonly errorBoundaryRef: any;
  private focusNode?: FocusNode;
  private graphDataSource: GraphDataSource;

  static getNodeParamsFromProps(props: Partial<GraphURLPathProps>): NodeParamsType | undefined {
    const aggregate = props.aggregate;
    const aggregateOk = aggregate && aggregate !== UNKNOWN;
    const aggregateValue = props.aggregateValue;
    const aggregateValueOk = aggregateValue && aggregateValue !== UNKNOWN;
    const app = props.app;
    const appOk = app && app !== UNKNOWN;
    const namespace = props.namespace;
    const namespaceOk = namespace && namespace !== UNKNOWN;
    const service = props.service;
    const serviceOk = service && service !== UNKNOWN;
    const workload = props.workload;
    const workloadOk = workload && workload !== UNKNOWN;
    if (!aggregateOk && !aggregateValueOk && !appOk && !namespaceOk && !serviceOk && !workloadOk) {
      // @ts-ignore
      return;
    }

    let nodeType: NodeType;
    let version: string | undefined;
    if (aggregateOk) {
      nodeType = NodeType.AGGREGATE;
      version = '';
    } else if (appOk || workloadOk) {
      nodeType = appOk ? NodeType.APP : NodeType.WORKLOAD;
      version = props.version;
    } else {
      nodeType = NodeType.SERVICE;
      version = '';
    }
    return {
      aggregate: aggregate!,
      aggregateValue: aggregateValue!,
      app: app!,
      namespace: { name: namespace! },
      nodeType: nodeType,
      service: service!,
      version: version,
      workload: workload!
    };
  }

  static isNodeChanged(prevNode?: NodeParamsType, node?: NodeParamsType): boolean {
    if (prevNode === node) {
      return false;
    }
    if ((prevNode && !node) || (!prevNode && node)) {
      return true;
    }
    if (prevNode && node) {
      const nodeAggregateHasChanged =
        prevNode.aggregate !== node.aggregate || prevNode.aggregateValue !== node.aggregateValue;
      const nodeAppHasChanged = prevNode.app !== node.app;
      const nodeServiceHasChanged = prevNode.service !== node.service;
      const nodeVersionHasChanged = prevNode.version !== node.version;
      const nodeTypeHasChanged = prevNode.nodeType !== node.nodeType;
      const nodeWorkloadHasChanged = prevNode.workload !== node.workload;
      return (
        nodeAggregateHasChanged ||
        nodeAppHasChanged ||
        nodeServiceHasChanged ||
        nodeVersionHasChanged ||
        nodeWorkloadHasChanged ||
        nodeTypeHasChanged
      );
    }
    return false;
  }

  constructor(props: GraphPagePropsPF) {
    super(props);
    this.controller = undefined;
    this.errorBoundaryRef = React.createRef();
    const focusNodeId = getFocusSelector();
    this.focusNode = focusNodeId ? { id: focusNodeId, isSelected: true } : undefined;
    this.graphDataSource = new GraphDataSource();

    this.state = {
      graphData: {
        elements: { edges: [], nodes: [] },
        elementsChanged: false,
        fetchParams: this.graphDataSource.fetchParameters,
        isLoading: true,
        timestamp: 0
      },
      wizardsData: {
        showWizard: false,
        wizardType: '',
        updateMode: false,
        gateways: [],
        k8sGateways: [],
        peerAuthentications: [],
        namespace: ''
      },
      showConfirmDeleteTrafficRouting: false
    };
  }

  componentDidMount() {
    // Connect to graph data source updates
    this.graphDataSource.on('loadStart', this.handleGraphDataSourceStart);
    this.graphDataSource.on('fetchError', this.handleGraphDataSourceError);
    this.graphDataSource.on('fetchSuccess', this.handleGraphDataSourceSuccess);
    this.graphDataSource.on('emptyNamespaces', this.handleGraphDataSourceEmpty);

    // Let URL override current redux state at mount time.  We usually do this in
    // the constructor but it seems to work better here when the initial URL
    // is for a node graph.  When setting the node here it is available for the
    // loadGraphFromBackend() call.
    const urlNode = GraphPagePFComponent.getNodeParamsFromProps(this.props);
    if (GraphPagePFComponent.isNodeChanged(urlNode, this.props.node)) {
      // add the node namespace if necessary, but don't lose previously selected namespaces
      if (urlNode && !this.props.activeNamespaces.map(ns => ns.name).includes(urlNode.namespace.name)) {
        this.props.setActiveNamespaces([urlNode.namespace, ...this.props.activeNamespaces]);
      }
      this.props.setNode(urlNode);
    }

    const urlTrace = getTraceId();
    if (urlTrace !== this.props.trace?.traceID) {
      this.props.setTraceId(urlTrace);
    }
  }

  componentDidUpdate(prev: GraphPagePropsPF) {
    const curr = this.props;

    // Ensure we initialize the graph. We wait for the first update so that
    // the toolbar can render and ensure all redux props are updated with URL
    // settings. That in turn ensures the initial fetchParams are correct.
    const isInitialLoad = !this.state.graphData.timestamp;

    if (curr.summaryData?.summaryType === 'graph') {
      this.controller = curr.summaryData.summaryTarget;
    }

    const activeNamespacesChanged = !arrayEquals(
      prev.activeNamespaces,
      curr.activeNamespaces,
      (n1, n2) => n1.name === n2.name
    );

    // Ensure we initialize the graph when there is a change to activeNamespaces.
    if (activeNamespacesChanged) {
      this.props.onNamespaceChange();
    }
    if (
      isInitialLoad ||
      activeNamespacesChanged ||
      prev.boxByCluster !== curr.boxByCluster ||
      prev.boxByNamespace !== curr.boxByNamespace ||
      prev.duration !== curr.duration ||
      (prev.edgeLabels !== curr.edgeLabels && // test for edge labels that invoke graph gen appenders
        (curr.edgeLabels.includes(EdgeLabelMode.RESPONSE_TIME_GROUP) ||
          curr.edgeLabels.includes(EdgeLabelMode.THROUGHPUT_GROUP))) ||
      (prev.findValue !== curr.findValue && curr.findValue.includes('label:')) ||
      prev.graphType !== curr.graphType ||
      (prev.hideValue !== curr.hideValue && curr.hideValue.includes('label:')) ||
      (prev.lastRefreshAt !== curr.lastRefreshAt && curr.replayQueryTime === 0) ||
      (prev.replayActive !== curr.replayActive && !curr.replayActive) ||
      prev.replayQueryTime !== curr.replayQueryTime ||
      prev.showIdleEdges !== curr.showIdleEdges ||
      prev.showOperationNodes !== curr.showOperationNodes ||
      prev.showServiceNodes !== curr.showServiceNodes ||
      prev.showSecurity !== curr.showSecurity ||
      prev.showIdleNodes !== curr.showIdleNodes ||
      prev.trafficRates !== curr.trafficRates ||
      GraphPagePFComponent.isNodeChanged(prev.node, curr.node)
    ) {
      this.loadGraphDataFromBackend();
    }

    if (!!this.focusNode) {
      this.focusNode = undefined;
      unsetFocusSelector();
    }

    if (
      prev.layout.name !== curr.layout.name ||
      prev.namespaceLayout.name !== curr.namespaceLayout.name ||
      activeNamespacesChanged
    ) {
      this.errorBoundaryRef.current.cleanError();
    }

    if (curr.showLegend && this.props.activeTour) {
      this.props.endTour();
    }
  }

  componentWillUnmount() {
    // Disconnect from graph data source updates
    this.graphDataSource.removeListener('loadStart', this.handleGraphDataSourceStart);
    this.graphDataSource.removeListener('fetchError', this.handleGraphDataSourceError);
    this.graphDataSource.removeListener('fetchSuccess', this.handleGraphDataSourceSuccess);
    this.graphDataSource.removeListener('emptyNamespaces', this.handleGraphDataSourceEmpty);
  }

  render() {
    let conStyle = containerStyle;
    if (isKioskMode()) {
      conStyle = kioskContainerStyle;
    }
    const isEmpty = !(
      this.state.graphData.elements.nodes && Object.keys(this.state.graphData.elements.nodes).length > 0
    );
    const isReady = !(isEmpty || this.state.graphData.isError);
    const isReplayReady = this.props.replayActive && !!this.props.replayQueryTime;

    return (
      <>
        <FlexView className={conStyle} column={true}>
          <div>
            <GraphToolbar
              controller={this.controller}
              disabled={this.state.graphData.isLoading}
              elementsChanged={this.state.graphData.elementsChanged}
              isPF={true}
              onToggleHelp={this.toggleHelp}
            />
          </div>
          <FlexView grow={true} className={`${graphWrapperDivStyle} ${this.props.replayActive && replayBorder}`}>
            <ErrorBoundary
              ref={this.errorBoundaryRef}
              onError={this.notifyError}
              fallBackComponent={<GraphErrorBoundaryFallback />}
            >
              {this.props.showLegend && false && (
                <GraphLegend className={graphLegendStyle} closeLegend={this.props.toggleLegend} />
              )}
              {isReady && (
                <Chip
                  className={`${graphTimeRange} ${this.props.replayActive ? replayBackground : whiteBackground}`}
                  isReadOnly={true}
                >
                  {this.props.replayActive && <Badge style={{ marginRight: '4px' }} isRead={true}>{`Replay`}</Badge>}
                  {!isReplayReady && this.props.replayActive && `click Play to start`}
                  {!isReplayReady && !this.props.replayActive && `${this.displayTimeRange()}`}
                  {isReplayReady && `${this.displayTimeRange()}`}
                </Chip>
              )}
              {(!this.props.replayActive || isReplayReady) && (
                <div id="cytoscape-graph" className={graphContainerStyle}>
                  <EmptyGraphLayout
                    action={this.handleEmptyGraphAction}
                    elements={this.state.graphData.elements}
                    error={this.state.graphData.errorMessage}
                    isLoading={this.state.graphData.isLoading}
                    isError={!!this.state.graphData.isError}
                    isMiniGraph={false}
                    namespaces={this.state.graphData.fetchParams.namespaces}
                    showIdleNodes={this.props.showIdleNodes}
                    toggleIdleNodes={this.props.toggleIdleNodes}
                  >
                    <GraphPF
                      focusNode={this.focusNode}
                      graphData={this.state.graphData}
                      isMiniGraph={false}
                      {...this.props}
                    />
                  </EmptyGraphLayout>
                </div>
              )}
            </ErrorBoundary>
            {this.props.summaryData && (
              <SummaryPanel
                data={this.props.summaryData}
                duration={this.state.graphData.fetchParams.duration}
                graphType={this.props.graphType}
                injectServiceNodes={this.props.showServiceNodes}
                isPageVisible={this.props.isPageVisible}
                namespaces={this.props.activeNamespaces}
                onFocus={this.onFocus}
                onLaunchWizard={this.handleLaunchWizard}
                onDeleteTrafficRouting={this.handleDeleteTrafficRouting}
                queryTime={this.state.graphData.timestamp / 1000}
                trafficRates={this.props.trafficRates}
                {...computePrometheusRateParams(this.props.duration, NUMBER_OF_DATAPOINTS)}
              />
            )}
          </FlexView>
        </FlexView>
        <ServiceWizard
          show={this.state.wizardsData.showWizard}
          type={this.state.wizardsData.wizardType}
          update={this.state.wizardsData.updateMode}
          namespace={this.state.wizardsData.namespace}
          serviceName={this.state.wizardsData.serviceDetails?.service?.name || ''}
          workloads={this.state.wizardsData.serviceDetails?.workloads || []}
          subServices={this.state.wizardsData.serviceDetails?.subServices || []}
          createOrUpdate={
            canCreate(this.state.wizardsData.serviceDetails?.istioPermissions) ||
            canUpdate(this.state.wizardsData.serviceDetails?.istioPermissions)
          }
          virtualServices={this.state.wizardsData.serviceDetails?.virtualServices || []}
          destinationRules={this.state.wizardsData.serviceDetails?.destinationRules || []}
          gateways={this.state.wizardsData.gateways || []}
          k8sGateways={this.state.wizardsData.k8sGateways || []}
          k8sHTTPRoutes={this.state.wizardsData.serviceDetails?.k8sHTTPRoutes || []}
          peerAuthentications={this.state.wizardsData.peerAuthentications || []}
          tlsStatus={this.state.wizardsData.serviceDetails?.namespaceMTLS}
          onClose={this.handleWizardClose}
          istioAPIEnabled={this.props.istioAPIEnabled}
        />
        {this.state.showConfirmDeleteTrafficRouting && (
          <ConfirmDeleteTrafficRoutingModal
            isOpen={true}
            destinationRules={DestinationRuleC.fromDrArray(this.state.wizardsData.serviceDetails!.destinationRules)}
            virtualServices={this.state.wizardsData.serviceDetails!.virtualServices}
            k8sHTTPRoutes={this.state.wizardsData.serviceDetails!.k8sHTTPRoutes}
            onCancel={() => this.setState({ showConfirmDeleteTrafficRouting: false })}
            onConfirm={this.handleConfirmDeleteServiceTrafficRouting}
          />
        )}
      </>
    );
  }

  // TODO Focus...
  private onFocus = (focusNode: FocusNode) => {
    console.debug(`onFocus(${focusNode})`);
  };

  private handleEmptyGraphAction = () => {
    this.loadGraphDataFromBackend();
  };

  private handleGraphDataSourceSuccess = (
    graphTimestamp: TimeInSeconds,
    _,
    elements: DecoratedGraphElements,
    fetchParams: FetchParams
  ) => {
    const prevElements = this.state.graphData.elements;
    this.setState({
      graphData: {
        elements: elements,
        elementsChanged: CytoscapeGraphUtils.elementsChanged(prevElements, elements),
        isLoading: false,
        fetchParams: fetchParams,
        timestamp: graphTimestamp * 1000
      }
    });
    this.props.setGraphDefinition(this.graphDataSource.graphDefinition);
  };

  private handleGraphDataSourceError = (errorMessage: string | null, fetchParams: FetchParams) => {
    const prevElements = this.state.graphData.elements;
    this.setState({
      graphData: {
        elements: EMPTY_GRAPH_DATA,
        elementsChanged: CytoscapeGraphUtils.elementsChanged(prevElements, EMPTY_GRAPH_DATA),
        errorMessage: !!errorMessage ? errorMessage : undefined,
        isError: true,
        isLoading: false,
        fetchParams: fetchParams,
        timestamp: Date.now()
      }
    });
  };

  private handleGraphDataSourceEmpty = (fetchParams: FetchParams) => {
    const prevElements = this.state.graphData.elements;
    this.setState({
      graphData: {
        elements: EMPTY_GRAPH_DATA,
        elementsChanged: CytoscapeGraphUtils.elementsChanged(prevElements, EMPTY_GRAPH_DATA),
        isLoading: false,
        fetchParams: fetchParams,
        timestamp: Date.now()
      }
    });
  };

  private handleGraphDataSourceStart = (isPreviousDataInvalid: boolean, fetchParams: FetchParams) => {
    this.setState({
      graphData: {
        elements: isPreviousDataInvalid ? EMPTY_GRAPH_DATA : this.state.graphData.elements,
        elementsChanged: false,
        fetchParams: fetchParams,
        isLoading: true,
        timestamp: isPreviousDataInvalid ? Date.now() : this.state.graphData.timestamp
      }
    });
  };

  private handleLaunchWizard = (
    action: WizardAction,
    mode: WizardMode,
    namespace: string,
    serviceDetails: ServiceDetailsInfo,
    gateways: string[],
    peerAuths: PeerAuthentication[]
  ) => {
    this.setState(prevState => ({
      wizardsData: {
        ...prevState.wizardsData,
        showWizard: true,
        wizardType: action,
        updateMode: mode === 'update',
        namespace: namespace,
        serviceDetails: serviceDetails,
        gateways: gateways,
        peerAuthentications: peerAuths
      }
    }));
  };

  private handleWizardClose = (changed: boolean) => {
    if (changed) {
      this.setState(prevState => ({
        wizardsData: {
          ...prevState.wizardsData,
          showWizard: false
        }
      }));
      triggerRefresh();
    } else {
      this.setState(prevState => ({
        wizardsData: {
          ...prevState.wizardsData,
          showWizard: false
        }
      }));
    }
  };

  private handleDeleteTrafficRouting = (_key: string, serviceDetail: ServiceDetailsInfo) => {
    this.setState(prevState => ({
      showConfirmDeleteTrafficRouting: true,
      wizardsData: {
        ...prevState.wizardsData,
        serviceDetails: serviceDetail
      }
    }));
  };

  private handleConfirmDeleteServiceTrafficRouting = () => {
    this.setState({
      showConfirmDeleteTrafficRouting: false
    });

    deleteServiceTrafficRouting(this.state.wizardsData!.serviceDetails!)
      .then(_results => {
        triggerRefresh();
      })
      .catch(error => {
        AlertUtils.addError('Could not delete Istio config objects.', error);
      });
  };

  private toggleHelp = () => {
    if (this.props.showLegend) {
      this.props.toggleLegend();
    }
    if (this.props.activeTour) {
      this.props.endTour();
    } else {
      const firstStop = getNextTourStop(GraphTour, -1, 'forward');
      this.props.startTour({ info: GraphTour, stop: firstStop });
    }
  };

  private loadGraphDataFromBackend = () => {
    const queryTime: TimeInMilliseconds | undefined = !!this.props.replayQueryTime
      ? this.props.replayQueryTime
      : undefined;

    this.graphDataSource.fetchGraphData({
      boxByCluster: this.props.boxByCluster,
      boxByNamespace: this.props.boxByNamespace,
      duration: this.props.duration,
      edgeLabels: this.props.edgeLabels,
      graphType: this.props.graphType,
      includeHealth: true,
      includeLabels: this.props.findValue.includes('label:') || this.props.hideValue.includes('label:'),
      injectServiceNodes: this.props.showServiceNodes,
      namespaces: this.props.node ? [this.props.node.namespace] : this.props.activeNamespaces,
      node: this.props.node,
      queryTime: queryTime,
      showIdleEdges: this.props.showIdleEdges,
      showIdleNodes: this.props.showIdleNodes,
      showOperationNodes: this.props.showOperationNodes,
      showSecurity: this.props.showSecurity,
      trafficRates: this.props.trafficRates
    });
  };

  private notifyError = (error: Error, _componentStack: string) => {
    AlertUtils.add(`There was an error when rendering the graph: ${error.message}, please try a different layout`);
  };

  private displayTimeRange = () => {
    const rangeEnd: TimeInMilliseconds = this.state.graphData.timestamp;
    const rangeStart: TimeInMilliseconds = rangeEnd - this.props.duration * 1000;

    return toRangeString(rangeStart, rangeEnd, { second: '2-digit' }, { second: '2-digit' });
  };
}

const mapStateToProps = (state: KialiAppState) => ({
  activeNamespaces: activeNamespacesSelector(state),
  activeTour: state.tourState.activeTour,
  boxByCluster: state.graph.toolbarState.boxByCluster,
  boxByNamespace: state.graph.toolbarState.boxByNamespace,
  compressOnHide: state.graph.toolbarState.compressOnHide,
  duration: durationSelector(state),
  edgeLabels: edgeLabelsSelector(state),
  edgeMode: edgeModeSelector(state),
  findValue: findValueSelector(state),
  graphType: graphTypeSelector(state),
  hideValue: hideValueSelector(state),
  istioAPIEnabled: state.statusState.istioEnvironment.istioAPIEnabled,
  isPageVisible: state.globalState.isPageVisible,
  kiosk: state.globalState.kiosk,
  layout: state.graph.layout,
  mtlsEnabled: meshWideMTLSEnabledSelector(state),
  namespaceLayout: state.graph.namespaceLayout,
  node: state.graph.node,
  rankBy: state.graph.toolbarState.rankBy,
  refreshInterval: refreshIntervalSelector(state),
  replayActive: replayActiveSelector(state),
  replayQueryTime: replayQueryTimeSelector(state),
  showIdleEdges: state.graph.toolbarState.showIdleEdges,
  showIdleNodes: state.graph.toolbarState.showIdleNodes,
  showLegend: state.graph.toolbarState.showLegend,
  showMissingSidecars: state.graph.toolbarState.showMissingSidecars,
  showOperationNodes: state.graph.toolbarState.showOperationNodes,
  showRank: state.graph.toolbarState.showRank,
  showSecurity: state.graph.toolbarState.showSecurity,
  showServiceNodes: state.graph.toolbarState.showServiceNodes,
  showTrafficAnimation: state.graph.toolbarState.showTrafficAnimation,
  showVirtualServices: state.graph.toolbarState.showVirtualServices,
  summaryData: state.graph.summaryData,
  trace: state.jaegerState?.selectedTrace,
  trafficRates: trafficRatesSelector(state)
});

const mapDispatchToProps = (dispatch: KialiDispatch) => ({
  endTour: bindActionCreators(TourActions.endTour, dispatch),
  onNamespaceChange: bindActionCreators(GraphActions.onNamespaceChange, dispatch),
  onReady: (controller: any) => dispatch(GraphThunkActions.graphPFReady(controller)),
  setActiveNamespaces: (namespaces: Namespace[]) => dispatch(NamespaceActions.setActiveNamespaces(namespaces)),
  setEdgeMode: bindActionCreators(GraphActions.setEdgeMode, dispatch),
  setGraphDefinition: bindActionCreators(GraphActions.setGraphDefinition, dispatch),
  setLayout: bindActionCreators(GraphActions.setLayout, dispatch),
  setNode: bindActionCreators(GraphActions.setNode, dispatch),
  setRankResult: bindActionCreators(GraphActions.setRankResult, dispatch),
  setTraceId: (traceId?: string) => dispatch(JaegerThunkActions.setTraceId(traceId)),
  setUpdateTime: (val: TimeInMilliseconds) => dispatch(GraphActions.setUpdateTime(val)),
  startTour: bindActionCreators(TourActions.startTour, dispatch),
  toggleIdleNodes: bindActionCreators(GraphToolbarActions.toggleIdleNodes, dispatch),
  toggleLegend: bindActionCreators(GraphToolbarActions.toggleLegend, dispatch),
  updateSummary: (event: GraphEvent) => dispatch(GraphActions.updateSummary(event))
});

export const GraphPagePF = connectRefresh(connect(mapStateToProps, mapDispatchToProps)(GraphPagePFComponent));
