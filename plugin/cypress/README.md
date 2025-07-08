# Cypress Visual Testing with BDD framework

These are visual tests for OSSMC plugin that are meant to be run against a live OCP instance or OpenShift Local (CRC).

## Prerequisites

Installed all dev dependencies from plugin folder. Ensure the `baseUrl` field in the `cypress.config.ts` file is pointing to the console you are trying to test, alternatively you can set `CYPRESS_BASE_URL` environment variable or pass via cmd line `yarn cypress --config baseUrl=http://localhost:9000` to overwrite default `baseUrl`.

Cypress runtime utilizes `download-hack-scripts.sh`, which checks out the hack scripts of `kiali/kiali`. If the OSSMC branch is a release branch (v1.XX), the Kiali branch will be the same. Otherwise, the hack scripts will be downloaded from branch `v1.73` of `kiali/kiali`.

Before you start using Cypress suite, you might need export some environment variables:

```bash
export CYPRESS_BASE_URL=<value>               # defaults to http://localhost:9000
export CYPRESS_USERNAME=<value>               # defaults to jenkins, opt. kubeadmin
export CYPRESS_PASSWD=<value>                 # no defaults
export CYPRESS_AUTH_PROVIDER=<value>          # defaults to my_htpasswd_provider
```

Tests for OSSMC can be run with the cypress browser:

```bash
yarn cypress
```

or in headless mode:

```bash
yarn cypress:run
```

Running specific test groups:

```bash
export TEST_GROUP="@smoke"
yarn cypress:run:test-group:junit
```

you can use complex expresions, like
```bash
export TEST_GROUP="not @crd-validation and not @multi-cluster and not @smoke"
yarn cypress:run:test-group:junit
```
