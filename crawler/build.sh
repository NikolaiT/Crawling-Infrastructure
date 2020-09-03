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

echo "Test the crawler with: "

echo "mocha --timeout 300000 -r ts-node/register test/integration_tests.ts"
echo "mocha --timeout 300000 -r ts-node/register test/worker_test.ts"
echo "mocha --timeout 300000 -r ts-node/register test/more_proxy_tests.ts"
echo "mocha --timeout 300000 -r ts-node/register test/clean_state_tests.ts -g 'webrtc is not detected'"
