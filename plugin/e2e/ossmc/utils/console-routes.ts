const workloadResources: Record<string, string> = {
  CronJob: 'cronjobs',
  DaemonSet: 'daemonsets',
  Deployment: 'deployments',
  DeploymentConfig: 'deploymentconfigs',
  Job: 'jobs',
  Pod: 'pods',
  ReplicaSet: 'replicasets',
  StatefulSet: 'statefulsets'
};

/** Translate standalone Kiali navigation to the routes registered by the Console plugin. */
export function toOssmcConsolePath(path: string): string {
  if (!path.startsWith('/console/')) {
    return path;
  }

  const url = new URL(path, 'http://localhost');
  const [page, namespace, resource, ...nameParts] = url.pathname.slice('/console/'.length).split('/');
  const name = nameParts.join('/');
  let pathname: string;

  if (page === 'graph') {
    pathname = url.pathname
      .replace(/^\/console\/graph\/node\/namespaces(?=\/|$)/, '/ossmconsole/graph/ns')
      .replace(/^\/console\/graph\/namespaces(?=\/|$)/, '/ossmconsole/graph')
      .replace(/^\/console\//, '/ossmconsole/');
  } else if (page === 'namespaces' && namespace) {
    if (!resource) {
      pathname = `/k8s/cluster/projects/${namespace}/ossmconsole`;
    } else if (!name) {
      pathname = `/ossmconsole/${resource}`;
      url.searchParams.set('namespaces', namespace);
    } else {
      switch (resource) {
        case 'applications':
          pathname = `/ossmconsole/applications/${namespace}/${name}`;
          break;
        case 'workloads': {
          const kind = url.searchParams.get('type') ?? 'Deployment';
          const k8sResource = workloadResources[kind] ?? 'deployments';
          if (url.searchParams.has('type')) {
            url.searchParams.delete('type');
          }
          pathname = `/k8s/ns/${namespace}/${k8sResource}/${name}/ossmconsole`;
          break;
        }
        case 'services':
          pathname =
            url.searchParams.get('type') === 'External' || name.includes('.')
              ? `/ossmconsole/services/${namespace}/${name}`
              : `/k8s/ns/${namespace}/services/${name}/ossmconsole`;
          break;
        case 'pods':
          pathname = `/k8s/ns/${namespace}/pods/${name}/ossmconsole`;
          break;
        case 'istio': {
          const [group, version, kind, ...objectName] = nameParts;
          if (!group || !version || !kind || !objectName.join('/')) {
            throw new Error(`Invalid Istio detail route: ${path}`);
          }
          pathname = `/k8s/ns/${namespace}/${group}~${version}~${kind}/${objectName.join('/')}/ossmconsole`;
          break;
        }
        default:
          throw new Error(`Unsupported namespace resource route: ${path}`);
      }
    }
  } else {
    pathname = url.pathname.replace(/^\/console\//, '/ossmconsole/');
  }

  return `${pathname}${url.search}${url.hash}`;
}
