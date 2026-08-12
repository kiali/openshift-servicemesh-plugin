import type { AnchorHTMLAttributes, FC, ReactNode } from 'react';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
// Fleet/lite chunks do not load KialiContainer's PatternFly base bundle; ship icon sizing
// rules with this component so production chunks do not depend on Console CSS load order.
import '@patternfly/patternfly/base/patternfly-svg-icons.css';

type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
};

const externalLinkIconStyle = { marginLeft: '0.25rem', verticalAlign: '-0.125em' } as const;

// ExternalLinkAltIcon ships both default and rh-ui paths when set is omitted, which nests
// SVGs and needs Console's pf-v6-icon-set-rh-ui CSS. Force a single path so dev webpack
// and in-cluster production builds render the same icon without that dependency.
export const ExternalLink: FC<ExternalLinkProps> = ({ children, className, ...props }) => (
  <a className={className} rel="noopener noreferrer" target="_blank" {...props}>
    {children} <ExternalLinkAltIcon aria-hidden set="default" style={externalLinkIconStyle} />
  </a>
);
