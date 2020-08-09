#!/usr/bin/env bash

source ../master/env/production.env
docker login --username $DOCKER_USER --password "$DOCKER_PASS";
docker push tschachn/crawl_worker:latest
