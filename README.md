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

## Quickly Deploy the Latest OSSM Console Image

To very quickly get the latest OSSMC plugin deployed in your cluster (e.g. without needing to build/push the operator and its catalog source and index image), run the following.

1. Log into your OpenShift cluster with `oc login`
2. Run `make deploy-plugin enable-plugin` to deploy the `latest` plugin published on quay.io and then enable the plugin

You can undeploy/disable the plugin using `make undeploy-plugin`.

## How to Run the Plugin for Local Development

> :warning: To avoid CORS errors when running in a local dev environment, you must disable CORS security in your browser. If using Chrome, start it using `--disable-web-security --user-data-dir="<some directory here>"` or install a CORS plugin such as [CORS Unblock](https://chrome.google.com/webstore/detail/cors-unblock/lfhmikememgdcahcdlaciloancbhjino) and use it to disable CORS security.

> :warning: For this local dev environment to work, you _must_ deploy the Kiali Server with `auth.strategy` set to `anonymous`.

### Preparing your local dev environment using `make`

There is a single make target to help you set up your dev environment. When you run this make target, you must provide the `KIALI_URL` environment variable - it must be set to either (a) the Kiali Server public endpoint URL or (b) the literal value `route`. If you set it to `route`, the make target will attempt to auto-discover the Kiali Server URL by examining the Kiali Route. This auto-discovery will only work if you deployed Kiali in the cluster via the operator or helm chart. If you are running the Kiali Server outside of the cluster on your local machine, you have to specify the URL yourself directly in the value of `KIALI_URL`.

To set up your dev environment using make, run this command:

```sh
make prepare-dev-env -e KIALI_URL=route
```

or, if auto-discovery will not work, specify the URL directly like this:

```sh
make prepare-dev-env -e KIALI_URL=https://<your-kiali-server-host>
```

### Preparing your local dev environment manually

Alternatively, you can manually set up your dev environment outside of make by performing these steps:

```sh
cd plugin
yarn install

# If necessary, make sure you change the "API_PROXY" value in .env.development so it points to your Kiali Server URL
# vi .env.development

# Copy the plugin-config.json file into the "dist" folder to emulate the ConfigMap in a local environment
cp plugin-config.json dist

# If necessary, change the settings in the config file
# vi dist/plugin-config.json
```

### Run The Plugin and OpenShift Console Locally

Once your dev environment is prepared, run the plugin and the OpenShift Console in separate command line windows:

In one command line window, execute:

```sh
cd plugin
yarn run start
```

At this point, the plugin will start and be accessible at http://localhost:9001

In a second command line window, execute:

```sh
cd plugin
yarn run start-console
```

At this point, the OpenShift Console will start and be accessible at http://localhost:9000

### Testing Locally Distributed Tracing integration

For testing the distributed tracing integration locally, assign to distributedTracingPluginConfig in the getDistributedTracingPluginManifestPromise in the KialiController the following data: 

```sh
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

```sh
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

```

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
