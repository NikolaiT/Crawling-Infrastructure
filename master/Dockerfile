# https://github.com/torchhound/mongo-crud/blob/master/docker/Dockerfile.production
FROM ubuntu:18.04

# Application parameters and variables
ENV HOST=0.0.0.0
ENV PORT=9001
ENV application_directory=/home/node/app

# Create app directory
WORKDIR $application_directory

# Install Nodejs on Ubuntu 18.04
RUN apt-get update
RUN apt -y install curl
RUN curl -sL https://deb.nodesource.com/setup_12.x | /bin/bash
RUN apt -y install nodejs

RUN npm install -g yarn

# Bundle app source and install dependencies
# dont copy node_modules directory
COPY . .

RUN yarn install

# Cleanup
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

## Add the wait script to the image
ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.7.3/wait /wait
RUN chmod +x /wait

EXPOSE $PORT

RUN ls -lah

# start the API express server
# wait until docker mongodb service is available
CMD /wait && node dist/master/src/server.js