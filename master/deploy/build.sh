#!/usr/bin/env bash


docker build --tag scheduler:latest --file scheduler/Dockerfile .

docker build --tag api:latest --file Dockerfile .

docker build --tag database:latest --file mongo/Dockerfile mongo/