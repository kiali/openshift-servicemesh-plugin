import * as React from 'react';
import { Tooltip, TooltipPosition } from '@patternfly/react-core';
import { Link } from 'react-router-dom';
import { Status } from '../../types/Health';
import { Paths } from '../../config';
import { ActiveFilter, DEFAULT_LABEL_OPERATION } from '../../types/Filters';
import { healthFilter } from '../../components/Filters/CommonFilters';
import { FilterSelected } from '../../components/Filters/StatefulFilters';
import { createIcon } from '../../components/Health/Helper';
import { KialiAppState } from '../../store/Store';
import { connect } from 'react-redux';
import { isParentKiosk, kioskGraphAction } from '../../components/Kiosk/KioskActions';
import { durationSelector, refreshIntervalSelector } from '../../store/Selectors';
import { DurationInSeconds, IntervalInMilliseconds } from '../../types/Common';
import { healthIndicatorStyle } from 'components/Health/HealthStyle';

type ReduxProps = {
  duration: DurationInSeconds;
  kiosk: string;
  refreshInterval: IntervalInMilliseconds;
};

type Props = ReduxProps & {
  id: string;
  namespace: string;
  status: Status;
  items: string[];
  targetPage: Paths;
};

class OverviewStatusComponent extends React.Component<Props, {}> {
  setFilters = () => {
    const filters: ActiveFilter[] = [
      {
        category: healthFilter.category,
        value: this.props.status.name
      }
    ];
    FilterSelected.setSelected({ filters: filters, op: DEFAULT_LABEL_OPERATION });
  };

  linkAction = () => {
    // Kiosk actions are used when the kiosk specifies a parent,
    // otherwise the kiosk=true will keep the links inside Kiali
    if (isParentKiosk(this.props.kiosk)) {
      kioskGraphAction(
        this.props.namespace,
        this.props.status.name,
        this.props.duration,
        this.props.refreshInterval,
        this.props.targetPage
      );
    } else {
      this.setFilters();
    }
  };

  render() {
    const length = this.props.items.length;
    let items = this.props.items;
    if (items.length > 6) {
      items = items.slice(0, 5);
      items.push('and ' + (length - items.length) + ' more...');
    }
    const tooltipContent = (
      <div>
        <strong>{this.props.status.name}</strong>
        {items.map((app, idx) => {
          return (
            <div data-test={this.props.id + '-' + app} key={this.props.id + '-' + idx}>
              <span style={{ marginRight: '10px' }}>{createIcon(this.props.status, 'sm')}</span> {app}
            </div>
          );
        })}
      </div>
    );

    return (
      <Tooltip
        aria-label={'Overview status'}
        position={TooltipPosition.auto}
        content={tooltipContent}
        className={healthIndicatorStyle}
      >
        <div style={{ display: 'inline-block', marginRight: '5px' }}>
          <Link to={`/${this.props.targetPage}?namespaces=${this.props.namespace}`} onClick={() => this.linkAction()}>
            {createIcon(this.props.status)}
            {' ' + length}
          </Link>
        </div>
      </Tooltip>
    );
  }
}

const mapStateToProps = (state: KialiAppState) => ({
  duration: durationSelector(state),
  kiosk: state.globalState.kiosk,
  refreshInterval: refreshIntervalSelector(state)
});

export const OverviewStatus = connect(mapStateToProps)(OverviewStatusComponent);
