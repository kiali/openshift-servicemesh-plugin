#
# Targets for working with the UI from source
#

## yarn-start: Run the plugin in a local process that is separate from the openshift console.
yarn-start:
	@cd ${ROOTDIR}/plugin && yarn start

## yarn-start-console: Run the Openshift Console UI locally.
yarn-start-console:
	@cd ${ROOTDIR}/plugin && yarn start-console

## link-core-ui: Links the core library and plugin for local development.
link-core-ui:
	@cd ${ROOTDIR}/plugin && ./link-core-ui.sh

## unlink-core-ui: Unlinks the local core library with the plugin. From now on, the library is taken from NPM registry 
unlink-core-ui:
	@cd ${ROOTDIR}/plugin && ./link-core-ui.sh --enable-link=false

## build-watch-core-ui: Builds the library automatically on any source code change and propagate it to the plugin.
build-watch-core-ui:
	@cd ${ROOTDIR}/core-ui && yarn build:watch
