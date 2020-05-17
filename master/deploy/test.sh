#!/usr/bin/env bash

export $(grep -v '^#' env/production.env | xargs -0);

curl -k "$API_URL"system?API_KEY=$API_KEY
