import axios from 'axios';

import { IstioConfigsMap } from '../types/IstioConfigList';
import {IstioConfigDetails} from "../../../../kiali/frontend/src/types/IstioConfigDetails";

export interface Response<T> {
  data: T;
}

/** Create content type correctly for a given request type */
const getHeadersWithMethod = method => {
  return {'Content-Type': 'application/x-www-form-urlencoded'};
};

const ALL_ISTIO_CONFIGS = '/api/istio/config'

export enum HTTP_VERBS {
    DELETE = 'DELETE',
    GET = 'get',
    PATCH = 'patch',
    POST = 'post',
    PUT = 'put'
}

const newRequest = <P>(method: HTTP_VERBS, url: string, queryParams: any, data: any) =>
  axios.request<P>({
    method: method,
    url: url,
    data: data,
    headers: getHeadersWithMethod(method),
    params: queryParams
  });

export const getAllIstioConfigs = (
    kialiUrl: string,
): Promise<Response<IstioConfigsMap>> => {
  const params: any = {};

  params.validate = true;
  return newRequest<IstioConfigsMap>(HTTP_VERBS.GET, kialiUrl + ALL_ISTIO_CONFIGS, params, {});
};

export const getIstioConfig = (
    kialiUrl: string,
    namespace: string,
    object_type: string,
    object: string,
): Promise<Response<IstioConfigDetails>> => {
    const params: any = {};

    params.validate = true;
    return newRequest<IstioConfigDetails>(HTTP_VERBS.GET, `${kialiUrl}/api/namespaces/${namespace}/istio/${object_type}/${object}`, params, {});
};
