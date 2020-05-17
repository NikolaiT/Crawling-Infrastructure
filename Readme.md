# Distributed crawling infrastructure

This software allows you to crawl and scrape the Internet in scale.

It supports basic crawling via http as well as sophisticated crawling with the help
of a heavily customized headless chrome browser controlled via puppeteer.

The aim is to be able to scrape/crawl websites that try to lock out automated bots. In our opinion, as long as the overall network throughput is conservative and the crawler doesn't drain any resources or is placing a burden on websites, it should be allowed to
extract information from **public datasets**.

Platforms don't own the data that they collect from their customers. On the same time they generate a lot of wealth with said data. This is an attempt to give developers more access to data in the public domain again.

If you want to get access to data crawled by plain http requests, please have a look at the [common crawl project](https://commoncrawl.org/). However, if you need to access data that is only shown with activated JavaScript or a modified browsing fingerprint that evades common detection techniques, this project might be for you.

## Vision

The vision of this project is to provide a **open-source, general purpose crawling infrastructure** that enables it's users to

- crawl any website by specifying a simple crawling function ([Examples](https://github.com/NikolaiT/scrapeulous))
- crawl with distributed machines
- allocate and destroy crawling endpoints based on crawling need (only rent computing instances when you need them)
- use the cheapest infrastructure as crawling endpoints (currently AWS Spot Instances)
- leverage cloud technology and big data technologies
- configure browsers in a way that it's (nearly) impossible for anti-detection technologies to find out that the crawler is a machine
- integrate external captcha solving services
- use any proxy provider that you want

## Scraping Service - [Scrapeulous.com](https://scrapeulous.com/)

This project is a open source tool and will remain a open source tool in the future. We need the collaborative brain of the open source community in order to create a state of the art crawling software.

However, some people would want to quickly have a service that lets them scrape public data from Google or any other website. For this reason, we created the SaaS service [scrapeulous.com](https://scrapeulous.com/).

## Technical Introduction

Crawling soon becomes a very complicated endeavor. There are a couple of sub problems:

### Cat and mouse game between bots and anti-bot companies

The basic goal is to make your crawler indistinguishable from a human that controls a browser. This is a very
complicated task, since anti-bot companies observe and process a wide variety of data such as:

+ IP addresses and geolocation (mobile, data-center, residential IP address?)
+ The browser fingerprint (OS, plugins, Canvas, WebRTC, ...)
+ Mouse movements and the kybernetics of how the browser is handled

This is a never ending fight between the cat (detection companies) and the mouse (crawler).

We don't want to impose a burden on websites, we just want fair access to data.

[Current research](https://hal.inria.fr/hal-02441653/document) demonstrates how complicated this push and pull game has become.

### Robust queuing and handling distributed crawlers

Crawling is distributed onto several machines/servers. Therefore, there needs to be some kind of advanced algorithms that
handles queues and schedules new tasks in an efficient way to avoid potential bottlenecks.

### Infrastructure

Crawling endpoints must be able to be allocated fully automatic and based on crawling requirements. Furthermore, the cheapest server infrastructure must be rented (currently AWS Spot instances I guess).

As an alternative, crawling endpoints can be run on serverless cloud computing providers such as AWS Lambda or Microsoft Azure Functions to obtain scalability and avoid fixed costs.

The downside is that we cannot keep browsers open when we are making use of a on-demand serverless architecture.

### Big Data

When crawling many million urls, you cannot simply store the results in a CSV file. Data needs to be stored in the cloud (for example AWS S3) and there needs to be some kind of streaming post processing.


## Todo List for the near Future

**We need a lot of help** with the following issues:

0. See if switching from docker swarm to kubernetes has advantages and benefits
1. Stay on top of the cat and mouse game:
    - Find new evasion techniques. Test how Google & Bing blocks. Is it solely based on IP addresses?
    - Make fully use of [uncaptcha](https://github.com/ecthros/uncaptcha)
    - Integrate intelligence of the [research paper from Antoine Vastel et al.](https://hal.inria.fr/hal-02441653/document)
    - Make use of newest contributions from [puppeteer-stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)
    - Use some detection evasion techniques from the no longer maintained [headless-chrome-crawler](https://github.com/yujiosaka/headless-chrome-crawler)   

2. Use the most recent version of chromium & puppeteer in AWS Lambda and Azure Functions with the package [chrome-aws-lambda](https://github.com/alixaxel/chrome-aws-lambda) [done]

3. Testing, testing, testing! Test the code base much better and expand *worker* tests such as found here: `crawler/test/`


## Documentation

+ [Full documentation for the APIs]()
+ [A tutorial how to scrape google and extract email addresses from the urls]()

## Quick Installation & Compilation

You need to have a recent version of nodejs, npm and yarn installed on your development environment.

Install typescript globally:

```bash
sudo npm install -g typescript
```

### Master

Includes the RESTful API that accepts new crawl tasks and loads the items into mongodb queue.

Location: `master/src/`

Compile & install the project locally:

```bash   
cd master/

npm install

# switch to the library and install and compile it first!
cd ../lib/
tsc

# go back to the master and compile it
cd ../master/
tsc

# now we can run the Api express server
node dist/master/src/server.js
```

To view and understand how the API works, please visit the swagger API documentation at the url: **http://localhost:9001/swagger/**

The master also includes the crawling scheduler. It's purpose is to maintain the crawling throughput of each
task created via the API.

To run the daemon, execute the following command:

```
node dist/master/scheduler/daemon.js
```

### Crawler

This is the actual crawling module. The crawling module either runs within a docker swarm cluster, kubernetes cluster or on AWS Lambda or Google Cloud Functions or Azure Functions. It's up to you which backend do you want to use to execute your crawler nodes.

Upload the crawler to AWS lambda with:

```
npm run deploy
```

You will need to have serverless installed globally:

```
npm install -g serverless
```


### Test the Crawler

Testing the crawler module is an extremely important task, because failure in the crawling logic is fatal when you are
having huge crawl task over millions of items in the queue.

In order to test the crawler, use the following commands to create the Docker Crawler image.

```bash
cd crawler/
npm install

# install & compile lib
cd ../lib
npm install
tsc

cd ../crawler
./build.sh
```

After the image was successfully built, you can run the integration test with the following command:

```bash
mocha --timeout 300000 -r ts-node/register test/integration_tests.ts
```

## Tutorial

You want to run your own scaleable crawling infrastructure? That is only possible if you have the following resources:

1. You own a AWS/Azure/Google Cloud account
2. You have the requirements to execute long running crawl tasks over hundred thousand and millions of items
3. You know the implications of what you are doing

This tutorial is divided into three parts.

1. Install the distributed crawling infrastructure within the AWS cloud infrastructure
2. Start a crawl task that will crawl the Html of the top 10.000 websites and store the cleaned Html documents on s3. For the top 10k websites, we use the scientific [tranco list](https://tranco-list.eu/): A Research-Oriented Top Sites Ranking Hardened Against Manipulation. This list offers several improvements over the old Alexa top 1M website ranking list. For more information, please visit their website.
3. As a concluding task, we run business logic on the stored Html files. For example, we extract all urls from the Html documents or we run some analytics on the meta tags found in the `<head>` section of the documents.

In order to follow this tutorial, you will at least **require an
AWS account**. We will make use of the following AWS services:

+ AWS Lambda as a crawling backend
+ AWS S3 to store crawled Html data
+ An AWS EC2 instance used as a master server that schedules the crawl task and hosts the mongodb that we use a queue


### Setting up the infrastructure

All actions are performed in the AWS web dashboard and we choose the region **us-east-1 (north Virgina)** as a default region.

First we need to install a Ubuntu 18.04 server on Amazon AWS EC2 with docker support. Additionally, we will assign a elastic IP address to the newly created instance.

Therefore, we login to our AWS console and go to Services -> EC2 and then we press the Button *Launch Instance* and search for *Ubuntu 18.04 LTS* on the **AWS Marketplace** tab.

We select the Ubuntu 18.04 LTS - Bionic image. This is what you should see:
![alt text](docs/images/ami_instance.png "Ami Instance Selection")

We will select this AMI image and select the machine size of `t2.medium` (2vCPU and 4GiB memory). Maybe it's also possible to use the size `t2.small`, we haven't tested it.

This is what you should see after setting up the instance:
![alt text](docs/images/ec2_setup.png "Setting up the instance")

Then we click on **launch** and for the last step we have to create a key pair to access our instance. We download this PEM file and store it on our local file system for later (I named the PEM file `tutorial.pem`).

Before we can access our instance, we assign an elastic IP address to our launched instance.

We navigate to Services -> EC2 -> Elastic IPs and we click on **Allocate Elastic IP address** and we create a new elastic IP from Amazon's pool. Then we assign this elastic IP address to the previously created EC2 instance. You should remember this public IP address for the remainder of the tutorial. Let's assume the elastic IP address is: `34.193.81.78`.

As a last step, we assign a permissive Security Group to the allocated instance. In my case, I just allowed all traffic from all sources on all port ranges by default. It's not really secure, but I will destroy the instance anyway after a couple of hours.

If you want to restrict TCP/IP traffic with the firewall, the following ports need to be open: 22, 80, 9001, 8080.

Now that our instance is launched, we can access it with the following shell command

```bash
chmod 0700 ~/keypairs/tutorial.pem

ssh -i ~/keypairs/tutorial.pem ubuntu@34.193.81.78
```

### Creating AWS keys for production use

The crawling infrastructure needs AWS Api keys for AWS Lambda and S3 in order to work properly.

In the AWS Dashboard, go to Services -> IAM and create a new user with the name *crawling-user* and check the selected field *programmatic access*.

Click on the tab *Attach existing policies directly* and add the following access policies:

+ AWSLambdaFullAccess
+ AmazonS3FullAccess
+ CloudWatchFullAccess

As a last step, download the generated `credentials.csv` file. Store this credentials file for later.

### Commands on the Server

Create a user for the master server. In this tutorial, we will use the user `ubuntu` for deploying the crawl master server.

```bash
# become root user
sudo su

adduser master

usermod -aG sudo master

su - master
```

As a next step, [Install docker and docker swarm with digitalocean instructions](https://www.digitalocean.com/community/tutorials/how-to-install-and-use-docker-on-ubuntu-18-04).

check that docker is correctly installed

```bash
sudo systemctl status docker
```

Add the `ubuntu` user to the docker group:

```bash
sudo usermod -aG docker ubuntu

# confirm adding the user was a success
# logout/login from the current shell session first
id -nG
```

#### Installing nodejs, yarn and typescript on the server

Installing Node on Ubuntu 18.04 tutorial: https://linuxize.com/post/how-to-install-node-js-on-ubuntu-18.04/

The following commands need to be executed:

```bash
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -

sudo apt-get install -y nodejs

node --version
v10.20.1

npm --version
6.14.4
```

Then install the typescript compiler globally:

```bash
sudo npm install -g typescript

tsc --version
Version 3.8.3
```

Then we install yarn with the [following instructions](https://classic.yarnpkg.com/en/docs/install/#debian-stable):

```bash
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list

sudo apt update && sudo apt install yarn

yarn --version
```

### Clone the project and install & compile

Go to cozy place on your local file system and download the crawling infrastructure project with the command:

```bash
git clone https://github.com/NikolaiT/Crawling-Infrastructure.git

cd Crawling-Infrastructure/
```

Now compile the project locally. We need to have a recent node version installed for that. Then we install typescript globally with the command

```bash
sudo npm install -g typescript
```

Now we are ready to install & compile the project locally:

```bash
cd master/

npm install

# switch to the library and install and compile it first!
cd ../lib/
tsc

# go back to the master and compile it
cd ../master/
tsc
```

After that step, the crawling infrastructure should be compiled successfully.

### Deploy the Master server

Now we need to configure the deployment. We edit the file `master/deploy/env/deploy.env` file by specifying the following contents.

```bash
# edit the IP address of the AWS EC2 instance that you just created
export SERVER=master@34.193.81.78
export PEMFILE=/path/to/saved/pemfile.pem

# those are the paths to the deployed crawling infrastructure
# on the remote master server
export REMOTE_MASTER_DIR=/home/ubuntu/master/
export REMOTE_LIBRARY_DIR=/home/ubuntu/lib/
```

Now we update the environment configuration file for the master server in production mode. This environment file includes
all the settings that the master server scheduler & Api need in order to work properly. We edit the file `master/env/skeleton_production.env` and update & modify the missing parameters.

For example, our environment file should look similar to the following:

```env
NODE_ENV=production

AWS_ACCESS_KEY=awsAccessKeyGeneratedPreviously
AWS_SECRET_KEY=awsSecretKeyGeneratedPreviously
AWS_REGION=us-east-1

API_PORT=9001
API_HOST=0.0.0.0

CRAWL_WORKER_PORT=3333

MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=someSuperSecureMongoDBPassword

MONGO_DATA_DIR=/data/db
MONGO_TEST_DATA_DIR=/data/test_db
MONGO_LOG_FILE=/var/log/mongodb/mongodb.log

MONGODB_CONNECTION_URL=mongodb://admin:someSuperSecureMongoDBPassword@34.193.81.78/

MASTER_IP=34.193.81.78

API_URL=https://34.193.81.78:9001/
API_KEY=someCrawlingInfraApiKey
DEMO_API_KEY=someDemoCrawlingInfraApiKey

DOCKER_STACK_NAME=Master

USE_REMOTE_DB=1
```

The variables `AWS_ACCESS_KEY` and `AWS_SECRET_KEY` contain the AWS credentials that we created in the earlier step.
The variables `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD` are the credentials for the mongodb database.

You can choose arbitrary credentials for the variables `MONGO_INITDB_ROOT_PASSWORD`, `API_KEY` and `DEMO_API_KEY`.

As a last step, we rename the file from `master/env/skeleton_production.env` to `master/env/production.env`.

Also, create an empty `master/env/development.env` file. It is required by docker swarm.

Now we are ready to deploy the project to our recently created master server with the commands:

```bash
cd master

./deploy/deploy.sh deploy
```

The above command will compile the source code locally and deploy to the remote server and initialize a docker swarm there.

Now we have to create a default configuration on master server with the following commands:

```bash
node ctrl.js --action cfg --what create
```

You can test if deployment was successful by executing the following command:

```bash

$ ./deploy/test.sh
https://34.193.81.78:9001/
{
  "scheduler_uptime": "",
  "scheduler_version": "v1.3",
  "api_version": "1.0.2",
  "machines_allocated": 0,
  "http_machines_allocated": 0,
  "num_total_items": 0,
  "num_tasks": 0
```

#### Deploying the crawler to AWS Lambda

As a last deployment step, we need to deploy our crawler to AWS Lambda. [AWS Lambda](https://aws.amazon.com/de/lambda/) is a serverless computational service that lets you run your code for a maximum of five minutes. The AWS Lambda Api offers scalability and a pay-per-used-resources billing scheme. Without AWS Lambda, we would need to rent our own VPS servers to do the actual crawling work. Controlling own crawling servers is also supported by this project, but for the sake of this tutorial we will use AWS Lambda as crawling backend.

First we switch the directory to `worker/`.

Then we need to [install the serverless](https://serverless.com/framework/docs/providers/aws/guide/installation/) framework globally on our machine:

```bash
sudo npm install -g serverless
```

and we need to install typescript globally with the command:

```bash
sudo npm install -g typescript
```

Then we have to define to what regions we want to deploy our functions to. Update the file `crawler/deploy_all.js` and edit the functions starting on line 20 of the script.

```JavaScript
function deploy_crawl_worker() {
    console.log(systemSync('npm run build'));

    let regions = [
        'us-west-1',
        'us-west-2',
        'us-east-2',
        'us-east-1',
    // ...
```

After that we have to actually create S3 buckets on those regions, otherwise our crawled data could not be correctly stored. You can create AWS buckets programmatically with the script `scripts/create_buckets.sh` with the command:

```bash
./scripts/create_buckets.sh
```

Now that we have created those buckets, it's time to update the available regions on our master server. We change the directory to `master/` and issue the following commands:

```bash
cd master;

export $(grep -v '^#' env/production.env | xargs -0);

node ctrl.js --action cfg --what update_functions
```

Now the master server has the correct functions configured.

After those steps, it's finally time to upload our crawling code to AWS Lambda.

We can do this with the following commands:

```bash
# change back to worker directory
cd ../crawler;

export $(grep -v '^#' env/crawler.env | xargs -0);

node deploy_all.js worker
```

### Configure the Master server

By executing the following command, you open the web interface to administer the crawling infrastructure:

```bash
./launch_frontend_interface.sh
```

After that, we need to change some configuration parameters. We click on the **Config** tab in the menu and update
the options **Browser Lambda ARN** and **Http Lambda ARN**. We need to specify our correct AWS Account id. So for example, we save the
value `arn:aws:lambda:{region}:7685894858585:function:crawler-dev-browser-crawler` for **Browser Lambda ARN**.

### Testing the Installation

Now the crawling infrastructure should be ready to work. We will test our work by simply creating a crawl job that obtains the IP address by visiting the url `https://ipinfo.io/json` and return it.

You can issue the following command in order to create this test task:

```bash
export $(grep -v '^#' env/production.env | xargs -0);

node ctrl.js --action create_test_task
```

and after a couple of moments the task should be finished and we can download the results from the S3 storage. We go to the crawling dashboard for that with

```bash
./launch_frontend_interface.sh
```

and then go to Tasks and click on **Download Sample** on the task that was just created. We will get a tar.gz file with the crawling results.

### Creating the top 10k crawl task

The file that contains the top 10k urls can be found here: https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/items/top10k.txt

With the following command, you can start the crawl task that launches the crawling of the top 10.000 urls:

```bash
node ctrl.js --action create_10k_task
```

Alternatively, you can also create the crawl task via the web frontend that is started with the command `./launch_frontend_interface.sh`.

In order to create the task, you have to enter the following parameters in the web frontend.

![alt text](docs/images/crawl_task_config.png "Configuration for the crawl task of the top 10k websites")

### Analyzing the results

After the crawl task is completed, we will download the Html files that were stored in S3 storage. In order to obtain the download instructions, we
go to the web frontend to the *tasks* tab and then click on Actions -> Get Download instructions.

This shows us a bash script that contains commands to download the files from the cloud. We save and execute this script:

```bash

chmod +x download.sh

./download.sh
```

After the script is done downloading the files, all Html files are stored in the directory `/tmp/storage/`. After having saved the crawling results, we can actually run some business logic on it.

We will create a simple & concise node program in order to analyze and process the results.

#### Url analysis

The first simple task is to find all links in the Html documents and count the domains. We want to find out which domain occurs most across all the top 10.000 websites.

There is a node script that does exactly this job and it can be found in `master/other/domain_count.js`. Whene executing said script, we obtain
the following results:

```bash
/master$ node other/domain_count.js
jrj.com.cn 869
www.theguardian.com 678
china.com.cn 540
www.gov.cn 522
uol.com.br 518
www.mama.cn 408
www.wayfair.com 406
en.softonic.com 402
nypost.com 367
fortune.com 356
www.politico.com 348
www.nvidia.com 347
www.cnbc.com 329
www.suara.com 327
www.wsj.com 305
www.fandom.com 305
www.liputan6.com 267
www.foxnews.com 252
www.forbes.com 247
elpais.com 187
ext.hp.com 187
blog.csdn.net 186
twitter.com 182
www.buzzfeed.com 180
www.state.gov 175
www.theverge.com 172
www.ebay.com 170
www.facebook.com 167
www.linkedin.com 165
dailymail.co.uk 163
www.microsoft.com 152
www.babytree.com 143
www.virginmedia.com 136
finance.17ok.com 132
archive.org 131
```

The results above contain the Html of around 300 websites in that top 10k list. Therefore we haven't analyzed the full 10.000 Html files.

#### Meta Tag analysis

It's also interesting to analyze the meta tags in the stored html files.
