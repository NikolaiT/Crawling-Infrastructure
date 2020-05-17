#!/usr/bin/env bash

rm -rf dist/ && tsc;

if [ -z "$CRAWLER_TAG" ]
then
      CRAWLER_TAG="tschachn/crawl_worker:latest"
fi

docker build --tag $CRAWLER_TAG --file worker_images/with_node_slim/Dockerfile .

docker image ls

if test "$1" == "push"
then
    docker login --username $DOCKER_USER --password "$DOCKER_PASS";
    docker push $CRAWLER_TAG
fi
