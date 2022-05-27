# OpenShift Service Mesh Plugin
Webpack Plugin to integrate Kiali into OpenShift Console

## Platform Setup

1. OpenShift +4.10 cluster with OpenShift ServiceMesh / Istio installed. 
2. Kiali deployed in the cluster
3. "oc" client available in the path
4. "podman" client available in the path

## Deploy the Service Mesh Plugin

```sh
# Login in OpenShift cluster i.e oc login ...

# Adjust the kialiUrl in the "plugin-conf" ConfigMap under plugin/manifest.yaml pointing to the Kiali public URL
# i.e. https://kiali-istio-system.apps-crc.testing 

make deploy-plugin
make enable-plugin 
```

## Local Development

In one window:

```sh
cd plugin

yarn install

# Copy a plugin-config.json file into the "dist" folder to emulate the ConfigMap in a local environment
# Adjust the kialiUrl in the config pointing to the Kiali public URL
cp plugin-config.json dist

yarn run start

# Plugin will start at http://localhost:9001
```

In another window:

```sh
cd plugin

yarn run start-console

# OpenShift Console will start at http://localhost:9000
```
