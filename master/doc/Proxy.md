# Proxies

## Support for whitelisting proxies

Whitelisting proxies are proxies, where authentication occurs over IP whitelisting.

AWS Lambda does not give us predictable, static public IP addresses, therefore it's not possible to 
use those kinds of proxies from Lambda Crawlers.

Therefore, we have two plausible solutions:

1. Maintain one large proxy server ([squid](https://wiki.archlinux.org/index.php/Squid)) with a static IP address (elastic IP aws) that can be whitelisted on the proxy providers. The IP address of this proxy server is then whitelisted. This proxy accepts http/https traffic from the lambda workers and routes it to the actual end-proxies. 

    **Disadvantage**: There is and additional network hop in the request chain, but the scraped/crawled website won't (probably) notice that. **Why not?** I mean when the response takes longer compared to a one hop client, won't the server be able to realize that? Another 
    disadvantage is the fixed costs of this large proxy server. Id needs to be somewhat powerful to handle 
    potentially many thousands of concurrent TCP streams. Also network bandwith costs cannot be neglected.

    (Lambda Worker) --- forward request ---> (proxy server static IP) --- forward request ---> (proxy)
    
    Done by setting the `Forwarded` header:
     
     `Forwarded: for=192.0.2.60;proto=http;by=203.0.113.43`

    See here: https://developer.mozilla.org/en-US/docs/Web/HTTP/Proxy_servers_and_tunneling
    
2. For tasks that require whitelisting proxies, it would be possible to dynamically allocate EC2 instances with custom AMI images (or Docker Images) and with static IP addresses. Requests can then be made to those whitelisting proxies from those ec2 instances.

    **Disadvantage**: We need to know in advance what proxies are assigned to workers. For such tasks that require full proxy support (including white listed proxies), a possible solution would be to only start EC2 based workers with [AWS static IP addresses](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html).
    

## Proxy management

How can we ensure that all proxies are roughly used equally much?


## suggestions to create docker swarm infra on top of EC2 server with elastic ip AWS

Allocate EC2 servers from east coast region, Ohio. See where it is cheaper.
Reserve 3-4 elastic static IP addresses. Then get a large server and run multiple browsers on one instance, 64 core, 128GB ram, 64 docker images of browsers, 300 USD a month.

Use a docker swarm (https://github.com/docker/swarm) to run 64 concurrent worker instances.
 
The Master has 4 different server sizes that define how much power is needed.

Test with ec2 spot instances, docker swarm.

make master server a docker image as well, and run it as a swarm itself.

Read into docker swarm: https://github.com/docker/swarm
Read this: https://docs.docker.com/swarm/overview/
Tutorial: https://docs.docker.com/engine/swarm/swarm-tutorial/