## Deployment Master Server

### Administration 

Cleanup unused images:

```
docker image prune
```

### Master API

Building the docker image

```
docker build --tag crawl_master_api  .
```

Confirm it was correctly built:

```
docker image ls
```

Log into the container:

```
docker ps

docker exec -it crawl_master_api:latest /bin/bash
```

Run the docker image and map the internal port 3000 to the external port 3000:

```
docker run -p 9001:9001 crawl_master_api:latest
```

### Master Scheduler

Building the docker image

```
docker build --tag crawl_master_scheduler --file scheduler/Dockerfile .
```

Confirm it was correctly built and login

```
docker image ls
docker exec -it crawl_master_scheduler:latest /bin/bash
```

Run the docker image:

```
docker run crawl_master_scheduler
```


### Docker Compose 

First, build the container images and create the services by running docker-compose up with the -d flag, which will then run the nodejs and db containers in the background:

``` 
docker-compose up -d

docker-compose up -d --remove-orphans
```

Confirm with:

```
docker-compose logs
```

and

```
docker-compose ps
```

connect to docker image mongodb

```
mongo -p 'sk34BCaklKS3kikad' mongodb://127.0.0.1:27017/

mongo -u crawl_master_user -p 'a439nba5KSJUS23oi0' mongodb://127.0.0.1:27017/CrawlMaster

mongo mongodb://admin:sk34BCaklKS3kikad@127.0.0.1/
```

`
docker exec -it db mongo -u crawl_master_user -p 'sk434BCBWWo32WKS311d' 0.0.0.0:27017
`

Check logfiles from mongodb docker image:

```
docker exec -it crawl_master_mongodb_1 tail -n100 -f /var/log/mongodb/mongodb.log
```

#### Log docker compose services

Log what the scheduler is doing:

```
docker-compose exec scheduler tail -f -n100 /var/log/scheduler/combined.log
```

Log what the mongodb is doing:

```
docker-compose exec database tail -f -n100 /var/log/mongodb/mongodb.log
```


### Docker Compose Production

Relevant:

1. https://docs.docker.com/compose/production/
2. https://docs.docker.com/compose/extends/#different-environments

We rent a ubuntu 18.04 server and we install docker on it:

https://www.digitalocean.com/community/tutorials/how-to-install-and-use-docker-on-ubuntu-18-04

```bash
sudo apt update
sudo apt -y install apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu bionic stable"
sudo apt update
apt-cache policy docker-ce
sudo apt -y install docker-ce
sudo systemctl status docker

sudo curl -L "https://github.com/docker/compose/releases/download/1.25.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

It's important to make docker executable by a non root user:

```bash
sudo usermod -aG docker ${USER}
```


## Ubuntu 18.04 Master Setup

## Install Nodejs

```
sudo apt update
sudo apt -y upgrade
```

```
sudo apt -y install curl dirmngr apt-transport-https lsb-release ca-certificates
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
```

```
sudo apt -y install nodejs
```

## Install mongodb

https://docs.mongodb.com/manual/tutorial/install-mongodb-on-ubuntu/

```
wget -qO - https://www.mongodb.org/static/pgp/server-4.2.asc | sudo apt-key add -

echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.2 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.2.list

sudo apt-get update

sudo apt-get install -y mongodb-org
```

when a bad version of mongodb was installed, do this:

```
sudo apt-get purge mongodb mongodb-server mongodb-server-core mongodb-clients
sudo apt-get purge mongodb-org
sudo apt-get autoremove
sudo apt-get purge mongodb-server
```

### Allow connections from the internet

```
vim /etc/mongod.conf 

edit bind ip address and change to 0.0.0.0 
```

start the server 

```
sudo service mongod restart
sudo service mongod status
```

## Setup mongodb

Create admin user:

```

sudo service mongod start
mongo

use admin

db.createUser({ user: "admin", pwd: "sk34BCaklKS3kikad", roles: [{ role: "userAdminAnyDatabase", db: "admin" }] })

db.grantRolesToUser('admin', [{ role: 'root', db: 'admin' }])

db.auth("admin", "sk34BCaklKS3kikad")
```

Create user with proper rights:

`mongo -u admin -p 'sk34BCaklKS3kikad'`

```
use admin;

db.createUser({user:'crawl_master_user', pwd:'a439nba5KSJUS23oi0', roles:[
    {role:'readWrite', db:'CrawlMasterQueue'},
    {role:'readWrite', db:'CrawlMaster'},
    {role:'readWrite', db:'WorkerMeta'},
]});
```

Get mongodb performance information

```
sudo mongostat -u "admin" -p 'sk34BCaklKS3kikad' --authenticationDatabase "admin"
```

## Deploy Master and start API Server

```
./deploy install
./deploy server
```

## Start Scheduler

```
./deploy scheduler
```