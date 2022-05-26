#
# Targets for building the plugin itself.
#

## clean-plugin: Delete generated code.
clean-plugin:
	@rm -rf ${PLUGIN_DIR}/node_modules
	@rm -rf ${PLUGIN_DIR}/dist

## build-plugin: Builds the plugin.
build-plugin: clean-plugin
	cd ${PLUGIN_DIR} && yarn install && yarn build

## build-plugin-image: Builds the plugin container image.
build-plugin-image:
	cd ${PLUGIN_DIR} && ${DORP} build -t quay.io/kiali/servicemesh-plugin:latest .

## build-plugin-push: Pushes the plugin container image to quay.io.
build-plugin-push:
	cd ${PLUGIN_DIR} && ${DORP} push quay.io/kiali/servicemesh-plugin:latest

## deploy-plugin: Deploys the plugin quickly. This does not utilize the operator.
deploy-plugin: .ensure-oc-login
	cd ${PLUGIN_DIR} && ${OC} apply -f manifest.yaml

## undeploy-plugin: Removes the plugin quickly. This does not utilize the operator.
undeploy-plugin: .ensure-oc-login
	cd ${PLUGIN_DIR} && ${OC} delete -f manifest.yaml

## enable-plugin: Enables the plugin within the OpenShift Console.
enable-plugin: .ensure-oc-login
	${OC} patch consoles.operator.openshift.io cluster --patch '{ "spec": { "plugins": ["servicemesh"] } }' --type=merge

## restart-plugin: Restarts the plugin.
restart-plugin: .ensure-oc-login
	${OC} rollout restart deployments/servicemesh-plugin -n servicemesh-plugin
