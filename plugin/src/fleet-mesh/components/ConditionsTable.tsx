import type { FC } from 'react';
import { Timestamp } from '@openshift-console/dynamic-plugin-sdk';
import { Tooltip } from '@patternfly/react-core';
import type { K8sCondition } from '../types/common';
import { statusIcon } from '../utils/statusIcon';
import { useKialiTranslation } from 'utils/I18nUtils';

interface ConditionsTableProps {
  conditions: K8sCondition[];
}

export const ConditionsTable: FC<ConditionsTableProps> = ({ conditions }) => {
  const { t } = useKialiTranslation();
  return (
    <table className="pf-v6-c-table pf-m-grid-md pf-m-compact" role="grid">
      <thead className="pf-v6-c-table__thead">
        <tr className="pf-v6-c-table__tr">
          <th className="pf-v6-c-table__th" scope="col">
            <Tooltip content={t('The type of condition reported by the mesh controller.')}>
              <span>{t('Type')}</span>
            </Tooltip>
          </th>
          <th className="pf-v6-c-table__th" scope="col">
            <Tooltip content={t('The condition status: True, False, or Unknown.')}>
              <span>{t('Status')}</span>
            </Tooltip>
          </th>
          <th className="pf-v6-c-table__th" scope="col">
            <Tooltip content={t('A machine-readable reason code for the condition.')}>
              <span>{t('Reason')}</span>
            </Tooltip>
          </th>
          <th className="pf-v6-c-table__th" scope="col">
            <Tooltip content={t('A human-readable message explaining the condition.')}>
              <span>{t('Message')}</span>
            </Tooltip>
          </th>
          <th className="pf-v6-c-table__th" scope="col">
            <Tooltip content={t('When the condition last changed status.')}>
              <span>{t('Last Transition')}</span>
            </Tooltip>
          </th>
        </tr>
      </thead>
      <tbody className="pf-v6-c-table__tbody">
        {conditions.map(c => (
          <tr className="pf-v6-c-table__tr" key={`${c.type ?? ''}-${c.reason ?? ''}-${c.lastTransitionTime ?? ''}`}>
            <td className="pf-v6-c-table__td">{c.type}</td>
            <td className="pf-v6-c-table__td">{statusIcon(c.status)}</td>
            <td className="pf-v6-c-table__td">{c.reason ?? '-'}</td>
            <td className="pf-v6-c-table__td">{c.message ?? '-'}</td>
            <td className="pf-v6-c-table__td">
              {c.lastTransitionTime ? <Timestamp timestamp={c.lastTransitionTime} /> : '-'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
