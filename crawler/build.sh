#!/usr/bin/env bash

source ./.env

rm -rf dist/ && tsc;

docker build --tag tschachn/crawler:latest --file worker_images/with_node_slim/Dockerfile .

docker image ls

if test "$1" == "push"
then
    docker login --username $DOCKER_USER --password "$DOCKER_PASS";
    docker push tschachn/crawler:latest
fi