export const mockPayload = {
  answer:
    "Of course. I've just surfaced the relevant documentation for you in the UI.\n\nIn a nutshell, a **VirtualService** is an Istio configuration resource that defines the rules for how requests are routed to services within the service mesh.",
  referenced_docs: [
    {
      doc_title: 'Configuring Request Timeouts',
      doc_url: 'https://istio.io/latest/docs/tasks/traffic-management/request-timeouts/'
    },
    {
      doc_title: 'Istio Traffic Shifting (Canary Rollouts)',
      doc_url: 'https://istio.io/latest/docs/tasks/traffic-management/traffic-shifting/'
    }
  ]
};

export const singleActionPayload = {
  actions: [
    {
      title: 'View services List',
      kind: 'navigation',
      payload: '/services?namespaces=bookinfo'
    }
  ],
  answer: "I'm taking you to the services list for the bookinfo namespace now.\n"
};

export const multipleActionsPayload = {
  actions: [
    {
      title: 'View services List',
      kind: 'navigation',
      payload: '/services?namespaces=bookinfo'
    },
    {
      title: 'View services List mocked',
      kind: 'navigation',
      payload: '/services?namespaces=bookinfo'
    }
  ],
  answer: "I'm taking you to the services list for the bookinfo namespace now.\n"
};

export const autoNavigatePayload = {
  actions: [
    {
      title: 'View services List',
      kind: 'navigation',
      payload: '/services?namespaces=bookinfo'
    }
  ],
  answer: 'Sure, I can navigate you to the services in the bookinfo namespace.'
};

const virtualServiceYamlCreate = `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: vs-ai-cypress
  namespace: bookinfo
spec:
  hosts:
    - reviews
  http:
    - route:
        - destination:
            host: reviews
`;

const virtualServiceYamlPatch = `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: vs-ai-cypress
  namespace: bookinfo
spec:
  hosts:
    - reviews
  http:
    - timeout: 2s
      route:
        - destination:
            host: reviews
`;

const virtualServiceYamlDelete = `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: vs-ai-cypress
  namespace: bookinfo
spec:
  hosts:
    - reviews
`;

export const fileCreateYamlPayload = {
  answer: 'Here is a VirtualService you can create in bookinfo.',
  actions: [
    {
      kind: 'file',
      title: 'Create VirtualService',
      fileName: 'vs-ai-cypress.yaml',
      operation: 'create',
      namespace: 'bookinfo',
      group: 'networking.istio.io',
      version: 'v1',
      kindName: 'VirtualService',
      object: 'vs-ai-cypress',
      payload: virtualServiceYamlCreate
    }
  ]
};

export const filePatchYamlPayload = {
  answer: 'Apply this patch to the existing VirtualService.',
  actions: [
    {
      kind: 'file',
      title: 'Patch VirtualService',
      fileName: 'vs-ai-cypress.yaml',
      operation: 'patch',
      namespace: 'bookinfo',
      group: 'networking.istio.io',
      version: 'v1',
      kindName: 'VirtualService',
      object: 'vs-ai-cypress',
      payload: virtualServiceYamlPatch
    }
  ]
};

export const fileDeleteYamlPayload = {
  answer: 'Confirm deletion of this VirtualService.',
  actions: [
    {
      kind: 'file',
      title: 'Delete VirtualService',
      fileName: 'vs-ai-cypress.yaml',
      operation: 'delete',
      namespace: 'bookinfo',
      group: 'networking.istio.io',
      version: 'v1',
      kindName: 'VirtualService',
      object: 'vs-ai-cypress',
      payload: virtualServiceYamlDelete
    }
  ]
};
