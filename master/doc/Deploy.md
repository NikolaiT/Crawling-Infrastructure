## Deployment Master

### Preconditions

This guide assumes that you run Ubuntu 18.04.3 or newer.

Your server should at least have 2GB of Ram and 2vCPU's. 4GB of Ram is recommended.

The guide assumes the following variables:

```bash
SERVER_IP = 100.100.100.100
MASTER_DIR=/home/ubuntu/crawl_master/
SHARED_DIR=/home/ubuntu/lib/
```

### Prepare

Update all the `.env` files in `crawl_master/env/`.


### On Server

Create a user where all master files will be stored at.

```bash
adduser master

usermod -aG sudo master

su - master
```

Install docker and docker swarm with:

See Instructions here https://www.digitalocean.com/community/tutorials/how-to-install-and-use-docker-on-ubuntu-18-04

check that docker is correctly installed

```bash
systemctl status docker
```

Add the user to the docker group:

```bash
sudo usermod -aG docker master
```

#### Installing node and typescript

Installing Node: https://linuxize.com/post/how-to-install-node-js-on-ubuntu-18.04/

```bash
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -

apt-get install -y nodejs

# node --version
v10.19.0
# npm --version
6.13.4
```

Then install the typescript compiler globally:

```bash
npm install -g typescript

tsc --version
```

### Deploy

Now deploy with the deploy script:

```bash
source env/.env

./deploy/deploy.sh deploy
```