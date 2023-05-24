import * as React from 'react';
import { IstioConfigNewForm } from './IstioConfigNewForm';

const GatewayForm = () => {
  return <IstioConfigNewForm objectType={'K8sGateway'}>K8s Gateway Form</IstioConfigNewForm>;
};

export default GatewayForm;
