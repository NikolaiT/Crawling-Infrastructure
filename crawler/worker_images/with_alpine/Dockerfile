# https://github.com/Zenika/alpine-chrome

FROM zenika/alpine-chrome:with-node

# Application parameters and variables
ENV HOST=0.0.0.0
ENV PORT=3333
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD 1
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium-browser

# Create app directory
WORKDIR /usr/src/app

USER root

ADD https://github.com/Yelp/dumb-init/releases/download/v1.2.2/dumb-init_1.2.2_amd64 /usr/local/bin/dumb-init
RUN chmod +x /usr/local/bin/dumb-init

# switch to less privileged user
USER chrome

# Bundle app source and install dependencies
# dont copy node_modules directory
COPY . .

# copy our special package.json
# we don't need all the dependencies, that's why whe don't
# copy the root package.json
COPY --chown=chrome ./worker_images/with_alpine/package.json .

# install node packages
RUN npm install

EXPOSE $PORT

ENTRYPOINT ["tini", "--"]

# RUN ls -la .

CMD ["dumb-init", "node", "dist/server/server.js"]
