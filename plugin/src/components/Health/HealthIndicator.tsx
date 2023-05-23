import * as React from 'react';
import { PopoverPosition, Tooltip } from '@patternfly/react-core';
import { HealthDetails } from './HealthDetails';
import { Health, NA, Status } from '@kiali/types';
import { createIcon } from './Helper';
import { createTooltipIcon } from '@kiali/core-ui';
import './Health.scss';

interface Props {
  id: string;
  health?: Health;
  tooltipPlacement?: PopoverPosition;
}

interface HealthState {
  globalStatus: Status;
}

export class HealthIndicator extends React.PureComponent<Props, HealthState> {
  static getDerivedStateFromProps(props: Props) {
    return {
      globalStatus: props.health ? props.health.getGlobalStatus() : NA
    };
  }

  constructor(props: Props) {
    super(props);
    this.state = HealthIndicator.getDerivedStateFromProps(props);
  }

  render() {
    if (this.props.health) {
      // HealthIndicator will render always in SMALL mode
      const icon = createIcon(this.state.globalStatus, 'sm');
      return (
        <Tooltip
          aria-label={'Health indicator'}
          content={
            <div>
              <strong>{this.state.globalStatus.name}</strong>
              <HealthDetails health={this.props.health} />
            </div>
          }
          position={PopoverPosition.auto}
          className={'health_indicator'}
        >
          {createTooltipIcon(icon)}
        </Tooltip>
      );
    }
    return <span />;
  }
}
