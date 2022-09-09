FROM  registry.access.redhat.com/ubi8/nodejs-16 AS build

USER root
RUN command -v yarn || npm i -g yarn

ADD . /usr/src/app
WORKDIR /usr/src/app
RUN yarn install --network-timeout 7200000 && yarn build

FROM registry.access.redhat.com/ubi8/nginx-120:1-38.1655143357

# Add application sources to a directory that the assemble script expects them
# and set permissions so that the container runs without root access
USER 0

COPY --from=build /usr/src/app/dist /usr/share/nginx/html/
# add locales
ADD ./locales /usr/share/nginx/html/locales
RUN chown -R 1001:0 /usr/share/nginx/html/

ARG VERSION_PLUGIN
ARG COMMIT_HASH
RUN printf "\necho 'OpenShift Service Mesh Console: Version=[${VERSION_PLUGIN}], Commit=[${COMMIT_HASH}]' >> /proc/1/fd/1" >> ${NGINX_CONTAINER_SCRIPTS_PATH}/common.sh

USER 1001
LABEL com.redhat.component="openshift-service-mesh-console" \
      name="openshift-service-mesh-console" \
      summary="OpenShift Service Mesh Console" \
      description="The OpenShift Service Mesh Console adds Kiali observability, configuration and validation into the OpenShift Console." \
      version=$VERSION_PLUGIN \
      commit=$COMMIT_HASH

# Run script uses standard ways to run the application
CMD /usr/libexec/s2i/run
