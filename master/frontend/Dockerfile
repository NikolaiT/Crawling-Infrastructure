FROM node:latest

ENV PORT=8080

# set working directory
RUN mkdir /usr/src/frontend
WORKDIR /usr/src/frontend

# add `/usr/src/app/node_modules/.bin` to $PATH
ENV PATH /usr/src/frontend/node_modules/.bin:$PATH

# Bundle app source and install dependencies
# dont copy node_modules directory
COPY . .

RUN npm install serve

CMD serve -s build -l $PORT