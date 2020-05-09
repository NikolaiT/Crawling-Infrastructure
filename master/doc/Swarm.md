# Docker Swarm Cloud Crawler

If everything fails, just use this cloud formation stack:

https://docs.docker.com/docker-for-aws/

1. https://jaxenter.de/docker-swarm-einfuehrung-65263
2. https://takacsmark.com/docker-swarm-tutorial-for-beginners/
3. https://www.ionos.com/digitalguide/server/know-how/docker-orchestration-with-swarm-and-compose/
4. https://github.com/docker/labs/blob/master/beginner/chapters/votingapp.md
5. https://medium.com/swlh/docker-swarm-tutorial-deploying-spring-boot-microservices-to-multiple-aws-ec2-instances-f28488179d0a

6. https://dzone.com/articles/creating-a-docker-overlay-network
7. https://www.callicoder.com/docker-machine-swarm-stack-golang-example/

8. https://community.risingstack.com/using-docker-swarm-for-deploying-nodejs-microservices/

Concept: Rent a huge EC2 ubuntu server with docker installed. Size: 64GB Ram, 32 Cores

Init a manager of the swarm with 

```
docker swarm init

Swarm initialized: current node (yc3wg199kidchk8oal5669nhm) is now a manager.

To add a worker to this swarm, run the following command:

    docker swarm join --token SWMTKN-1-3ti1i1ztqtubxdt0njpro10nyfht52ksqa88x404hj286zvjk0-dai91lwo618xnm4v0fi7mx2no 192.168.0.4:2377

To add a manager to this swarm, run 'docker swarm join-token manager' and follow the instructions.
```

The workers will be single instances of crawlers with the same abstraction as lambda functions.


## Complete Workflow for dynamically allocating docker swarm for tasks that require whitelisted IP's

1. Create Dockerfile for crawlers [done]
    Must support puppeteer and headless chromium and worker package
    Create simple API on top of worker that mimics AWS Lambda interface. [done]
    
2. Have docker, docker-compose, docker-machine installed on the  master server. [done]

3. Create functionality in daemon.ts to allocate a docker cluster on EC2 with 
elastic IP support. Specify 5 different sizes. [done]

4. Have a local docker registry setup on the master server with the worker image.
    Then the docker cluster can pull the worker docker image from the master registry server and begin it's work. See: https://www.ionos.com/digitalguide/server/know-how/docker-orchestration-with-swarm-and-compose/
    
   **Do we really need that?** Alternative is to publish a the image crawl_worker on docker hub...however, there is only one private image allowed.

5. Create function that sets up the docker swarm on this freshly allocated cluster
    Expose ports of this workers and register them to the master daemon.
    Now the daemon can invoke the worker daemons via api.

6. Decide when to destroy the docker swarm (when all tasks with requirements for a 
docker swarm cluster are completed)

## Docker Swarm system specification

The master needs to have several tools installed:

1. docker
2. docker-compose
3. docker-machine

When a new crawl task is created that requires static ip addresses, 
init a docker swarm with:

`docker swarm init`

Then launch 1-4 ec2 docker machines with 

`
docker-machine create -d amazonec2 \ --swarm --swarm-discovery token://<Swarm discovery token> \ node-01
`

get the token with:

```
docker swarm join-token worker -q
```

After instance creation, assign a Elastic IP address to it with `aws-sdk`.

The worker image is published to my private docker hub. The docker compose file of the crawl worker basically specifies the maximum number of resources each crawl_worker can consume:


Run the stack with:

https://stackoverflow.com/questions/52308815/resource-limits-specified-in-docker-compose-yml-not-taken-into-account-by-docker

```
docker stack deploy --compose-file docker-compose.yml crawlcluster
```

Show info:

```
docker stack services crawlcluster

docker stack ps crawlcluster
```

Show Logs:

```
docker service logs crawlcluster_crawl_worker
```

Inspect a specific worker:

```
docker inspect edutipjyyb69
```

Deactivate stack:

```
docker stack rm crawlcluster
```

Inspect a specific node in docker swarm:

```
docker node inspect r2nsjy3jq43d2e4qiw52zyt1o
```

Add a label to a certain node in order to satisfy the constraints:

```
docker node update --label-add type=crawl_worker r2nsjy3jq43d2e4qiw52zyt1o
```

## Docker Machine

Used to automatically rent ec2 instances with docker installed.

https://docs.docker.com/machine/overview/

You can actually make those freshly allocated machines join a docker swarm with the command

```
docker-machine create -d amazonec2 \ --swarm --swarm-discovery token://<Swarm discovery token> \ node-01
```


## Docker Debug commands

Docker swarm leave:

```
docker swarm leave --force
```

Show swarm logs:

```
docker service logs {service} -f
```


Leave the docker swarm:

```
docker swarm leave --force
```

Overview of all nodes in the swarm:

```
docker node ls
```