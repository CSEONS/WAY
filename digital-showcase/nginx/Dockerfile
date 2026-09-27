FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

# Run by the official image before nginx starts, in name order.
COPY docker-entrypoint-ssl.sh /docker-entrypoint.d/50-generate-self-signed-cert.sh
COPY docker-entrypoint-site.sh /docker-entrypoint.d/60-site-domain.sh
COPY site.conf.template /etc/nginx/site-templates/site.conf.template
RUN chmod +x /docker-entrypoint.d/50-generate-self-signed-cert.sh /docker-entrypoint.d/60-site-domain.sh
