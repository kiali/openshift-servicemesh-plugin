import * as React from 'react';
import { connect } from 'react-redux';
import { kialiStyle } from 'styles/StyleUtils';
import { SummaryPanelEdge } from './SummaryPanelEdge';
import { SummaryPanelGraph } from './SummaryPanelGraph';
import { SummaryPanelAppBox } from './SummaryPanelAppBox';
import { SummaryPanelPropType, BoxByType, SummaryData, NodeAttr } from '../../types/Graph';
import { KialiIcon } from 'config/KialiIcon';
import { SummaryPanelNode } from './SummaryPanelNode';
import { JaegerState } from 'reducers/JaegerState';
import { SummaryPanelTraceDetails } from './SummaryPanelTraceDetails';
import { KialiAppState } from 'store/Store';
import { SummaryPanelClusterBox } from './SummaryPanelClusterBox';
import { SummaryPanelNamespaceBox } from './SummaryPanelNamespaceBox';
import { GraphTourStops } from 'pages/Graph/GraphHelpTour';
import { TourStop } from 'components/Tour/TourStop';
import { summaryPanelWidth } from './SummaryPanelCommon';
import { WizardAction, WizardMode } from 'components/IstioWizards/WizardActions';
import { ServiceDetailsInfo } from '../../types/ServiceInfo';
import { PeerAuthentication } from '../../types/IstioObjects';
import { FocusNode } from 'pages/GraphPF/GraphPF';

type SummaryPanelState = {
  isVisible: boolean;
};

type MainSummaryPanelPropType = SummaryPanelPropType & {
  isPageVisible: boolean;
  jaegerState: JaegerState;
  kiosk: string;
  onDeleteTrafficRouting?: (key: string, serviceDetails: ServiceDetailsInfo) => void;
  onFocus?: (focusNode: FocusNode) => void;
  onLaunchWizard?: (
    key: WizardAction,
    mode: WizardMode,
    namespace: string,
    serviceDetails: ServiceDetailsInfo,
    gateways: string[],
    peerAuths: PeerAuthentication[]
  ) => void;
};

const mainStyle = kialiStyle({
  fontSize: 'var(--graph-side-panel--font-size)',
  padding: '0',
  position: 'relative'
});

const expandedStyle = kialiStyle({ height: '100%' });

const expandedHalfStyle = kialiStyle({ height: '50%' });

const collapsedStyle = kialiStyle({
  $nest: {
    '& > .panel': {
      display: 'none'
    }
  }
});

const summaryPanelBottomSplit = kialiStyle({
  height: '50%',
  width: summaryPanelWidth,
  minWidth: summaryPanelWidth,
  overflowY: 'auto'
});

const toggleSidePanelStyle = kialiStyle({
  backgroundColor: 'white',
  border: '1px #ddd solid',
  borderRadius: '3px',
  bottom: 0,
  cursor: 'pointer',
  left: '-1.6em',
  minWidth: '5em',
  position: 'absolute',
  textAlign: 'center',
  transform: 'rotate(-90deg)',
  transformOrigin: 'left top 0'
});

class SummaryPanelComponent extends React.Component<MainSummaryPanelPropType, SummaryPanelState> {
  constructor(props: MainSummaryPanelPropType) {
    super(props);
    this.state = {
      isVisible: true
    };
  }

  componentDidUpdate(prevProps: Readonly<MainSummaryPanelPropType>): void {
    if (prevProps.data.summaryTarget !== this.props.data.summaryTarget) {
      this.setState({ isVisible: true });
    }
  }

  render() {
    if (!this.props.isPageVisible || !this.props.data.summaryTarget) {
      return null;
    }

    const mainTopStyle = this.state.isVisible
      ? this.props.jaegerState.selectedTrace
        ? expandedHalfStyle
        : expandedStyle
      : collapsedStyle;

    return (
      <TourStop info={[GraphTourStops.Graph, GraphTourStops.ContextualMenu, GraphTourStops.SidePanel]}>
        <div id="graph-side-panel" className={mainStyle}>
          <div className={mainTopStyle}>
            <div className={toggleSidePanelStyle} onClick={this.togglePanel}>
              {this.state.isVisible ? (
                <>
                  <KialiIcon.AngleDoubleDown /> Hide
                </>
              ) : (
                <>
                  <KialiIcon.AngleDoubleUp /> Show
                </>
              )}
            </div>
            {this.getSummaryPanel(this.props.data)}
          </div>
          {this.props.jaegerState.selectedTrace && this.state.isVisible && (
            <div className={`panel panel-default ${summaryPanelBottomSplit}`}>
              <div className="panel-body">
                <SummaryPanelTraceDetails
                  data={this.props.data}
                  graphType={this.props.graphType}
                  jaegerURL={this.props.jaegerState.info?.url}
                  onFocus={this.props.onFocus}
                  trace={this.props.jaegerState.selectedTrace}
                />
              </div>
            </div>
          )}
        </div>
      </TourStop>
    );
  }

  private getSummaryPanel = (summary: SummaryData): React.ReactFragment => {
    const isPF = !!summary.isPF;
    const summaryType = summary.summaryType as string;

    switch (summaryType) {
      case 'box': {
        const boxType: BoxByType = isPF
          ? summary.summaryTarget.getData()[NodeAttr.isBox]
          : summary.summaryTarget.data(NodeAttr.isBox);
        switch (boxType) {
          case 'app':
            return (
              <SummaryPanelAppBox
                data={summary}
                duration={this.props.duration}
                graphType={this.props.graphType}
                injectServiceNodes={this.props.injectServiceNodes}
                kiosk={this.props.kiosk}
                namespaces={this.props.data.summaryTarget.namespaces}
                queryTime={this.props.queryTime}
                rateInterval={this.props.rateInterval}
                step={this.props.step}
                trafficRates={this.props.trafficRates}
              />
            );
          case 'cluster':
            return (
              <SummaryPanelClusterBox
                data={summary}
                duration={this.props.duration}
                graphType={this.props.graphType}
                injectServiceNodes={this.props.injectServiceNodes}
                kiosk={this.props.kiosk}
                namespaces={this.props.data.summaryTarget.namespaces}
                queryTime={this.props.queryTime}
                rateInterval={this.props.rateInterval}
                step={this.props.step}
                trafficRates={this.props.trafficRates}
              />
            );
          case 'namespace':
            return (
              <SummaryPanelNamespaceBox
                data={summary}
                duration={this.props.duration}
                graphType={this.props.graphType}
                injectServiceNodes={this.props.injectServiceNodes}
                kiosk={this.props.kiosk}
                namespaces={this.props.data.summaryTarget.namespaces}
                queryTime={this.props.queryTime}
                rateInterval={this.props.rateInterval}
                step={this.props.step}
                trafficRates={this.props.trafficRates}
              />
            );
          default:
            return <></>;
        }
      }
      case 'edge':
        return <SummaryPanelEdge {...this.props} />;
      case 'graph':
        return (
          <SummaryPanelGraph
            data={summary}
            duration={this.props.duration}
            graphType={this.props.graphType}
            injectServiceNodes={this.props.injectServiceNodes}
            kiosk={this.props.kiosk}
            namespaces={this.props.namespaces}
            queryTime={this.props.queryTime}
            rateInterval={this.props.rateInterval}
            step={this.props.step}
            trafficRates={this.props.trafficRates}
          />
        );
      case 'node':
        return (
          <SummaryPanelNode
            data={this.props.data}
            duration={this.props.duration}
            graphType={this.props.graphType}
            injectServiceNodes={this.props.injectServiceNodes}
            namespaces={this.props.namespaces}
            rateInterval={this.props.rateInterval}
            onLaunchWizard={this.props.onLaunchWizard}
            onDeleteTrafficRouting={this.props.onDeleteTrafficRouting}
            queryTime={this.props.queryTime}
            step={this.props.step}
            trafficRates={this.props.trafficRates}
          />
        );
      default:
        return <></>;
    }
  };

  private togglePanel = () => {
    this.setState((state: SummaryPanelState) => ({
      isVisible: !state.isVisible
    }));
  };
}

const mapStateToProps = (state: KialiAppState) => ({
  jaegerState: state.jaegerState,
  kiosk: state.globalState.kiosk
});

export const SummaryPanel = connect(mapStateToProps)(SummaryPanelComponent);
