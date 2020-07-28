#!/bin/sh

# sudo apt install mongo-tools
# https://stackoverflow.com/questions/8991292/dump-mongo-collection-into-json-format

# load env file
export $(grep -v '^#' env/production.env | xargs -0);

# mongo -u $MONGO_INITDB_ROOT_USERNAME -p $MONGO_INITDB_ROOT_PASSWORD --quiet --eval  "printjson(db.adminCommand('listDatabases'))" $MASTER_IP/

mongoexport --authenticationDatabase admin --host $MASTER_IP --db CrawlMasterQueue --forceTableScan --jsonArray --fields="id,item" \
    --username $MONGO_INITDB_ROOT_USERNAME --password $MONGO_INITDB_ROOT_PASSWORD --collection item_queue_5ebc5e82eaff86000ccd3900  --out=queue.json
