# NOTE: This makefile is opinionated and it uses "oc" (instead of kubectl) and "podman" (instead of docker)

clean-plugin:
	@rm -rf ${ROOTDIR}/plugin/node_modules
	@rm -rf ${ROOTDIR}/plugin/dist

build-plugin: clean-plugin
	cd plugin && yarn install && yarn build

build-plugin-image:
	cd plugin && podman build -t quay.io/kiali/servicemesh-plugin:latest .

build-plugin-push:
	cd plugin && podman push quay.io/kiali/servicemesh-plugin:latest

deploy-plugin:
	cd plugin && oc apply -f manifest.yaml

enable-plugin:
	oc patch consoles.operator.openshift.io cluster --patch '{ "spec": { "plugins": ["servicemesh"] } }' --type=merge

restart-plugin:
	oc rollout restart deployments/servicemesh-plugin -n servicemesh-plugin
