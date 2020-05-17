#!/usr/bin/env bash

SCRIPT=`realpath $0`
SCRIPTPATH=`dirname $SCRIPT`

export $(grep -v '^#' $SCRIPTPATH/env/deploy.env | xargs -0);

EXCLUDE_FILE=$SCRIPTPATH/exclude.txt
LOCAL_SRC=`dirname $SCRIPTPATH`/
SHARED_SRC=`dirname $LOCAL_SRC`/lib/
CHECK_FILE="$LOCAL_SRC"dist/master/src/server.js

if [ ! -f "$EXCLUDE_FILE" ]; then
    echo "EXCLUDE_FILE does not exist";
    exit 1
fi

if [ ! -d "$LOCAL_SRC" ]; then
    echo "LOCAL_SRC does not exist";
    exit 1
fi

if [ ! -d "$SHARED_SRC" ]; then
    echo "SHARED_SRC does not exist";
    exit 1
fi

if [ ! -f "$CHECK_FILE" ]; then
    echo "CHECK_FILE does not exist: $CHECK_FILE";
    exit 1
fi

echo "LOCAL_SRC = $LOCAL_SRC"
echo "SHARED_SRC = $SHARED_SRC"
echo "REMOTE_MASTER_DIR = $REMOTE_MASTER_DIR"
echo "REMOTE_LIBRARY_DIR = $REMOTE_LIBRARY_DIR"

function sync {
    rsync --exclude-from $EXCLUDE_FILE -Pav -e "ssh -i $PEMFILE" $LOCAL_SRC $SERVER:$REMOTE_MASTER_DIR;
    rsync --exclude-from $EXCLUDE_FILE -Pav -e "ssh -i $PEMFILE" $SHARED_SRC $SERVER:$REMOTE_LIBRARY_DIR;
}

function build {
    cd $LOCAL_SRC;
    # add recent cloudcrawler functions to ./crawl-data
    curl -sL https://github.com/NikolaiT/scrapeulous/archive/master.zip > master.zip && unzip -q -o master.zip -d ./crawl-data/ && rm master.zip

    # install & build both projects
    cd $SHARED_SRC;
    rm -rf dist/ && tsc;

    echo "[i] built lib";

    cd $LOCAL_SRC;
    rm -rf dist/ && tsc;

    if test -f "$CHECK_FILE"; then
        echo "[i] master src compilation successful";
    else
        echo "[-] tsc probably failed. Aborting.";
        exit 1;
    fi
}

function sync_build {
    build

    # sync files
    rsync --exclude-from $EXCLUDE_FILE -Pav -e "ssh -i $PEMFILE" $LOCAL_SRC $SERVER:$REMOTE_MASTER_DIR;
    rsync --exclude-from $EXCLUDE_FILE -Pav -e "ssh -i $PEMFILE" $SHARED_SRC $SERVER:$REMOTE_LIBRARY_DIR;

    echo "[i] synced files";

    # install packages on server
    ssh -i $PEMFILE $SERVER << EOF
        cd $REMOTE_MASTER_DIR;
        yarn install;
        cd $REMOTE_LIBRARY_DIR;
        yarn install;
EOF

    echo "[i] installed modules on server";
}

# start the master server in development mode locally
# use the remote mongodb, otherwise crawlers cannot communicate
# results back
if [[ $1 = "dev" ]]; then

  build

  # install packages locally
  cd $LOCAL_SRC;
  yarn install;

  cd $SHARED_SRC;
  yarn install;

  echo "[i] Installed packages locally";

  cd $LOCAL_SRC;
  ./deploy/dev.sh;
fi

# compile and upload
if [[ $1 = "up" ]]; then
  sync_build
fi

if [[ $1 = "deploy" ]]; then

sync_build

ssh -i $PEMFILE $SERVER << EOF
    cd $REMOTE_MASTER_DIR;
    ./deploy/prod.sh;
EOF
fi

# compile and upload a new version of the api
if [[ $1 = "api" ]]; then

sync_build

ssh -i $PEMFILE $SERVER << EOF
    cd $REMOTE_MASTER_DIR;
    export $(grep -v '^#' env/production.env | xargs -0);
    docker build --tag api:latest --file Dockerfile .
    docker service scale Master_api=0;
    docker service scale Master_api=1;
    docker service logs Master_api -f;
EOF
fi


# compile and upload a new version of the api
if [[ $1 = "db-down" ]]; then

ssh -i $PEMFILE $SERVER << EOF
    cd $REMOTE_MASTER_DIR;
    export $(grep -v '^#' env/production.env | xargs -0);
    docker service scale Master_database=0;
    docker service logs Master_database -f;
EOF
fi

# compile and upload a new version of the database
if [[ $1 = "db" ]]; then

ssh -i $PEMFILE $SERVER << EOF
    cd $REMOTE_MASTER_DIR;
    export $(grep -v '^#' env/production.env | xargs -0);
    docker service scale Master_database=0;
    docker service scale Master_database=1;
    docker service logs Master_database
EOF

fi

# DEV ENVIRONMENT: compile and upload a new version of the scheduler
if [[ $1 = "dev-api" ]]; then
  build

  # install packages locally
  cd $LOCAL_SRC;
  yarn install;

  cd $SHARED_SRC;
  yarn install;

  echo "[i] Installed packages locally";

  cd $LOCAL_SRC;

  export $(grep -v '^#' env/production.env | xargs -0);
  docker build --tag api:latest --file Dockerfile .
  docker service scale Master_api=0;
  docker service scale Master_api=1;
  docker service logs Master_api -f;
fi

# compile and upload a new version of the frontend
if [[ $1 = "frontend" ]]; then

sync

ssh -i $PEMFILE $SERVER << EOF
    cd $REMOTE_MASTER_DIR;
    export $(grep -v '^#' env/production.env | xargs -0);
    docker build --tag frontend:latest --file frontend/Dockerfile frontend/
    docker service scale Master_frontend=0;
    docker service scale Master_frontend=1;
    docker service logs Master_frontend -f;
EOF
fi

# DEV ENVIRONMENT: compile and upload a new version of the frontend
if [[ $1 = "dev-frontend" ]]; then

  cd "$LOCAL_SRC"/frontend/
  yarn build

  cd "$LOCAL_SRC"

  docker build --tag frontend:latest --file frontend/Dockerfile frontend/
  docker service scale Master_frontend=0;
  docker service scale Master_frontend=1;
  docker service logs Master_frontend -f;
fi

# compile and upload a new version of the scheduler
if [[ $1 = "scheduler" ]]; then

sync_build

ssh -i $PEMFILE $SERVER << EOF
    cd $REMOTE_MASTER_DIR;
    export $(grep -v '^#' env/production.env | xargs -0);
    docker build --tag scheduler:latest --file scheduler/Dockerfile .
    docker service scale Master_scheduler=0;
    docker service scale Master_scheduler=1;
    docker service logs Master_scheduler -f;
EOF
fi


# DEV ENVIRONMENT: compile and upload a new version of the scheduler
if [[ $1 = "dev-scheduler" ]]; then
  build

  # install node packages locally
  cd $LOCAL_SRC;
  yarn install;

  cd $SHARED_SRC;
  yarn install;

  echo "[i] Installed node packages locally";

  cd $LOCAL_SRC;

  export $(grep -v '^#' env/production.env | xargs -0);
  docker build --tag scheduler:latest --file scheduler/Dockerfile .
  docker service scale Master_scheduler=0;
  docker service scale Master_scheduler=1;
  docker service logs Master_scheduler -f;
fi


# turn down the docker swarm
if [[ $1 = "down" ]]; then
    ssh -i $PEMFILE $SERVER "cd $REMOTE_MASTER_DIR && docker swarm leave --force";
fi
