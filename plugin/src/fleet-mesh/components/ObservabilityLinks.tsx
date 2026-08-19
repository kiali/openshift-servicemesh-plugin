import React from 'react';
import type { FC, ReactNode } from 'react';
import { ExternalLink } from '../../openshift/components/ExternalLink';
import type { KialiLink } from '../types/kiali';

const KialiExternalLink: FC<{ children: ReactNode; href: string }> = ({ children, href }) => (
  <ExternalLink href={href}>{children}</ExternalLink>
);

// Hub in-console OSSMC links open in a new tab so Console's cross-perspective redirect
// does not push a duplicate same-tab history entry (which breaks the browser back button
// on the Fleet Service Mesh page the user came from).
const OssmcConsoleLink: FC<{ children: ReactNode; url: string }> = ({ children, url }) => (
  <KialiExternalLink href={url}>{children}</KialiExternalLink>
);

function renderObservabilityLink(
  link: KialiLink,
  t: (key: string) => string,
  labels: { kiali: string; ossmc: string }
): ReactNode {
  if (link.standaloneUrl) {
    return <KialiExternalLink href={link.standaloneUrl}>{t(labels.kiali)}</KialiExternalLink>;
  }
  if (link.ossmcUrl) {
    return <OssmcConsoleLink url={link.ossmcUrl}>{t(labels.ossmc)}</OssmcConsoleLink>;
  }
  return '-';
}

export { KialiExternalLink, OssmcConsoleLink, renderObservabilityLink };
