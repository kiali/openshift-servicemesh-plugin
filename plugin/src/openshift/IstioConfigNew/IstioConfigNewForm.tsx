import { getKialiStyle } from '@kiali/core-ui';
import { Form, Title, TitleSizes } from '@patternfly/react-core';
import * as React from 'react';

export const formStyle = getKialiStyle({
  margin: '1.5rem'
});

export interface IstioConfigNewFormProps {
  objectType: string;
  children: React.ReactNode;
}

export const IstioConfigNewForm = ({ objectType, children }: IstioConfigNewFormProps) => {
  const title = `Create ${objectType}`;
  return (
    <Form className={formStyle}>
      <Title headingLevel="h1" size={TitleSizes['2xl']}>
        {title}
      </Title>
      {children}
    </Form>
  );
};
