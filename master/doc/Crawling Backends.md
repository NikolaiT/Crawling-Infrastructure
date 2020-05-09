# Crawling Backends

## Intro

We need some computational resource where we can run our nasty crawling code.
In that regard, all we need is a computational instance:

+ That can be allocated on demand
+ Whose costs are billed per minuted/hourly
+ That has an public networking interface with public IP address
+ Where N parallel instances can be allocated for some reasonably large N

## AWS Lambda

AWS Lambda instances can be easily used for crawling.

Advantages:

- Many different regions
- Up to 50 unique public IP addresses for each region
- relatively cheap
- never fails
- paying only for the computational resources consumed

Disadvantages:

- execution time up to 5 minutes (which is not really a problem)


## AWS EC2

It's also possible to allocate EC2 instances on demand. In that sense, it makes sense to create a docker image that exposes an interface that behaves similar as a lambda instance to the crawling master server.

That way the EC2 instances behave exactly the same as serverless Lambda instances, except:

- Unlimited running time
- We can assign a static IP address via AWS Elastic IP addresses

Disadvantages:

- The initial setup is quite expensive, because we need to load a docker image which is usually about 1GB in size.

## AWS EC2 Spot Instances

They are basically server fractals that can be claimed back by AWS at any time (usually 2 minutes notice) and run on up to 90% reduced costs. For crawling, it doesn't matter if the instance suddenly disappears, since the queue is always in consistent state and data is stored anyway in cloud storage.


## Azure Functions

Develop more efficiently with Functions, an event-driven serverless compute platform that can also solve complex orchestration problems. Build and debug locally without additional setup, deploy and operate at scale in the cloud, and integrate services using triggers and bindings.