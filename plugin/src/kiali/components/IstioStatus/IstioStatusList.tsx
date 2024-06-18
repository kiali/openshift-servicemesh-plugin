import * as React from 'react';
import { List, Text, TextContent, TextVariants } from '@patternfly/react-core';
import { ComponentStatus, Status } from '../../types/IstioStatus';
import { IstioComponentStatus } from './IstioComponentStatus';
import { PFColors } from '../Pf/PfColors';
import { kialiStyle } from 'styles/StyleUtils';
import { useKialiTranslation } from 'utils/I18nUtils';

type Props = {
  status: ComponentStatus[];
};

const listStyle = kialiStyle({
  paddingLeft: 0,
  marginTop: 0,
  marginLeft: 0
});

export const IstioStatusList: React.FC<Props> = (props: Props) => {
  const { t } = useKialiTranslation();

  const nonhealthyComponents = (): ComponentStatus[] => {
    return props.status.filter((c: ComponentStatus) => c.status !== Status.Healthy);
  };

  const coreComponentsStatus = (): ComponentStatus[] => {
    return nonhealthyComponents().filter((s: ComponentStatus) => s.is_core);
  };

  const addonComponentsStatus = (): ComponentStatus[] => {
    return nonhealthyComponents().filter((s: ComponentStatus) => !s.is_core);
  };

  const renderComponentList = (): React.ReactNode => {
    const groups = {
      core: coreComponentsStatus,
      addon: addonComponentsStatus
    };

    return ['core', 'addon'].map((group: string) => {
      return (
        <React.Fragment key={`status-${group}`}>
          {groups[group]().map((status: ComponentStatus) => {
            return <IstioComponentStatus key={`status-${group}-${status.name}`} componentStatus={status} />;
          })}
        </React.Fragment>
      );
    });
  };

  return (
    <TextContent style={{ color: PFColors.White }}>
      <Text component={TextVariants.h4}>{t('Istio Components Status')}</Text>

      <List id="istio-status" aria-label={t('Istio Component List')} className={listStyle}>
        {renderComponentList()}
      </List>
    </TextContent>
  );
};
