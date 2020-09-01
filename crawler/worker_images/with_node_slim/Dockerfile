# A minimal Docker image with Node, google-chrome-stable and Xvfb
# Author: Nikolai Tschacher
# Website: https://scrapeulous.com/

# Run with: docker run tschachn/crawler:latest

# Inspired/based upon:
# - https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md#running-puppeteer-in-docker
# - https://github.com/browserless/chrome/blob/master/Dockerfile
# - https://github.com/apifytech/apify-actor-docker/blob/master/node-chrome/Dockerfile

FROM node:slim

LABEL maintainer="hire@incolumitas.com (Nikolai Tschacher)"
LABEL description="The base image for the crawler using google-chrome-stable and xvfb"

# Application parameters and variables
ENV HOST=0.0.0.0
ENV APP_DIR=/crawler
# generate with:
# cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1

ENV API_URL=https://167.99.241.135:9001/
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD 1
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/google-chrome-stable
# Tell Node.js this is a production environemnt
ENV NODE_ENV=production
# when this env var is set, a headful test is done before
# launching the crawl server
ENV TEST_PPTR_HEADFUL 0
# use pptr unstable instead of stable
ENV USE_CHROME_UNSTABLE 0
ENV CHROME_EXECUTABLE "google-chrome-stable"
# whether the virtual framebuffer x server is launched
ENV USING_XVFB 1
ENV EXECUTION_ENV 'docker'

# Select Chrome version, must be compatible with Puppeteer version!
# Find versions at https://www.ubuntuupdates.org/pm/google-chrome-stable
# or https://www.ubuntuupdates.org/package/google_chrome/stable/main/base/google-chrome-stable

# !!! IMPORTANT: REMOVE THE TRAILING -1 FROM THE VERSION. 84.0.4147.135-1 => 84.0.4147.135
ENV CHROME_VERSION="84.0.4147.135"

# Create app directory
WORKDIR $APP_DIR

# update environment variables when we want to use google-chrome-unstable
RUN if [ "$USE_CHROME_UNSTABLE" = "1" ]; then \
    CHROME_EXECUTABLE=google-chrome-unstable &&\
    PUPPETEER_EXECUTABLE_PATH="/usr/bin/$CHROME_EXECUTABLE"; \
  fi

# Install latest Chrome dev packages and fonts to support major charsets (Chinese, Japanese, Arabic, Hebrew, Thai and a few others)
# Note: this installs the necessary libs to make the bundled version of Chromium that Puppeteer installs, work.
# adapted from here: https://github.com/apifytech/apify-actor-docker/blob/master/node-chrome/Dockerfile
RUN DEBIAN_FRONTEND=noninteractive apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y wget gnupg2 ca-certificates \
 && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | DEBIAN_FRONTEND=noninteractive apt-key add - \
 && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
 && DEBIAN_FRONTEND=noninteractive apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y procps unzip git $CHROME_EXECUTABLE fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst ttf-freefont --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /src/*.deb \
 && DEBIAN_FRONTEND=noninteractive apt-get purge --auto-remove -y

# Remove yarn, it's not needed
RUN rm -rf /opt/yarn /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Install xvfb frame buffer needed for non-headless Chrome
RUN apt-get update \
 && apt-get install -y xvfb \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /src/*.deb

# Bundle app source and install dependencies
# dont copy node_modules directory
COPY . .

# install node packages
RUN npm install

# add dumb-init to prevent chrome zombie processes
ADD https://github.com/Yelp/dumb-init/releases/download/v1.2.2/dumb-init_1.2.2_amd64 /usr/local/bin/dumb-init
RUN chmod +x /usr/local/bin/dumb-init

# Set up xvfb
ENV DISPLAY=:99
# By default, only screen 0 exists and has the dimensions 1280x1024x8
ENV XVFB_WHD=1280x720x16

# Install default dependencies, print versions of everything
RUN echo "Node.js version:" \
 && node --version \
 && echo "NPM version:" \
 && npm --version \
 && echo "Google Chrome version:" \
 && $CHROME_EXECUTABLE --version \
 && echo "Npm Package versions:" \
 && node -p "require('./package.json').dependencies" \
 && pwd

CMD [ "/usr/local/bin/dumb-init",  "worker_images/with_node_slim/start_xvfb_and_run_cmd.sh" ]
