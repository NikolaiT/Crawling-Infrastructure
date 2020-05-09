## Scheduler 

Before running the scheduler.

Create the logging directory with:

```bash
sudo mkdir -p /var/log/scheduler/
sudo chown ec2-user:ec2-user /var/log/scheduler/
```

Then start the scheduler with

```bash
node dist/scheduler/daemon.js --conf /home/ec2-user/crawl_master/scheduler/scheduler.conf.json
```
