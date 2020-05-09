#!/usr/bin/env bash

# define the regions where you want to have an
# s3 bucket created here. The bucket name will have the
# from crawling-us-west-1 for region `us-west-1`

regions=(us-west-1 us-west-2 us-east-2 us-east-1)

for region in "${regions[@]}"
do
    # specify your bucket name here
    bname="crawling-$region"

    echo "creating $bname aws bucket"

    # https://docs.aws.amazon.com/cli/latest/reference/s3api/create-bucket.html#examples
    if [[ "$region" == "us-east-1" ]]; then
        aws s3api create-bucket --bucket $bname --region $region --acl private
    else
        aws s3api create-bucket --bucket $bname --region $region --acl private --create-bucket-configuration LocationConstraint=$region
    fi
done