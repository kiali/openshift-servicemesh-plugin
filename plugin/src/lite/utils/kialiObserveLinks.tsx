import * as React from 'react';
import { ExternalLink } from '../../openshift/components/ExternalLink';
import { buildSafeHttpsUrlFromHost } from 'openshift/utils/safeUrlUtils';
import type { LiteKialiResource } from '../types/kiali';
import { getKialiServiceTarget } from './kialiServiceTarget';

export function getKialiStandaloneUrl(obj: LiteKialiResource, routeHostMap: Map<string, string>): string | undefined {
  const { name, namespace } = getKialiServiceTarget(obj);
  const webFqdn = obj.spec?.server?.web_fqdn?.trim();
  const routeHost = routeHostMap.get(`${namespace}/${name}`);
  return buildSafeHttpsUrlFromHost(webFqdn) ?? buildSafeHttpsUrlFromHost(routeHost);
}

export function renderKialiObserveLinks(
  obj: LiteKialiResource,
  _activeInConsole: boolean,
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

  if (links.length === 0) {
    return '-';
  }

  return links[0];
}
