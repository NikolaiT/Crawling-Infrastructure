# Distributed crawling infrastructure

This software allows you to crawl and scrape the Internet in scale.

It supports basic crawling via http as well as sophisticated crawling with the help
of a heavily customized headless chrome browser controlled via puppeteer.

The aim is to be able to scrape/crawl websites that try to block so called
robots. In our opinion, as long as the overall network throughput is conservative and
the crawler doesn't drain any resources and is placing an burden on websites, it should be allowed to
extract information from **public datasets**.

Platforms don't own the data that they collect from their customers. This is an attempt to give developers more access to data in the public domain again.

If you want to get access to data crawled by plain http requests, please have a look at the [common crawl project](https://commoncrawl.org/). However, if you need to access data that is only shown with activated JavaScript or a modified browsing fingerprint that evades common detection techniques, this project might be for you.

## Vision

The vision of this project is to provide a open-source, general purpose crawling infrastructure that enables it's users to

- crawl any website by specifying a simple crawling function ([Examples](https://github.com/NikolaiT/scrapeulous))
- crawl with distributed machines
- allocate and destroy crawling endpoints based on requirements
- use the cheapest infrastructure as crawling endpoints
- leverage cloud technology and big data principles
- configure browsers in a way that it's (nearly) impossible for anti-detection technologies to find out that the crawler is a machine

## Scraping Service - [Scrapeulous.com](https://scrapeulous.com/)

This project is a open source tool and will remain a open source tool in the future. We need the collaborative work of the community.

However, some people would want to quickly have a service that lets them scrape public data from Google or any other website. For this reason, we created the web service [scrapeulous.com](https://scrapeulous.com/).

## Technical Introduction

Crawling soon becomes a very complicated endeavour. There are a couple of sub problems:

### Cat and mouse game between bots and anti-bot companies

The basic goal is to make your crawler indistinguishable from a human that controls a browser. This is a very
complicated task, since anti-bot companies observe and process a wide variety of data such as:

+ IP addresses and geolocation (mobile, data-center, residential IP address?)
+ The browser fingerprint (OS, plugins, Canvas, WebRTC, ...)
+ Mouse movements and the kybernetics of how the browser is handled

This is a never ending fight between the cat (detection companies) and the mouse (crawler).

We don't want to impose a burden on websites, we just want fair access to data.

[Current research](https://hal.inria.fr/hal-02441653/document) demonstrates how complicated this game has become.

### Robust queueing and handling distributed crawlers

Crawling is distributed onto several machines/servers. Therefore, there needs to be some kind of advanced algorithms that
handles queues and schedules new tasks in an efficient way to avoid potential bottlenecks.

### Infrastructure

Crawling endpoints must be able to be allocated fully automatic and based on crawling requirements. Furthermore, the cheapest server infrastructure must be rented (currently AWS Spot instances I guess).

As an alternative, crawling endpoints can be run on serverless cloud computing providers such as AWS Lambda or Microsoft Azure Functions to obtain scalability and avoid fixed costs.

The downside is that we cannot keep browsers open when we are making use of a on-demand serverless architecture.

### Big Data

When crawling many million urls, you cannot simply store the results in a CSV file. Data needs to be stored in the cloud (for example AWS s3) and there needs to be some kind of streamling post processing.


## Todo List for the near Future

I need a lot of help with the following issues:

0. See if switching from docker swarm to kubernetes has advantages and has benefits
1. Stay on top of the cat and mouse game:
    - Find new evasion techniques. Test how Google & Bing blocks. Is it soley based on IP addresses?
    - Make fully use of [uncaptcha](https://github.com/ecthros/uncaptcha)
    - Integrate intelligence of the [research paper from Antoine Vastel et al.](https://hal.inria.fr/hal-02441653/document)
    - Make use of newest contributions from [puppeteer-stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)
    - Use some detection evavsion techniques from the no longer maintained [headless-chrome-crawler](https://github.com/yujiosaka/headless-chrome-crawler)   

2. Use the most recent version of chromium & puppeteer in AWS Lambda and Azure Functions with the package [chrome-aws-lambda](https://github.com/alixaxel/chrome-aws-lambda) [done]

3. Testing, testing, testing! Test the code base much better and expand *worker* tests such as found here: `crawler/test/`


## Documentation

+ [Full documentation for the APIs]()
+ [A tutorial how to scrape google and extract email addreses from the urls]()

## Master Server

Includes the RESTful API that accepts new crawl tasks and loads the items into mongodb queue.

Location: `master/src/`

Run server with:

```
cd master
npm install
npm run build
node dist/src/server.js
```

To view and understand how the API works, please visit the swagger API documentation at the url: **http://localhost:9001/swagger/**

The master also includes the crawling scheduler. It's purpose is to maintain the crawling throughput of each
task created via the API.

To run the daemon, run the command:

```
cd master
npm install
npm run build
source scheduler/.envBash
node dist/scheduler/daemon.js --conf scheduler/scheduler.conf.json
```

## Worker

This is the actual crawling software. The crawling software either runs within a docker swarm cluster, kubernetes cluster or on AWS Lambda or Google Cloud Functions or Azure Functions. It's up to you.

Upload the crawler to AWS lambda them with:

```
npm run deploy
```

You will need to have serverless installed globally:

```
npm install -g serverless
```

## Tutorial

This tutorial is divided into two parts.

1. Install the distributed crawling infrastructure within the AWS infrastructure
2. Start a crawl task that will crawl the html of the top 10.000 websites and store the cleaned html in the cloud. For the top 10k websites, we use the scientific [tranco list](https://tranco-list.eu/): A Research-Oriented Top Sites Ranking Hardened Against Manipulation. This list offers several improvements over the old Alexa top 1M website ranking list. For more information, please visit their website.
3. As a concluding task, we run business logic on the stored html files. Example: Extract all urls from the html documents. Or: Run some analytics on the meta elements.

In order to follow this tutorial, you will at least require an
AWS account. We will make use of the following AWS services:

+ AWS Lambda as a crawling backend
+ AWS S3 to store crawled html data
+ An AWS EC2 instance used as a master server that schedules the crawl task and hosts the mongodb that we use a queue


### Setting up the infrastructure

First we need to install a Ubuntu 18.04 server on Amazon AWS EC2 with docker support. Additionally, we will assign a elastic IP address to this instance.

Therefore, we login to our AWS console and go to Services -> EC2 and then we press the Button *Launch Instance* and search for *ami-0fc20dd1da406780b* which is the AMI for Ubuntu 18.04 LTS.

We will select this AMI image and select the size `t2.medium` (2vCPU and 4GiB memory).

This is what you should see after this step:
![alt text](docs/images/ec2_setup.png "Logo Title Text 1")

Then we click on **launch** and for the last step we have to create a key pair to access our instance. We download this PEM file and store it on our local file system for later.

Before we can access our instance, we assign an elastic IP address to our launched instance.

We navigate to Services -> EC2 -> Elastic IPs and we click on **Allocate Elastic IP address** and we create a new elastic IP from Amazon's pool. Then we assign this elastic IP address to the previously created EC2 instance. You should write down this public IP address. Let's assume this IP address is: `3.22.191.249`.

As a last step, we assign a permissive Security Group to the allocated instance. In my case, I just allowed all traffic from all sources on all port ranges by default. It's not really secure, but I will destroy the instance anyway after a couple of hours.

If you want to restrict TCP/IP traffic with the firewall, the following ports need to be open: 22, 80, 9001, 8080.

Now that our instance is launched, we can access it with the following shell command

```bash
chmod 0700 ~/keypairs/crawling_tutorial.pem

ssh -i ~/keypairs/crawling_tutorial.pem root@3.22.191.249
```

### On the Server

Create a user for the master server.

```bash
# become root user
sudo su

adduser master

usermod -aG sudo master

su - master
```

Install docker and docker swarm with instructions to be found here: https://www.digitalocean.com/community/tutorials/how-to-install-and-use-docker-on-ubuntu-18-04

check that docker is correctly installed

```bash
sudo systemctl status docker
```

Add the user to the docker group:

```bash
sudo usermod -aG docker master
```

#### Installing node and typescript

Installing Node tutorial: https://linuxize.com/post/how-to-install-node-js-on-ubuntu-18.04/

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

### Deploy the Master server

Now we need to configure the deployment. We create an `deploy.env` file by creating a file with the following contents.

```bash
export SERVER=ubuntu@3.22.191.249
export PEMFILE=/path/to/pemfile.pem

export REMOTE_MASTER_DIR=/home/master/master/
export REMOTE_LIBRARY_DIR=/home/master/lib/
```

on the server, we create the directories with

```bash
mkdir -p /home/master/master/

mkdir -p /home/master/lib/
```

Now we update the environment configuration file for the master server in production mode. This environment file includes
all the settings that the master server needs to work properly. We edit the file `env/skeleton_production.env` and fill out the missing variables and parameters.

The file is commented and should be self explanatory. As a last step, we rename the file from `env/skeleton_production.env` to `env/production.env`. We do the same for the file `env/skeleton_development.env`.

As an example, we go step by step through the environment file `env/skeleton_production.env`:

First,

Now we are ready to deploy the project with the commands:

```bash
cd master

./loadenv.sh

./deploy/deploy.sh deploy
```

#### Deploying the crawler to AWS Lambda

As a last deployment step, we need to deploy our crawler to AWS Lambda. [AWS Lambda](https://aws.amazon.com/de/lambda/) is a serverless computational service that lets you run your code for a maximum of five minutes. The AWS Lambda Api offers scalability and a pay-per-used-resources billing scheme. Without AWS Lambda, we would need to rent our own VPS servers to do the actual crawling work. This is also supported by this software, but for the sake of this tutorial we will use AWS Lambda.

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

```js
function deploy_crawl_worker() {
    console.log(systemSync(`npm run build`));

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

#### Testing the Installation

Now the crawling infrastructure should be ready to work. We will test our work by simply creating a crawl job that obtains the IP address by visiting the url `https://ipinfo.io/json` and return it.

The Api call to create the task looks like this. Please replace `{{API_KEY}}` with the correct value.

```bash
cd ../master

export $(grep -v '^#' env/production.env | xargs -0);

curl -k "$API_URL"task/ \
  -H "Content-Type: application/json" \
  -d '{"API_KEY": "{{API_KEY}}",
       "items": ["https://ipinfo.io/json", "https://ipinfo.io/json", "https://ipinfo.io/json", "https://ipinfo.io/json", "https://ipinfo.io/json", "https://ipinfo.io/json"],
       "function": "https://github.com/NikolaiT/scrapeulous/blob/master/http.js",
       "crawl_options": {
          "request_timeout": 20000,
          "random_user_agent": true
       },
       "max_items_per_second": 1.0 }'
```

and after a couple of moments the task should be finished and we can download the results from the S3 storage with the following Api call:

```bash
curl -k https://167.99.241.135:9001/results/5ea5591a5e3cf90007602e46?API_KEY="$API_KEY"&sample_size=5&recent=1
```

### Creating the Top 10k crawl task

### Analyzing the results
