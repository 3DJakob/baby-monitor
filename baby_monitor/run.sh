#!/usr/bin/with-contenv bashio

export PORT=8099
export STUN_SERVERS
STUN_SERVERS="$(bashio::addon.options | jq -c '.stun_servers')"

exec node /app/index.js
