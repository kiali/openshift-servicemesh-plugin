import * as React from 'react';
import { Workload } from '../../types/Workload';
import { Card, CardBody, CardHeader, Title, TitleSizes, Tooltip, TooltipPosition } from '@patternfly/react-core';
import { kialiStyle } from 'styles/StyleUtils';
import { Labels } from '../../components/Label/Labels';
import { LocalTime } from '../../components/Time/LocalTime';
import { TextOrLink } from '../../components/TextOrLink';
import { renderAPILogo, renderRuntimeLogo } from '../../components/Logo/Logos';
import * as H from '../../types/Health';
import { KialiIcon } from '../../config/KialiIcon';
import { HealthIndicator } from '../../components/Health/HealthIndicator';
import { isMultiCluster, serverConfig } from '../../config';
import { MissingSidecar } from '../../components/MissingSidecar/MissingSidecar';
import { PFBadge, PFBadges } from '../../components/Pf/PfBadges';
import { MissingLabel } from '../../components/MissingLabel/MissingLabel';
import { MissingAuthPolicy } from 'components/MissingAuthPolicy/MissingAuthPolicy';
import { hasMissingAuthPolicy } from 'utils/IstioConfigUtils';
import { DetailDescription } from '../../components/DetailDescription/DetailDescription';
import { isGateway, isWaypoint } from '../../helpers/LabelFilterHelper';
import { AmbientLabel } from '../../components/Ambient/AmbientLabel';
import { validationKey } from '../../types/IstioConfigList';

type WorkloadDescriptionProps = {
  workload?: Workload;
  health?: H.Health;
  namespace: string;
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

export class WorkloadDescription extends React.Component<WorkloadDescriptionProps> {
  render() {
    const workload = this.props.workload;
    const apps: string[] = [];
    const services: string[] = [];

    if (workload) {
      if (workload.labels[serverConfig.istioLabels.appLabelName]) {
        apps.push(workload.labels[serverConfig.istioLabels.appLabelName]);
      }
      workload.services?.forEach(s => services.push(s.name));
    }

    const isTemplateLabels =
      workload &&
      ['Deployment', 'ReplicaSet', 'ReplicationController', 'DeploymentConfig', 'StatefulSet'].indexOf(workload.type) >=
        0;
    const runtimes = (workload?.runtimes || []).map(r => r.name).filter(name => name !== '');

    const workloadProperties = workload ? (
      <>
        <div key="properties-list" className={resourceListStyle}>
          <ul style={{ listStyleType: 'none' }}>
            {workload.istioInjectionAnnotation !== undefined && (
              <li>
                <span>Istio Injection</span>
                {String(workload.istioInjectionAnnotation)}
              </li>
            )}
            <li>
              <span>Type</span>
              {workload.type ? workload.type : 'N/A'}
            </li>
            <li>
              <span>Created</span>
              <div style={{ display: 'inline-block' }}>
                <LocalTime time={workload.createdAt} />
              </div>
            </li>
            <li>
              <span>Version</span>
              {workload.resourceVersion}
            </li>
            {workload.additionalDetails.map((additionalItem, idx) => {
              return (
                <li key={'additional-details-' + idx} id={'additional-details-' + idx}>
                  <span>{additionalItem.title}</span>
                  {additionalItem.icon && renderAPILogo(additionalItem.icon, undefined, idx)}
                  <TextOrLink text={additionalItem.value} urlTruncate={64} />
                </li>
              );
            })}
            {runtimes.length > 0 && (
              <li id="runtimes">
                <span>Runtimes</span>
                <div style={{ display: 'inline-block' }}>
                  {runtimes
                    .map((rt, idx) => renderRuntimeLogo(rt, idx))
                    .reduce(
                      (list: JSX.Element[], elem) =>
                        list.length > 0 ? [...list, <span key="sep"> | </span>, elem] : [elem],
                      []
                    )}
                </div>
              </li>
            )}
          </ul>
        </div>
      </>
    ) : undefined;

    return workload ? (
      <Card id={'WorkloadDescriptionCard'} data-test="workload-description-card">
        <CardHeader style={{ display: 'table' }}>
          <Title headingLevel="h5" size={TitleSizes.lg}>
            <div key="service-icon" className={iconStyle}>
              <PFBadge badge={PFBadges.Workload} position={TooltipPosition.top} />
            </div>
            {this.props.workload ? this.props.workload.name : 'Workload'}
            {workloadProperties ? (
              <Tooltip
                position={TooltipPosition.right}
                content={<div style={{ textAlign: 'left' }}>{workloadProperties}</div>}
              >
                <KialiIcon.Info className={infoStyle} />
              </Tooltip>
            ) : undefined}
            <span className={healthIconStyle}>
              <HealthIndicator id={workload.name} health={this.props.health} />
            </span>
            {this.props.workload &&
              !this.props.workload.istioSidecar &&
              !this.props.workload.istioAmbient &&
              !isWaypoint(this.props.workload.labels) && (
                <MissingSidecar
                  data-test={`missing-sidecar-badge-for-${workload.name}-workload-in-${this.props.namespace}-namespace`}
                  namespace={this.props.namespace}
                  tooltip={true}
                  style={{ marginLeft: '10px' }}
                  text={''}
                  isGateway={isGateway(workload.labels)}
                />
              )}
            {this.props.workload && this.props.workload.istioAmbient && !isWaypoint(this.props.workload.labels) && (
              <AmbientLabel
                tooltip={true}
                waypoint={this.props.workload.waypointWorkloads?.length > 0 ? true : false}
              />
            )}
            {this.props.workload &&
              hasMissingAuthPolicy(
                validationKey(this.props.workload.name, this.props.namespace),
                this.props.workload.validations
              ) && (
                <MissingAuthPolicy
                  namespace={this.props.namespace}
                  tooltip={true}
                  style={{ marginLeft: '10px' }}
                  text={''}
                />
              )}
            {this.props.workload &&
              (!this.props.workload.appLabel || !this.props.workload.versionLabel) &&
              !isWaypoint(this.props.workload.labels) && (
                <MissingLabel
                  missingApp={!this.props.workload.appLabel}
                  missingVersion={!this.props.workload.versionLabel}
                  style={{ marginLeft: '10px' }}
                  tooltip={true}
                />
              )}
          </Title>
          {this.props.workload?.cluster && isMultiCluster && (
            <div key="cluster-icon" className={iconStyle}>
              <PFBadge badge={PFBadges.Cluster} position={TooltipPosition.right} /> {this.props.workload.cluster}
            </div>
          )}
        </CardHeader>
        <CardBody>
          {workload.labels && (
            <Labels
              labels={workload.labels}
              tooltipMessage={isTemplateLabels ? 'Labels defined on the Workload template' : undefined}
            />
          )}
          <DetailDescription
            namespace={this.props.namespace}
            apps={apps}
            services={services}
            health={this.props.health}
            cluster={this.props.workload?.cluster}
            waypointWorkloads={
              this.props.workload
                ? isWaypoint(this.props.workload.labels)
                  ? this.props.workload.waypointWorkloads
                  : undefined
                : undefined
            }
          />
        </CardBody>
      </Card>
    ) : (
      'Loading'
    );
  }
}
