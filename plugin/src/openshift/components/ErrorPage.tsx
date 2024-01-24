import * as React from 'react';
import { PFColors } from 'components/Pf/PfColors';
import { kialiStyle } from 'styles/StyleUtils';
import { NestedCSSProperties } from 'typestyle/lib/types';

export interface OSSMCError {
  title?: string;
  message?: string;
}

interface ErrorPageProps {
  title?: string;
  message?: string;
}

const h1Style: NestedCSSProperties = {
  fontFamily: 'var(--pf-global--FontFamily--heading--sans-serif)',
  fontWeight: 'var(--pf-global--FontWeight--normal)',
  fontSize: 'var(--pf-global--FontSize--2xl)',
  lineHeight: 'var(--pf-global--LineHeight--sm)'
};

const headerStyle = kialiStyle({
  ...h1Style,
  padding: '1.5rem',
  borderBottom: `1px solid ${PFColors.BorderColor100}`
});

const errorStyle = kialiStyle({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center'
});

const titleStyle = kialiStyle({
  ...h1Style,
  margin: '1rem 1.5rem 1.5rem'
});

const messageStyle = kialiStyle({
  fontFamily: 'var(--pf-global--FontFamily--sans-serif)'
});

export const ErrorPage: React.FC<ErrorPageProps> = ({ title = 'Error', message = 'Unexpected error occurred' }) => {
  return (
    <>
      <h1 className={headerStyle}>Error</h1>
      <div className={errorStyle}>
        <h1 className={titleStyle}>{title}</h1>
        <div className={messageStyle}>{message}</div>
      </div>
    </>
  );
};
