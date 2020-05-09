#!/usr/bin/env bash

# this is a dangerous script, since it deletes aws buckets

pattern="crawling"

for bucket in $(aws s3 ls | awk '{print $3}' | grep $pattern); do
    aws s3 rb "s3://${bucket}" --force ;
done
