FROM node:20
COPY . /app
WORKDIR /app
CMD [ "node", "proxy-server.js", "user", "pass" ]
