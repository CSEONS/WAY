FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY docker-entrypoint-ssl.sh /docker-entrypoint.d/50-generate-self-signed-cert.sh
RUN chmod +x /docker-entrypoint.d/50-generate-self-signed-cert.sh
