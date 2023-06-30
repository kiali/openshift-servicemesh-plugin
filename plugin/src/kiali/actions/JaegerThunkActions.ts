import { AxiosError } from 'axios';

import * as AlertUtils from '../utils/AlertUtils';
import * as API from '../services/Api';
import { KialiDispatch } from '../types/Redux';
import { JaegerActions } from './JaegerActions';
import { setTraceId as setURLTraceId } from 'utils/SearchParamUtils';
import { transformTraceData } from 'utils/tracing/TraceTransform';

export const JaegerThunkActions = {
  setTraceId: (cluster?: string, traceId?: string) => {
    setURLTraceId(traceId);
    return (dispatch: KialiDispatch) => {
      if (traceId) {
        API.getJaegerTrace(traceId)
          .then(response => {
            if (response.data.data) {
              const trace = transformTraceData(response.data.data, cluster);
              if (trace) {
                dispatch(JaegerActions.setTrace(trace));
              }
            }
          })
          .catch(error => {
            if ((error as AxiosError).response?.status === 404) {
              setURLTraceId(undefined);
            }
            dispatch(JaegerActions.setTrace(undefined));
            AlertUtils.addMessage({
              ...AlertUtils.extractAxiosError('Could not fetch trace', error),
              showNotification: false
            });
          });
      } else {
        dispatch(JaegerActions.setTrace(undefined));
      }
    };
  }
};
