# OpenShift Service Mesh Console (OSSM Console)

:information_source: There is a [Users Guide](https://kiali.io/docs/ossmc/users-guide/)

The OpenShift Service Mesh Console is a Webpack Plugin that integrates Kiali into the OpenShift Console. The official title of the project is "OpenShift Service Mesh Console" but you may see this abbreviated in documentation and code as "OSSMC", "ossmconsole", or "OSSM Console".

The main component is a plugin based on OpenShift Console [Dynamic plugin-ins](https://docs.openshift.com/container-platform/4.13/web_console/dynamic-plugin/overview-dynamic-plugin.html) framework. Installing and enabling the plugin will add OpenShift Service Mesh support into the OpenShift Console. The new "Service Mesh" menu item and tabs allow you to interact with your mesh via the Kiali user interface. Note that OSSMC may also work with upstream Istio installed (as opposed to OpenShift Service Mesh).

The main installation mechanism is the Kiali Operator.

## Platform Setup

These are the things you need before developers can start working with the OpenShift Service Mesh Console:

1. OpenShift cluster with OpenShift ServiceMesh or Istio installed.
2. Kiali Server deployed in the cluster
3. `oc` client available in the path
4. `podman` or `docker` client available in the path
5. [NodeJS](https://nodejs.org) (>= 24) with [corepack](https://nodejs.org/api/corepack.html) enabled (`corepack enable`). The exact Yarn version is pinned in `plugin/package.json` via the `packageManager` field.

## Quickly Deploy the Latest OSSM Console Image

To very quickly get the latest OSSMC plugin deployed in your cluster (e.g. without needing to build/push the operator and its catalog source and index image), run the following.

1. Log into your OpenShift cluster with `oc login`
2. Run `make deploy-plugin enable-plugin` to deploy the `latest` plugin published on quay.io and then enable the plugin

You can undeploy/disable the plugin using `make undeploy-plugin`.

## How to Run the Plugin for Local Development

> :warning: For this local dev environment to work, you _must_ deploy the Kiali Server with `auth.strategy` set to `anonymous`.

### How the plugin proxy works

The OpenShift Console has a built-in plugin proxy (`BRIDGE_PLUGIN_PROXY`) that forwards API requests from the browser to the Kiali backend server-side. This means the browser only communicates with the console (same origin), avoiding CORS issues entirely. The `KIALI_URL` environment variable configures where the proxy sends requests. If omitted, it defaults to `http://localhost:20001`.

### Preparing your local dev environment using `make`

The `make prepare-dev-env` target installs dependencies, copies the plugin config, and prints the commands to start the plugin and console with the correct `KIALI_URL`.

Set `KIALI_URL` to either a URL or the literal value `route` to auto-discover it from the Kiali OpenShift Route (requires the operator or helm chart deployment):

```sh
make prepare-dev-env -e KIALI_URL=route
```

Or specify the URL directly:

```sh
make prepare-dev-env -e KIALI_URL=https://<your-kiali-server-host>
```

### Preparing your local dev environment manually

Alternatively, you can perform the same steps manually (this is what `make prepare-dev-env` does under the hood):

> **Note:** Yarn is managed via [corepack](https://nodejs.org/api/corepack.html). Run `corepack enable` once before using `yarn`. The exact Yarn version is pinned in `plugin/package.json` via the `packageManager` field.

```sh
cd plugin
yarn install

# Copy the plugin-config.json file into the "dist" folder to emulate the ConfigMap in a local environment
cp plugin-config.json dist

# If necessary, change the settings in the config file
# vi dist/plugin-config.json
```

### Run The Plugin and OpenShift Console Locally

Once your dev environment is prepared, run the plugin and the OpenShift Console in separate command line windows:

In one command line window, start the plugin:

```sh
cd plugin
yarn run start
```

The plugin will be accessible at http://localhost:9001

In a second command line window, start the OpenShift Console:

```sh
cd plugin
KIALI_URL=https://<your-kiali-server-host> yarn run start-console
```

The `KIALI_URL` environment variable tells `start-console.sh` where to proxy API requests. If omitted, it defaults to `http://localhost:20001`. The OpenShift Console will be accessible at http://localhost:9000

### Running with Mock Server (No Kiali Backend Required)

For frontend development without a real Kiali backend, you can use the mock server. This allows you to develop and test the UI without deploying Kiali Server in your cluster.

> :warning: You still need access to an OpenShift cluster (local or remote) to run the OpenShift Console, which loads the OSSMC plugin. The mock server only replaces the Kiali backend API — you must be logged in via `oc login` to your cluster.

This is useful for:
- UI development and testing without Kiali Server deployed
- Testing specific mock scenarios
- Faster development iteration

**Setup:**

Run in three separate terminals:

```sh
# Terminal 1: Start the mock server
cd plugin
yarn mock-server

# Terminal 2: Start the plugin
cd plugin
yarn start

# Terminal 3: Start the OpenShift Console (point KIALI_URL to the mock server)
cd plugin
KIALI_URL=http://localhost:3001 yarn start-console
```

Open http://localhost:9000

The mock server provides simulated API responses using handlers defined in `src/kiali/mocks/handlers/`.

**Configuration:**

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MOCK_SERVER_PORT` | `3001` | Port for the mock server |
| `REACT_APP_MOCK_SCENARIO` | `healthy` | Mock scenario to use |

Example with custom port and scenario:
```sh
MOCK_SERVER_PORT=4000 REACT_APP_MOCK_SCENARIO=unhealthy yarn mock-server
```

Remember to update `KIALI_URL` when starting the console if you change the mock server port.

Available scenarios are defined in `src/kiali/mocks/scenarios.ts`.

### Testing Locally Distributed Tracing integration

For testing the distributed tracing integration locally, assign to distributedTracingPluginConfig in the getDistributedTracingPluginManifestPromise in the KialiController the following data:

```json
  distributedTracingPluginConfig = {
    "name": "distributed-tracing-console-plugin",
    "version": "0.0.1",
    "displayName": "Distributed Tracing Plugin",
    "description": "This plugin adds a distributed tracing UI to the Openshift console.",
    "dependencies": {
      "@console/pluginAPI": "*"
    },
    "extensions": [
      {
        "type": "console.page/route",
        "properties": {
          "exact": false,
          "path": "/observe/traces",
          "component": {
            "$codeRef": "TracingUI"
          }
        }
      },
      {
        "type": "console.navigation/href",
        "properties": {
          "id": "distributed-tracing",
          "name": "Traces",
          "href": "/observe/traces",
          "perspective": "admin",
          "section": "observe"
        }
      }
    ]
  }
```

That will help to validate if the logic and the URL are right, but in the localhost plugin it won't load the distributed tracing plugin page.

### Testing Locally Netobserv integration

For testing the Netobserv integration locally, assign to netobservPluginConfig in the getNetobservPluginManifestPromise in the KialiController.go, the following data:

```json
  netobservPluginConfig = {
    "name": "network-observability-console-plugin",
    "version": "0.0.1",
    "displayName": "Network Observability Plugin",
    "description": "This plugin adds a network observability UI to the OpenShift console.",
    "dependencies": {
      "@console/pluginAPI": "*"
    },
    "extensions": [
      {
        "type": "console.page/route",
        "properties": {
           "exact": false,
           "path": "/observe/network-traffic",
            "component": {
              "$codeRef": "NetworkTrafficUI"
            }
          }
      },
      {
        "type": "console.navigation/href",
        "properties": {
          "id": "network-observability",
          "name": "Network Traffic",
          "href": "/observe/network-traffic",
          "perspective": "admin",
           "section": "observe"
        }
      }
    ]
  };
```

That will help to validate if the logic and the URL are right, but in the localhost plugin it won't load the Network Observability plugin page.

## Operator

The OpenShift Service Mesh Console will be installed by end users using the Kiali Operator.

### How To Deploy A Dev Build of OSSM Console Using The Operator

Sometimes you want to test a locally built image of the OSSM Console plugin when installed via the Kiali Operator. Follow these steps to do this.

1. Make sure your Kiali dev environment is fully set up. This means you must have the [kiali/kiali repo](https://github.com/kiali/kiali), the [kiali/kiali-operator repo](https://github.com/kiali/kiali-operator), and the [kiali/helm-charts repo](https://github.com/kiali/helm-charts) cloned on your local machine. See the [kiali/kiali README](https://github.com/kiali/kiali/blob/master/README.adoc#developer-setup) for more details.
2. Log into your OpenShift cluster with `oc login`
3. Log into your OpenShift image registry. You can find the command to do this in the output of `make cluster-status`
4. Create a dev build of the OSSMC plugin and push that image into your cluster via `make clean-plugin cluster-push`
5. Change your current working directory to your local kiali/kiali repo.
6. If you do not already have the Kiali Operator and a Kiali Server installed, do so now via `make build build-ui cluster-push operator-create kiali-create`
7. Install your dev build of the OSSMC plugin via `make ossmconsole-create`

Give the Kiali Operator time to process the OSSMConsole CR and time for the OpenShift Console UI to load the plugin (it could take a minute or two). Eventually, the plugin will be fully deployed and ready to use.

## Releasing OpenShift Service Mesh Console

To build and release the plugin, you can run this command either manually or inside a CI workflow.

```sh
make -e CONTAINER_VERSION=v0.1.0 build-plugin-image push-plugin-image
```

Or for a multi-arch container:

```sh
make -e CONTAINER_VERSION=v0.1.0 build-push-plugin-multi-arch
```

If you want to release a "latest" image, set `CONTAINER_VERSION` to "latest".

Once complete, the image will be pushed to quay.io in this repository: https://quay.io/repository/kiali/ossmconsole?tab=tags

## AI-Assisted Development Tooling

The [kiali/ai-tools](https://github.com/kiali/ai-tools) repository contains shared Cursor rules and AI configuration used across Kiali repositories. To use them, clone the repo alongside the other Kiali repositories and create a symlink:

```sh
cd $OSSMC_SOURCES
git clone https://github.com/kiali/ai-tools.git
ln -s $OSSMC_SOURCES/ai-tools/cursor/.cursor/rules openshift-servicemesh-plugin/.cursor/rules
```

This makes the shared Cursor rules (`.mdc` files) available in the OSSMC workspace. The symlink is gitignored — each developer sets it up locally.

### Code Reviewer Plugin

The project includes configuration for an AI-powered code review pipeline under `.cursor/code-reviewer/` and `.claude/code-reviewer/`. The pipeline runs three parallel review phases — adversarial (bugs, security, architecture), style (convention enforcement against the project's style guide), and testing (coverage gaps, test quality) — then consolidates findings into a single report with structured IDs and a verdict.

For Cursor users, the review pipeline is activated by typing `/code-reviewer:review` once the `ai-tools` symlink above is in place.

For Claude Code users, the code-reviewer plugin must be installed separately from [openshift-service-mesh/ci-utils](https://github.com/openshift-service-mesh/ci-utils/tree/main/plugins/code-reviewer). Once installed, run `/code-reviewer:review` to review your branch changes.
