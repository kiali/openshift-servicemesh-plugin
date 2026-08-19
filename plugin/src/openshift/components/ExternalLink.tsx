import React from 'react';
import type { AnchorHTMLAttributes, FC, ReactNode } from 'react';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
// Fleet/lite chunks do not load KialiContainer's PatternFly base bundle; ship icon sizing
// rules with this component so production chunks do not depend on Console CSS load order.
import '@patternfly/patternfly/base/patternfly-svg-icons.css';

type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
};

const externalLinkIconStyle = { marginLeft: '0.25rem', verticalAlign: '-0.125em' } as const;

export const ExternalLink: FC<ExternalLinkProps> = ({ children, className, ...props }) => (
  <a className={className} rel="noopener noreferrer" target="_blank" {...props}>
    {children} <ExternalLinkAltIcon aria-hidden style={externalLinkIconStyle} />
  </a>
);
