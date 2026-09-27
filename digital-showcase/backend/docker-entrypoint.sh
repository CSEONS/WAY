#!/bin/sh
set -e

# Volumes from older versions (or created by Docker) belong to root: hand them
# to the app user, then drop root. Commands run with "docker compose run" go
# through here too, so backups and restores never leave root-owned files.
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /app/data /app/uploads
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
