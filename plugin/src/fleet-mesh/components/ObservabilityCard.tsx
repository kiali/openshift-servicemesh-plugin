import type { FC } from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm
} from '@patternfly/react-core';
import type { KialiLink } from '../types/kiali';
import { kialiStandaloneLinkLabel, ossmcLinkLabel } from '../utils/observabilityLinkLabels';
import { useKialiTranslation } from 'utils/I18nUtils';
import { KialiExternalLink, OssmcConsoleLink } from './ObservabilityLinks';

function firstStandaloneUrl(links: KialiLink[]): string | undefined {
  return links.find(link => link.standaloneUrl)?.standaloneUrl;
}

function firstOssmcUrl(links: KialiLink[]): string | undefined {
  return links.find(link => link.ossmcUrl)?.ossmcUrl;
}

/** Always-visible detail card with horizontal Kiali and OSSMC rows. */
const ObservabilityCard: FC<{ links: KialiLink[] }> = ({ links }) => {
  const { t } = useKialiTranslation();
  const standaloneUrl = firstStandaloneUrl(links);
  const ossmcUrl = firstOssmcUrl(links);

  return (
    <Card isCompact>
      <CardTitle>
        <strong>{t('Observability')}</strong>
      </CardTitle>
      <CardBody>
        <DescriptionList isCompact isHorizontal>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <strong>{t('Kiali')}:</strong>
            </DescriptionListTerm>
            <DescriptionListDescription>
              {standaloneUrl ? (
                <KialiExternalLink href={standaloneUrl}>{kialiStandaloneLinkLabel(standaloneUrl)}</KialiExternalLink>
              ) : (
                t('Kiali not available')
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <strong>{t('OSSMC')}:</strong>
            </DescriptionListTerm>
            <DescriptionListDescription>
              {ossmcUrl ? (
                <OssmcConsoleLink url={ossmcUrl}>{ossmcLinkLabel(ossmcUrl, t('Console'))}</OssmcConsoleLink>
              ) : (
                t('OSSMC not available')
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </CardBody>
    </Card>
  );
};

export default ObservabilityCard;
