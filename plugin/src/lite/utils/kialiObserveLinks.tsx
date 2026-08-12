import * as React from 'react';
import { Link } from 'react-router-dom-v5-compat';
import { ExternalLink } from '../../openshift/components/ExternalLink';
import type { LiteKialiResource } from '../types/kiali';
import { getKialiServiceTarget } from './kialiServiceTarget';

export function getKialiStandaloneUrl(obj: LiteKialiResource, routeHostMap: Map<string, string>): string | undefined {
  const { name, namespace } = getKialiServiceTarget(obj);
  const webFqdn = obj.spec?.server?.web_fqdn?.trim();
  const routeHost = routeHostMap.get(`${namespace}/${name}`);
  const host = webFqdn || routeHost;
  return host ? `https://${host}` : undefined;
}

export function renderKialiObserveLinks(
  obj: LiteKialiResource,
  activeInConsole: boolean,
  routeHostMap: Map<string, string>,
  t: (key: string) => string
): React.ReactNode {
  const standaloneUrl = getKialiStandaloneUrl(obj, routeHostMap);
  const links: React.ReactNode[] = [];

  if (standaloneUrl) {
    links.push(
      <ExternalLink href={standaloneUrl} key="kiali">
        {t('Kiali')}
      </ExternalLink>
    );
  }

  if (activeInConsole) {
    links.push(
      <Link key="console" to="/ossmconsole/overview">
        {t('Console')}
      </Link>
    );
  }

  if (links.length === 0) {
    return '-';
  }

  return links.reduce<React.ReactNode>((acc, link, index) => {
    if (index === 0) {
      return link;
    }
    return (
      <>
        {acc}
        {' | '}
        {link}
      </>
    );
  }, null);
}
