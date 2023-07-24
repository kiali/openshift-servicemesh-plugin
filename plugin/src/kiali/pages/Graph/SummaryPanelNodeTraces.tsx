import * as React from 'react';
import { connect } from 'react-redux';
import { SimpleList, SimpleListItem, Button, Checkbox, Divider, ButtonVariant } from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import { kialiStyle } from 'styles/StyleUtils';

import { KialiAppState } from 'store/Store';
import { JaegerThunkActions } from 'actions/JaegerThunkActions';
import { history } from '../../app/History';
import * as API from '../../services/Api';
import * as AlertUtils from '../../utils/AlertUtils';
import { JaegerTrace } from 'types/JaegerInfo';
import { PromisesRegistry } from 'utils/CancelablePromises';
import { TracingQuery } from 'types/Tracing';
import { TimeInSeconds } from 'types/Common';
import { TraceListItem } from 'components/JaegerIntegration/TraceListItem';
import { summaryFont } from './SummaryPanelCommon';
import { DecoratedGraphNodeData } from 'types/Graph';
import { transformTraceData } from 'utils/tracing/TraceTransform';
import { isParentKiosk, kioskContextMenuAction } from '../../components/Kiosk/KioskActions';
import { KialiDispatch } from '../../types/Redux';

type ReduxProps = {
  kiosk: string;
  selectedTrace?: JaegerTrace;
  setTraceId: (cluster?: string, traceId?: string) => void;
};

type Props = ReduxProps & {
  nodeData: DecoratedGraphNodeData;
  queryTime: TimeInSeconds;
};

type State = {
  traces: JaegerTrace[];
  useGraphRefresh: boolean;
};

const tracesLimit = 15;

const refreshDivStyle = kialiStyle({
  display: 'inline-flex',
  width: '100%'
});

const checkboxStyle = kialiStyle({
  paddingBottom: 10,
  $nest: {
    '& > label': {
      fontSize: 'var(--graph-side-panel--font-size)',
      paddingTop: '4px'
    }
  }
});

const refreshButtonStyle = kialiStyle({
  padding: '2px 10px',
  margin: '5px 0 5px auto',
  top: -4
});

const dividerStyle = kialiStyle({
  paddingBottom: '3px'
});

class SummaryPanelNodeTracesComponent extends React.Component<Props, State> {
  private promises = new PromisesRegistry();

  static getDerivedStateFromProps(props: Props, state: State) {
    // Update the selected trace within list because it may have more up-to-date data after being selected hence fetched again
    if (props.selectedTrace) {
      const index = state.traces.findIndex(t => t.traceID === props.selectedTrace!.traceID);
      if (index >= 0) {
        state.traces[index] = props.selectedTrace;
      }
    }
    return state;
  }

  constructor(props: Props) {
    super(props);
    this.state = { traces: [], useGraphRefresh: false };
  }

  componentDidMount() {
    this.loadTraces();
  }

  componentDidUpdate(prevProps: Props) {
    if (
      (this.state.useGraphRefresh && prevProps.queryTime !== this.props.queryTime) ||
      prevProps.nodeData.namespace !== this.props.nodeData.namespace ||
      prevProps.nodeData.app !== this.props.nodeData.app ||
      prevProps.nodeData.workload !== this.props.nodeData.workload ||
      prevProps.nodeData.service !== this.props.nodeData.service
    ) {
      this.loadTraces();
    }
  }

  componentWillUnmount() {
    this.promises.cancelAll();
  }

  private loadTraces() {
    // Convert seconds to microseconds
    const params: TracingQuery = {
      startMicros: this.props.queryTime * 1000000,
      limit: tracesLimit
    };
    const d = this.props.nodeData;
    const promise = d.workload
      ? API.getWorkloadTraces(d.namespace, d.workload, params, d.cluster)
      : d.service
      ? API.getServiceTraces(d.namespace, d.service, params, d.cluster)
      : API.getAppTraces(d.namespace, d.app!, params, d.cluster);
    this.promises.cancelAll();
    this.promises
      .register('traces', promise)
      .then(response => {
        const traces = response.data.data
          ? (response.data.data
              .map(trace => transformTraceData(trace, this.props.nodeData.cluster))
              .filter(trace => trace !== null) as JaegerTrace[])
          : [];
        if (this.props.selectedTrace && !traces.some(t => t.traceID === this.props.selectedTrace!.traceID)) {
          // Put selected trace back in list
          traces.push(this.props.selectedTrace);
        }
        this.setState({ traces: traces });
      })
      .catch(error => {
        AlertUtils.addError('Could not fetch traces.', error);
      });
  }

  private onClickTrace(trace: JaegerTrace) {
    if (this.props.selectedTrace?.traceID === trace.traceID) {
      // Deselect
      this.props.setTraceId(this.props.nodeData.cluster, undefined);
    } else {
      this.props.setTraceId(this.props.nodeData.cluster, trace.traceID);
    }
  }

  render() {
    const d = this.props.nodeData;
    const tracesDetailsURL =
      `/namespaces/${d.namespace}` +
      (d.workload ? `/workloads/${d.workload}` : d.service ? `/services/${d.service}` : `/applications/${d.app!}`) +
      '?tab=traces';
    const currentID = this.props.selectedTrace?.traceID;

    return (
      <div style={{ marginBottom: 8 }}>
        <div className={refreshDivStyle}>
          <Checkbox
            id="use-graph-refresh"
            label="Use graph refresh"
            className={checkboxStyle}
            isChecked={this.state.useGraphRefresh}
            onChange={checked => this.setState({ useGraphRefresh: checked })}
          />
          <Button
            id="manual-refresh"
            isDisabled={this.state.useGraphRefresh}
            onClick={() => this.loadTraces()}
            aria-label="Refresh"
            variant={ButtonVariant.secondary}
            className={refreshButtonStyle}
          >
            <SyncAltIcon />
          </Button>
        </div>
        <Divider className={dividerStyle} />
        {this.state.traces.length > 0 && (
          <SimpleList style={{ marginBottom: 8 }} aria-label="Traces list">
            {this.state.traces.map(trace => {
              return (
                <SimpleListItem
                  key={'trace_' + trace.traceID}
                  onClick={() => this.onClickTrace(trace)}
                  isCurrent={trace.traceID === currentID}
                >
                  <TraceListItem trace={trace} />
                </SimpleListItem>
              );
            })}
          </SimpleList>
        )}
        <Button
          style={summaryFont}
          onClick={() => {
            if (isParentKiosk(this.props.kiosk)) {
              kioskContextMenuAction(tracesDetailsURL);
            } else {
              history.push(tracesDetailsURL);
            }
          }}
        >
          Show Traces
        </Button>
      </div>
    );
  }
}

const mapStateToProps = (state: KialiAppState) => ({
  kiosk: state.globalState.kiosk,
  selectedTrace: state.jaegerState.selectedTrace
});

const mapDispatchToProps = (dispatch: KialiDispatch) => ({
  setTraceId: (cluster?: string, traceId?: string) => dispatch(JaegerThunkActions.setTraceId(cluster, traceId))
});

export const SummaryPanelNodeTraces = connect(mapStateToProps, mapDispatchToProps)(SummaryPanelNodeTracesComponent);
