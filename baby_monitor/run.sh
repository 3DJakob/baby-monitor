#!/usr/bin/with-contenv bashio

export PORT=8099
export STUN_SERVERS
STUN_SERVERS="$(bashio::addon.options | jq -c '.stun_servers')"

DIRECT_ADDRESS="$(bashio::config 'direct_address')"
if ! [[ "${DIRECT_ADDRESS}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  bashio::exit.nok "direct_address must be an IPv4 address."
fi

CERT_DIR=/data/certificates
CA_KEY="${CERT_DIR}/baby-monitor-ca.key"
CA_CERT="${CERT_DIR}/baby-monitor-ca.crt"
SERVER_KEY="${CERT_DIR}/baby-monitor.key"
SERVER_CSR="${CERT_DIR}/baby-monitor.csr"
SERVER_CERT="${CERT_DIR}/baby-monitor.crt"
SERVER_EXT="${CERT_DIR}/baby-monitor.ext"
CERT_ADDRESS="${CERT_DIR}/server-address"

umask 077
mkdir -p "${CERT_DIR}"

if [ ! -f "${CA_KEY}" ] || [ ! -f "${CA_CERT}" ]; then
  bashio::log.info "Creating local Baby Monitor certificate authority"
  openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
    -keyout "${CA_KEY}" \
    -out "${CA_CERT}" \
    -subj "/CN=Baby Monitor Local CA"
fi

if [ ! -f "${SERVER_CERT}" ] || [ ! -f "${SERVER_KEY}" ] \
  || [ ! -f "${CERT_ADDRESS}" ] || [ "$(<"${CERT_ADDRESS}")" != "${DIRECT_ADDRESS}" ]; then
  bashio::log.info "Creating local server certificate for ${DIRECT_ADDRESS}"
  openssl req -new -newkey rsa:2048 -nodes \
    -keyout "${SERVER_KEY}" \
    -out "${SERVER_CSR}" \
    -subj "/CN=${DIRECT_ADDRESS}"
  printf 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:%s\n' "${DIRECT_ADDRESS}" > "${SERVER_EXT}"
  openssl x509 -req -sha256 -days 825 \
    -in "${SERVER_CSR}" \
    -CA "${CA_CERT}" \
    -CAkey "${CA_KEY}" \
    -CAcreateserial \
    -out "${SERVER_CERT}" \
    -extfile "${SERVER_EXT}"
  printf '%s' "${DIRECT_ADDRESS}" > "${CERT_ADDRESS}"
fi

export TLS_CERTIFICATE_PATH="${SERVER_CERT}"
export TLS_KEY_PATH="${SERVER_KEY}"
export CA_CERTIFICATE_PATH="${CA_CERT}"
export TLS_PORT=8443

exec node /app/index.js
