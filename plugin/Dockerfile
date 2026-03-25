FROM  registry.access.redhat.com/ubi8/nodejs-24 AS build

USER 0

# Install and enable corepack to use yarn
RUN npm install -g corepack && corepack enable

ADD . /usr/src/app
WORKDIR /usr/src/app

# Install dependencies and build the plugin
RUN yarn install && yarn build

FROM registry.access.redhat.com/ubi8/nginx-120:1-38.1655143357

ARG VERSION_PLUGIN
ARG COMMIT_HASH

USER 0

# Add application sources to a directory that the assemble script expects them
COPY --from=build /usr/src/app/dist /usr/share/nginx/html/
ADD ./locales /usr/share/nginx/html/locales

# Add a label to the container to identify the version and commit hash
RUN printf "\necho 'OpenShift Service Mesh Console: Version=[${VERSION_PLUGIN}], Commit=[${COMMIT_HASH}]' >> /proc/1/fd/1" >> ${NGINX_CONTAINER_SCRIPTS_PATH}/common.sh

LABEL com.redhat.component="openshift-service-mesh-console" \
      name="openshift-service-mesh-console" \
      summary="OpenShift Service Mesh Console" \
      description="The OpenShift Service Mesh Console adds Kiali observability, configuration and validation into the OpenShift Console." \
      version=$VERSION_PLUGIN \
      commit=$COMMIT_HASH

# Ensure the container runs as a non-root user
USER 1001

# Run script uses standard ways to run the application
CMD /usr/libexec/s2i/run
