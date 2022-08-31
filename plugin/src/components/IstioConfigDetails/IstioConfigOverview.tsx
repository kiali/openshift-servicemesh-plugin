import { Stack, StackItem, Title, TitleSizes, Tooltip, TooltipPosition } from '@patternfly/react-core';
import Labels from 'components/Label/Labels';
import { PFBadge } from 'components/Pf/PfBadges';
import { ValidationObjectSummary } from '../validations/ValidationObjectSummary';
import * as React from 'react';
import { IstioConfigDetails } from '../../types/IstioConfigDetails';
import {
  ObjectReference,
  ObjectValidation,
  ValidationMessage,
  ValidationTypes,
} from '../../types/IstioObjects';
import { style } from 'typestyle';
import { getIstioObject, getReconciliationCondition } from 'utils/IstioConfigUtils';
import IstioConfigReferences from './IstioConfigReferences';
import IstioConfigValidationReferences from './IstioConfigValidationReferences';
import IstioStatusMessageList from './IstioStatusMessageList';

interface IstioConfigOverviewProps {
  istioObjectDetails: IstioConfigDetails;
  istioValidations?: ObjectValidation;
  statusMessages: ValidationMessage[];
  objectReferences: ObjectReference[];
  selectedLine?: string;
}

const iconStyle = style({
  margin: '0 0 0 0',
  padding: '0 0 0 0',
  display: 'inline-block',
  verticalAlign: '2px !important'
});

const infoStyle = style({
  margin: '0px 0px 2px 10px',
  verticalAlign: '-5px !important'
});

const healthIconStyle = style({
  marginLeft: '10px',
  verticalAlign: '-1px !important'
});

const resourceListStyle = style({
  margin: '0px 0 11px 0',
  $nest: {
    '& > ul > li > span': {
      float: 'left',
      width: '125px',
      fontWeight: 700
    }
  }
});

class IstioConfigOverview extends React.Component<IstioConfigOverviewProps> {
  configurationHasWarnings = (): boolean | undefined => {
    return this.props.istioValidations?.checks.some(check => {
      return check.severity === ValidationTypes.Warning;
    });
  };

  render() {
    const istioObject = getIstioObject(this.props.istioObjectDetails);

    return (
      <Stack hasGutter={true}>
        <StackItem>
          <Title headingLevel="h3" size={TitleSizes.xl}>
            Overview
          </Title>
        </StackItem>
        <StackItem>
          {istioObject && istioObject.kind && (
            <>
              <div className={iconStyle}>
                {istioObject.kind?.toLowerCase()}
              </div>
              {istioObject?.metadata.name}
              {this.props.istioValidations && (!this.props.statusMessages || this.props.statusMessages.length === 0)
                && (!this.props.istioValidations.checks || this.props.istioValidations.checks.length === 0)
                && (
                <span className={healthIconStyle}>
                  <ValidationObjectSummary
                    id={'config-validation'}
                    validations={[this.props.istioValidations]}
                    reconciledCondition={getReconciliationCondition(this.props.istioObjectDetails)}
                  />
                </span>
              )}
            </>
          )}
        </StackItem>

        {istioObject?.metadata.labels && (
          <StackItem>
            <Labels tooltipMessage="Labels defined on this resource" labels={istioObject?.metadata.labels}></Labels>
          </StackItem>
        )}

        {((this.props.statusMessages && this.props.statusMessages.length > 0 ) ||
          (this.props.istioValidations && this.props.istioValidations.checks && this.props.istioValidations.checks.length > 0 ) ) && (
          <StackItem>
            <IstioStatusMessageList messages={this.props.statusMessages} checks={this.props.istioValidations?.checks} />
          </StackItem>
        )}

        {this.props.istioValidations?.references && (
          <StackItem>
            <IstioConfigValidationReferences objectReferences={this.props.istioValidations.references} />
          </StackItem>
        )}

        {this.props.istioValidations?.valid && !this.configurationHasWarnings() && (
          <StackItem>
            <IstioConfigReferences objectReferences={this.props.objectReferences}/>
          </StackItem>
        )}
      </Stack>
    );
  }
}

export default IstioConfigOverview;
