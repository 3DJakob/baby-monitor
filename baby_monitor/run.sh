#!/usr/bin/with-contenv bashio

export PORT=8099
export STUN_SERVERS
STUN_SERVERS="$(bashio::addon.options | jq -c '.stun_servers')"

if bashio::config.true 'ssl'; then
  export TLS_CERTIFICATE_PATH="/ssl/$(bashio::config 'certfile')"
  export TLS_KEY_PATH="/ssl/$(bashio::config 'keyfile')"
  export TLS_PORT=8443
fi

exec node /app/index.js
