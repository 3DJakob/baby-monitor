FROM ghcr.io/home-assistant/base:latest

RUN apk add --no-cache nodejs npm openssl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js ./
COPY src ./src
COPY public ./public
COPY run.sh /run.sh

RUN chmod a+x /run.sh

CMD ["/run.sh"]
