FROM ubuntu:16.04
RUN apt-get update
RUN apt-get install -y apt-transport-https lsb-release curl git sudo
RUN curl -s https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add -
RUN echo 'deb https://deb.nodesource.com/node_7.x xenial main' > /etc/apt/sources.list.d/nodesource.list
RUN apt-get update
RUN apt-get install -y mongodb nodejs graphicsmagick
#RUN git clone https://github.com/Coonti/Coonti /coonti
ADD . /coonti
WORKDIR /coonti
RUN npm install
EXPOSE 8080
RUN sed -i '/What to do now/cconsole.log(err);' coonti/core.js  # hack for issue #3
CMD mongod --config /etc/mongodb.conf & ./coonti.sh
