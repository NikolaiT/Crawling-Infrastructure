#!/usr/bin/env bash

export $(grep -v '^#' ../env/development.env | xargs -0);

URL="http://0.0.0.0:8080?master_api_key=$API_KEY&master_api_url=https%3A%2F%2F0.0.0.0%3A9001"

echo $URL

chromium-browser $URL