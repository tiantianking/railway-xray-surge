FROM ghcr.io/xtls/xray-core:latest AS xray
FROM node:20-alpine
COPY --from=xray /usr/local/bin/xray /usr/local/bin/xray
WORKDIR /app
COPY config.json.template server.js entrypoint.sh ./
RUN chmod +x entrypoint.sh
CMD ["sh", "entrypoint.sh"]
