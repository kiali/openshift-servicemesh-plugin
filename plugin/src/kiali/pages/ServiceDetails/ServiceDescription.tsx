import * as React from 'react';
import { Card, CardBody, CardHeader, Title, TitleSizes, Tooltip, TooltipPosition } from '@patternfly/react-core';
import { ServiceDetailsInfo, WorkloadOverview } from '../../types/ServiceInfo';
import { AppWorkload } from '../../types/App';
import { isMultiCluster, serverConfig } from '../../config';
import { Labels } from '../../components/Label/Labels';
import { kialiStyle } from 'styles/StyleUtils';
import { LocalTime } from '../../components/Time/LocalTime';
import { renderAPILogo } from '../../components/Logo/Logos';
import { TextOrLink } from '../../components/TextOrLink';
import { KialiIcon } from '../../config/KialiIcon';
import { HealthIndicator } from '../../components/Health/HealthIndicator';
import { PFBadge, PFBadges } from '../../components/Pf/PfBadges';
import { DetailDescription } from '../../components/DetailDescription/DetailDescription';

interface ServiceInfoDescriptionProps {
  namespace: string;
  serviceDetails?: ServiceDetailsInfo;
}

type State = {
  serviceInfoTabKey: number;
};

const resourceListStyle = kialiStyle({
  margin: '0px 0 11px 0',
  $nest: {
    '& > ul > li > span': {
      float: 'left',
      width: '125px',
      fontWeight: 700
    }
  }
});

const iconStyle = kialiStyle({
  margin: '0 0 0 0',
  padding: '0 0 0 0',
  display: 'inline-block',
  verticalAlign: '2px !important'
});

const infoStyle = kialiStyle({
  margin: '0px 0px 2px 10px',
  verticalAlign: '-5px !important'
});

const healthIconStyle = kialiStyle({
  marginLeft: '10px',
  verticalAlign: '-1px !important'
});

export class ServiceDescription extends React.Component<ServiceInfoDescriptionProps, State> {
  constructor(props: ServiceInfoDescriptionProps) {
    super(props);
    this.state = {
      serviceInfoTabKey: 0
    };
  }

  serviceInfoHandleTabClick = (_event, tabIndex) => {
    this.setState({
      serviceInfoTabKey: tabIndex
    });
  };

  render() {
    const apps: string[] = [];
    const workloads: AppWorkload[] = [];
    if (this.props.serviceDetails) {
      if (this.props.serviceDetails.workloads) {
        this.props.serviceDetails.workloads
          .sort((w1: WorkloadOverview, w2: WorkloadOverview) => (w1.name < w2.name ? -1 : 1))
          .forEach(wk => {
            if (wk.labels) {
              const appName = wk.labels[serverConfig.istioLabels.appLabelName];
              if (!apps.includes(appName)) {
                apps.push(appName);
              }
            }
            workloads.push({
              workloadName: wk.name,
              istioSidecar: wk.istioSidecar,
              istioAmbient: wk.istioAmbient,
              serviceAccountNames: wk.serviceAccountNames,
              labels: wk.labels ? wk.labels : {}
            });
          });
      }
    }
    // We will show service labels only when there is some label that is not present in the selector
    let showServiceLabels = false;
    if (
      this.props.serviceDetails &&
      this.props.serviceDetails.service.labels &&
      this.props.serviceDetails.service.selectors
    ) {
      const keys = Object.keys(this.props.serviceDetails.service.labels);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = this.props.serviceDetails.service.labels[key];
        if (this.props.serviceDetails.service.selectors[key] !== value) {
          showServiceLabels = true;
          break;
        }
      }
    }
    const serviceProperties = (
      <div key="properties-list" className={resourceListStyle}>
        <ul style={{ listStyleType: 'none' }}>
          {this.props.serviceDetails && (
            <li>
              <span>Created</span>
              <div style={{ display: 'inline-block' }}>
                <LocalTime time={this.props.serviceDetails.service.createdAt} />
              </div>
            </li>
          )}
          {this.props.serviceDetails && (
            <li>
              <span>Version</span>
              {this.props.serviceDetails.service.resourceVersion}
            </li>
          )}
          {this.props.serviceDetails &&
            this.props.serviceDetails.additionalDetails &&
            this.props.serviceDetails.additionalDetails.map((additionalItem, idx) => {
              return (
                <li key={'additional-details-' + idx} id={'additional-details-' + idx}>
                  <span>{additionalItem.title}</span>
                  {additionalItem.icon && renderAPILogo(additionalItem.icon, undefined, idx)}
                  <TextOrLink text={additionalItem.value} urlTruncate={64} />
                </li>
              );
            })}
        </ul>
      </div>
    );

    const serviceName = this.props.serviceDetails ? this.props.serviceDetails.service.name : 'Service';
    let serviceBadge = PFBadges.Service;
    if (this.props.serviceDetails && this.props.serviceDetails.service) {
      switch (this.props.serviceDetails.service.type) {
        case 'External':
          serviceBadge = PFBadges.ExternalService;
          break;
        case 'Federation':
          serviceBadge = PFBadges.FederatedService;
          break;
        default:
          serviceBadge = PFBadges.Service;
      }
    }
    return (
      <Card id={'ServiceDescriptionCard'}>
        <CardHeader style={{ display: 'table' }}>
          <Title headingLevel="h5" size={TitleSizes.lg}>
            <div key="service-icon" className={iconStyle}>
              <PFBadge badge={serviceBadge} position={TooltipPosition.top} />
            </div>
            {serviceName}
            <Tooltip
              position={TooltipPosition.right}
              content={<div style={{ textAlign: 'left' }}>{serviceProperties}</div>}
            >
              <KialiIcon.Info className={infoStyle} />
            </Tooltip>
            <span className={healthIconStyle}>
              <HealthIndicator
                id={serviceName}
                health={this.props.serviceDetails ? this.props.serviceDetails.health : undefined}
              />
            </span>
          </Title>
          {this.props.serviceDetails?.cluster && isMultiCluster && (
            <div key="cluster-icon" className={iconStyle}>
              <PFBadge badge={PFBadges.Cluster} position={TooltipPosition.right} /> {this.props.serviceDetails.cluster}
            </div>
          )}
        </CardHeader>
        <CardBody>
          {this.props.serviceDetails && showServiceLabels && (
            <Labels
              labels={this.props.serviceDetails.service.labels}
              tooltipMessage={'Labels defined on the Service'}
            />
          )}
          {this.props.serviceDetails && (
            <Labels
              labels={this.props.serviceDetails.service.selectors}
              tooltipMessage={'Labels defined on the ' + (showServiceLabels ? 'Selector' : 'Service and Selector')}
            />
          )}
          <DetailDescription
            namespace={this.props.namespace}
            apps={apps}
            workloads={workloads}
            health={this.props.serviceDetails?.health}
            cluster={this.props.serviceDetails?.cluster}
          />
        </CardBody>
      </Card>
    );
  }
}
