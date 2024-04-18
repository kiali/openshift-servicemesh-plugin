import * as React from 'react';
import { isK8sGatewayHostValid } from '../../../utils/IstioConfigUtils';
import { Button, ButtonVariant, FormSelect, FormSelectOption, TextInput } from '@patternfly/react-core';
import { isValid } from '../../../utils/Common';
import { ListenerForm } from '../K8sGatewayForm';
import { Td, Tr } from '@patternfly/react-table';
import { addSelectorLabels } from './ListenerList';
import { MAX_PORT, MIN_PORT } from '../../../types/IstioObjects';
import { KialiIcon } from 'config/KialiIcon';

type ListenerBuilderProps = {
  index: number;
  listener: ListenerForm;
  onChange: (listenerForm: ListenerForm, i: number) => void;
  onRemoveListener: (i: number) => void;
};

// Only HTTPRoute is supported in Istio
export const protocols = ['HTTP'];
export const allowedRoutes = ['All', 'Selector', 'Same'];

export const isValidName = (name: string): boolean => {
  return name !== undefined && name.length > 0;
};

export const isValidHostname = (hostname: string): boolean => {
  return hostname !== undefined && hostname.length > 0 && isK8sGatewayHostValid(hostname);
};

export const isValidPort = (port: string): boolean => {
  return port.length > 0 && !isNaN(Number(port)) && Number(port) >= MIN_PORT && Number(port) <= MAX_PORT;
};

export const isValidSelector = (selector: string): boolean => {
  return selector.length === 0 || typeof addSelectorLabels(selector) !== 'undefined';
};

export const ListenerBuilder: React.FC<ListenerBuilderProps> = (props: ListenerBuilderProps) => {
  const onAddHostname = (_event: React.FormEvent, value: string): void => {
    const l = props.listener;
    l.hostname = value.trim();

    props.onChange(l, props.index);
  };

  const onAddPort = (_event: React.FormEvent, value: string): void => {
    const l = props.listener;
    l.port = value.trim();

    props.onChange(l, props.index);
  };

  const onAddName = (_event: React.FormEvent, value: string): void => {
    const l = props.listener;
    l.name = value.trim();

    props.onChange(l, props.index);
  };

  const onAddProtocol = (_event: React.FormEvent, value: string): void => {
    const l = props.listener;
    l.protocol = value.trim();

    props.onChange(l, props.index);
  };

  const onAddFrom = (_event: React.FormEvent, value: string): void => {
    const l = props.listener;
    l.from = value.trim();

    props.onChange(l, props.index);
  };

  const onAddSelectorLabels = (_event: React.FormEvent, value: string): void => {
    const l = props.listener;
    l.sSelectorLabels = value.trim();

    props.onChange(l, props.index);
  };

  return (
    <Tr>
      <Td>
        <TextInput
          value={props.listener.name}
          type="text"
          id={`addName_${props.index}`}
          aria-describedby="add name"
          onChange={onAddName}
          validated={isValid(isValidName(props.listener.name))}
        />
      </Td>

      <Td>
        <TextInput
          value={props.listener.hostname}
          type="text"
          id={`addHostname_${props.index}`}
          aria-describedby="add hostname"
          name="addHostname"
          onChange={onAddHostname}
          validated={isValid(isValidHostname(props.listener.hostname))}
        />
      </Td>

      <Td>
        <TextInput
          value={props.listener.port}
          type="text"
          id={`addPort_${props.index}`}
          placeholder="80"
          aria-describedby="add port"
          name="addPortNumber"
          onChange={onAddPort}
          validated={isValid(isValidPort(props.listener.port))}
        />
      </Td>

      <Td>
        <FormSelect
          value={props.listener.protocol}
          id={`addPortProtocol_${props.index}`}
          name="addPortProtocol"
          onChange={onAddProtocol}
        >
          {protocols.map((option, index) => (
            <FormSelectOption isDisabled={false} key={`p_${index}`} value={option} label={option} />
          ))}
        </FormSelect>
      </Td>

      <Td>
        <FormSelect value={props.listener.from} id={`addFrom_${props.index}`} name="addFrom" onChange={onAddFrom}>
          {allowedRoutes.map((option, index) => (
            <FormSelectOption isDisabled={false} key={`p_${index}`} value={option} label={option} />
          ))}
        </FormSelect>
      </Td>

      <Td>
        <TextInput
          id={`addSelectorLabels_${props.index}`}
          name="addSelectorLabels"
          onChange={onAddSelectorLabels}
          validated={isValid(isValidSelector(props.listener.sSelectorLabels))}
        />
      </Td>

      <Td>
        <Button
          id={`deleteBtn_${props.index}`}
          variant={ButtonVariant.link}
          icon={<KialiIcon.Trash />}
          style={{ padding: 0 }}
          onClick={() => props.onRemoveListener(props.index)}
        />
      </Td>
    </Tr>
  );
};
