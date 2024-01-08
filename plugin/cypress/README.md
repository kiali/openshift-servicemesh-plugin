# Cypress Visual Testing with BDD framework

These are visual tests for OSSMC plugin that are meant to be run against a live OCP instance or OpenShift Local (CRC).

## Prerequisites

Installed all dev dependencies from plugin folder. Ensure the `baseUrl` field in the `cypress.config.ts` file is pointing to the console you are trying to test, alternatively you can set `CYPRESS_BASE_URL` environment variable or pass via cmd line `yarn cypress --config baseUrl=http://localhost:9000` to overwrite default `baseUrl`. 


Before you start using Cypress suite, you might need export some environment variables:

```bash
export CYPRESS_BASE_URL=<value>               # defaults to http://localhost:3000
export CYPRESS_OC_CLUSTER_USER=<value>        # defaults to jenkins, opt. kubeadmin
export CYPRESS_OC_CLUSTER_PASS=<value>        # no defaults
export CYPRESS_OC_IDP=<value>                 # defaults to my_htpasswd_provider
```


Tests for OSSMC can be run with the cypress browser:

```bash
yarn cypress:open
```

or in headless mode:

```bash
yarn cypress:run
```
