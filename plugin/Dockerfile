FROM node:16 AS build

ADD . /usr/src/app
WORKDIR /usr/src/app
RUN yarn install && yarn build

FROM nginx:stable

RUN chmod g+rwx /var/cache/nginx /var/run /var/log/nginx
COPY --from=build /usr/src/app/dist /usr/share/nginx/html

# Have the plugin log its version immediately upon startup
ARG VERSION
ARG COMMIT_HASH
RUN echo "echo 'OpenShift Service Mesh Plugin: Version=[${VERSION}], Commit=[${COMMIT_HASH}]'" > /docker-entrypoint.d/01-log-version.sh
RUN chmod ug+x /docker-entrypoint.d/01-log-version.sh