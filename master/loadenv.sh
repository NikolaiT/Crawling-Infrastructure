#!/usr/bin/env bash

# load env file
export $(grep -v '^#' env/production.env | xargs -0);