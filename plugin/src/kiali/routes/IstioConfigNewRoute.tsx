import * as React from 'react';
import { useParams } from 'react-router';
import { IstioConfigNewPage } from 'pages/IstioConfigNew/IstioConfigNewPage';

/**
 * IstioConfigNew wrapper to add routing parameters to IstioConfigNewPage
 * Some platforms where Kiali is deployed reuse IstioConfigNewPage but
 * do not work with react-router params (like Openshift Console)
 */
export const IstioConfigNewRoute = () => {
  const { objectType } = useParams<{ objectType: string }>();

  return <IstioConfigNewPage objectType={objectType}></IstioConfigNewPage>;
};
