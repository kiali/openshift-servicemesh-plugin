import * as React from 'react';
import {
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Radio,
  Switch,
  TextInput
} from '@patternfly/react-core';
import { GATEWAY_TOOLTIP, wizardTooltip } from './WizardHelp';
import { isValid } from 'utils/Common';
import { isK8sGatewayHostValid } from '../../utils/IstioConfigUtils';
import { serverConfig } from '../../config';

type Props = {
  serviceName: string;
  hasGateway: boolean;
  gateway: string;
  k8sGateways: string[];
  k8sRouteHosts: string[];
  onGatewayChange: (valid: boolean, gateway: K8sGatewaySelectorState) => void;
};

export type K8sGatewaySelectorState = {
  addGateway: boolean;
  gwHosts: string;
  gwHostsValid: boolean;
  newGateway: boolean;
  selectedGateway: string;
  gatewayClass: string;
  // @TODO add Mesh is not supported yet
  addMesh: boolean;
  port: number;
};

enum K8sGatewayForm {
  SWITCH,
  GW_HOSTS,
  SELECT,
  GATEWAY_SELECTED,
  PORT
}

export class K8sGatewaySelector extends React.Component<Props, K8sGatewaySelectorState> {
  constructor(props: Props) {
    super(props);
    this.state = {
      addGateway: props.hasGateway,
      gwHosts: props.k8sRouteHosts.join(','),
      gwHostsValid: true,
      newGateway: props.k8sGateways.length === 0,
      selectedGateway:
        props.k8sGateways.length > 0 ? (props.gateway !== '' ? props.gateway : props.k8sGateways[0]) : '',
      gatewayClass: serverConfig.gatewayAPIClasses[0].className,
      addMesh: false,
      port: 80
    };
  }

  checkGwHosts = (gwHosts: string): boolean => {
    // All k8s gateway hosts must be valid
    return gwHosts.split(',').every(host => {
      return isK8sGatewayHostValid(host);
    });
  };

  onFormChange = (component: K8sGatewayForm, value: string) => {
    switch (component) {
      case K8sGatewayForm.SWITCH:
        this.setState(
          prevState => {
            return {
              addGateway: !prevState.addGateway
            };
          },
          () => this.props.onGatewayChange(this.isGatewayValid(), this.state)
        );
        break;
      case K8sGatewayForm.GW_HOSTS:
        this.setState(
          {
            gwHosts: value,
            gwHostsValid: this.checkGwHosts(value)
          },
          () => this.props.onGatewayChange(this.isGatewayValid(), this.state)
        );
        break;
      case K8sGatewayForm.SELECT:
        this.setState(
          {
            newGateway: value === 'true'
          },
          () => this.props.onGatewayChange(this.isGatewayValid(), this.state)
        );
        break;
      case K8sGatewayForm.GATEWAY_SELECTED:
        this.setState(
          {
            selectedGateway: value
          },
          () => this.props.onGatewayChange(this.isGatewayValid(), this.state)
        );
        break;
      case K8sGatewayForm.PORT:
        this.setState(
          {
            port: +value
          },
          () => this.props.onGatewayChange(this.isGatewayValid(), this.state)
        );
        break;
      default:
      // No default action
    }
  };

  isGatewayValid = (): boolean => {
    // gwHostsValid is used as last validation, it's true by default
    return this.state.gwHostsValid;
  };

  onChangeGatewayClass = (_event, value) => {
    this.setState(
      {
        gatewayClass: value
      },
      () => this.props.onGatewayChange(this.isGatewayValid(), this.state)
    );
  };

  render() {
    return (
      <Form isHorizontal={true}>
        <FormGroup label="Add K8s API Gateway" fieldId="gatewaySwitch">
          <Switch
            id="advanced-gwSwitch"
            label={' '}
            labelOff={' '}
            isChecked={this.state.addGateway}
            onChange={() => this.onFormChange(K8sGatewayForm.SWITCH, '')}
          />
          <span>{wizardTooltip(GATEWAY_TOOLTIP)}</span>
        </FormGroup>
        {this.state.addGateway && (
          <>
            <FormGroup fieldId="selectGateway">
              <Radio
                id="existingGateway"
                name="selectGateway"
                label="Select K8s API Gateway"
                isDisabled={!this.state.addGateway || this.props.k8sGateways.length === 0}
                isChecked={!this.state.newGateway}
                onChange={() => this.onFormChange(K8sGatewayForm.SELECT, 'false')}
              />
              <Radio
                id="createGateway"
                name="selectGateway"
                label="Create K8s API Gateway"
                isDisabled={!this.state.addGateway}
                isChecked={this.state.newGateway}
                onChange={() => this.onFormChange(K8sGatewayForm.SELECT, 'true')}
              />
            </FormGroup>
            {!this.state.newGateway && (
              <FormGroup fieldId="selectGateway" label="K8sGateway">
                {this.props.k8sGateways.length > 0 && (
                  <FormSelect
                    id="selectGateway"
                    value={this.state.selectedGateway}
                    isDisabled={!this.state.addGateway || this.state.newGateway || this.props.k8sGateways.length === 0}
                    onChange={(_event, k8sGateway: string) =>
                      this.onFormChange(K8sGatewayForm.GATEWAY_SELECTED, k8sGateway)
                    }
                  >
                    {this.props.k8sGateways.map(k8sGateway => (
                      <FormSelectOption key={k8sGateway} value={k8sGateway} label={k8sGateway} />
                    ))}
                  </FormSelect>
                )}
                {this.props.k8sGateways.length === 0 && <>There are no K8s API gateways to select.</>}
              </FormGroup>
            )}
            {this.state.newGateway && (
              <>
                {serverConfig.gatewayAPIClasses.length > 1 && (
                  <FormGroup label="Gateway Class" fieldId="gatewayClass">
                    <FormSelect
                      value={this.state.gatewayClass}
                      onChange={this.onChangeGatewayClass}
                      id="gatewayClass"
                      name="gatewayClass"
                    >
                      {serverConfig.gatewayAPIClasses.map((option, index) => (
                        <FormSelectOption key={index} value={option.className} label={option.name} />
                      ))}
                    </FormSelect>
                  </FormGroup>
                )}
                <FormGroup fieldId="gwPort" label="Port">
                  <TextInput
                    id="gwPort"
                    name="gwPort"
                    type="number"
                    isDisabled={!this.state.addGateway || !this.state.newGateway}
                    value={this.state.port}
                    onChange={(_event, value) => this.onFormChange(K8sGatewayForm.PORT, value)}
                  />
                </FormGroup>
                <FormGroup fieldId="gwHosts" label="K8s API Gateway Hosts">
                  <TextInput
                    id="gwHosts"
                    name="gwHosts"
                    isDisabled={!this.state.addGateway || !this.state.newGateway}
                    value={this.state.gwHosts}
                    onChange={(_event, value) => this.onFormChange(K8sGatewayForm.GW_HOSTS, value)}
                    validated={isValid(this.state.gwHostsValid)}
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {isValid(this.state.gwHostsValid)
                          ? 'One or more hosts exposed by this gateway. Enter one or multiple hosts separated by comma'
                          : "K8s API Gateway hosts should be specified using FQDN format or '*.' format. IPs are not allowed."}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </>
            )}
          </>
        )}
      </Form>
    );
  }
}
