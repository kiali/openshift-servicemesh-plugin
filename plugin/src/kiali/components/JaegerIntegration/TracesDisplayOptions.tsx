import * as React from 'react';
import { Checkbox, Dropdown, DropdownToggle, Radio, Tooltip, TooltipPosition } from '@patternfly/react-core';
import { infoStyle, itemStyleWithoutInfo, menuStyle, titleStyle } from 'styles/DropdownStyles';
import { HistoryManager, URLParam } from 'app/History';
import { KialiIcon } from 'config/KialiIcon';

export interface QuerySettings {
  percentile?: string;
  errorsOnly: boolean;
  limit: number;
}

export interface DisplaySettings {
  showSpansAverage: boolean;
}

export const percentilesOptions: DisplayOptionType[] = [
  { id: 'all', labelText: 'All' },
  { id: '0.75', labelText: 'p75' },
  { id: '0.9', labelText: 'p90' },
  { id: '0.99', labelText: 'p99' }
];

interface Props {
  disabled: boolean;
  onQuerySettingsChanged: (settings: QuerySettings) => void;
  onDisplaySettingsChanged: (settings: DisplaySettings) => void;
  percentilesPromise: Promise<Map<string, number>>;
}

type State = QuerySettings &
  DisplaySettings & {
    isOpen: boolean;
  };

interface DisplayOptionType {
  id: string;
  labelText: string;
}

export class TracesDisplayOptions extends React.Component<Props, State> {
  private computedPercentiles: Map<string, number> | undefined;

  constructor(props: Props) {
    super(props);
    const displaySettings = TracesDisplayOptions.retrieveDisplaySettings();
    const querySettings = TracesDisplayOptions.retrieveQuerySettings();
    this.state = { ...displaySettings, ...querySettings, isOpen: false };
    props.percentilesPromise.then(p => (this.computedPercentiles = p));
  }

  public static retrieveDisplaySettings(): DisplaySettings {
    const spansAverage =
      HistoryManager.getParam(URLParam.JAEGER_SHOW_SPANS_AVG) ||
      sessionStorage.getItem(URLParam.JAEGER_SHOW_SPANS_AVG) ||
      'false';
    return {
      showSpansAverage: spansAverage === 'true'
    };
  }

  public static retrieveQuerySettings(): QuerySettings {
    const limit =
      HistoryManager.getParam(URLParam.JAEGER_LIMIT_TRACES) ||
      sessionStorage.getItem(URLParam.JAEGER_LIMIT_TRACES) ||
      '100';
    const errorsOnly =
      HistoryManager.getParam(URLParam.JAEGER_ERRORS_ONLY) ||
      sessionStorage.getItem(URLParam.JAEGER_ERRORS_ONLY) ||
      'false';
    const percentile =
      HistoryManager.getParam(URLParam.JAEGER_PERCENTILE) ||
      sessionStorage.getItem(URLParam.JAEGER_PERCENTILE) ||
      undefined;
    return {
      errorsOnly: errorsOnly === 'true',
      limit: Number(limit),
      percentile: percentile
    };
  }

  private onToggle = isOpen => {
    this.setState({ isOpen: isOpen });
  };

  render() {
    const { isOpen } = this.state;
    return (
      <Dropdown
        toggle={
          <DropdownToggle id={'traces-display-settings'} isDisabled={this.props.disabled} onToggle={this.onToggle}>
            Display
          </DropdownToggle>
        }
        isOpen={isOpen}
      >
        {this.getPopoverContent()}
      </Dropdown>
    );
  }

  private getPopoverContent() {
    return (
      <div id="traces-display-menu" className={menuStyle}>
        <div style={{ marginTop: '10px' }}>
          <span className={titleStyle} style={{ position: 'relative', bottom: '3px', paddingRight: 0 }}>
            Filter by percentile
          </span>
          <Tooltip
            key="tooltip_filter_by_percentile"
            position={TooltipPosition.right}
            content={
              <div style={{ textAlign: 'left' }}>
                <div>
                  These percentiles are computed from metrics. To refresh them, reload the page. The filter applies on
                  span durations. Thus, the filtered traces are the ones where at least one span for the service
                  satisfies the duration criteria.
                </div>
              </div>
            }
          >
            <KialiIcon.Info className={infoStyle} />
          </Tooltip>
        </div>
        {percentilesOptions.map(item => {
          let label = item.labelText;
          if (this.computedPercentiles) {
            const val = this.computedPercentiles!.get(item.id);
            if (val) {
              label += ` (${val.toFixed(2)}ms+)`;
            }
          }
          return (
            <div key={item.id}>
              <label key={item.id} className={itemStyleWithoutInfo}>
                <Radio
                  id={item.id}
                  name={'percentiles' + item.id}
                  isChecked={item.id === this.state.percentile || (item.id === 'all' && !this.state.percentile)}
                  label={label}
                  onChange={checked => this.onPercentileChanged(item.id, checked)}
                  value={item.id}
                />
              </label>
            </div>
          );
        })}
        <div className={titleStyle}>Errors</div>
        <div>
          <label className={itemStyleWithoutInfo}>
            <Checkbox
              id="errors-only"
              name="errors-only"
              isChecked={this.state.errorsOnly}
              label="Show only traces with errors"
              onChange={this.onErrorsOnlyChanged}
              value="errors-only"
            />
          </label>
        </div>
        <div style={{ marginTop: '10px' }}>
          <span className={titleStyle} style={{ position: 'relative', bottom: '3px', paddingRight: 0 }}>
            Limit per query
          </span>
          <Tooltip
            key="tooltip_limit_per_query"
            position={TooltipPosition.right}
            content={
              <div style={{ textAlign: 'left' }}>
                <div>
                  This limits the number of app-level traces that will be fetched. Because an app may be comprised of
                  several workload versions not every trace trace may apply to a particular workload. It may be
                  necessary to increase the limit to get the desired number of workload traces. In some cases the same
                  can be true of service traces.
                </div>
              </div>
            }
          >
            <KialiIcon.Info className={infoStyle} />
          </Tooltip>
        </div>
        {[20, 100, 500, 1000].map(limit => (
          <div key={'limit-' + limit}>
            <label key={'limit-' + limit} className={itemStyleWithoutInfo}>
              <Radio
                id={'limit-' + limit}
                name={'limit-' + limit}
                isChecked={this.state.limit === limit}
                label={String(limit)}
                onChange={checked => this.onLimitChanged(limit, checked)}
                value={String(limit)}
              />
            </label>
          </div>
        ))}
        <div className={titleStyle}>Value axis</div>
        <div>
          <label className={itemStyleWithoutInfo}>
            <Radio
              id="yaxis-full"
              name="yaxis-full"
              isChecked={!this.state.showSpansAverage}
              label="Full trace duration"
              onChange={() => this.onValueAxisChanged(false)}
              value="yaxis-full"
            />
          </label>
        </div>
        <div>
          <label className={itemStyleWithoutInfo}>
            <Radio
              id="yaxis-avg"
              name="yaxis-avg"
              isChecked={this.state.showSpansAverage}
              label="Spans average duration"
              onChange={() => this.onValueAxisChanged(true)}
              value="yaxis-avg"
            />
          </label>
        </div>
      </div>
    );
  }

  private onPercentileChanged = (id: string, checked: boolean) => {
    if (checked) {
      this.saveValue(URLParam.JAEGER_PERCENTILE, id);
      this.setState({ percentile: id }, () => this.props.onQuerySettingsChanged(this.state));
    }
  };

  private onErrorsOnlyChanged = (checked: boolean) => {
    this.saveValue(URLParam.JAEGER_ERRORS_ONLY, String(checked));
    this.setState({ errorsOnly: checked }, () => this.props.onQuerySettingsChanged(this.state));
  };

  private onLimitChanged = (limit: number, checked: boolean) => {
    if (checked) {
      this.saveValue(URLParam.JAEGER_LIMIT_TRACES, String(limit));
      this.setState({ limit: limit }, () => this.props.onQuerySettingsChanged(this.state));
    }
  };

  private onValueAxisChanged = (showSpansAverage: boolean) => {
    this.saveValue(URLParam.JAEGER_SHOW_SPANS_AVG, String(showSpansAverage));
    this.setState({ showSpansAverage: showSpansAverage }, () => this.props.onDisplaySettingsChanged(this.state));
  };

  private saveValue = (key: URLParam, value: string) => {
    sessionStorage.setItem(key, value);
    HistoryManager.setParam(key, value);
  };
}
