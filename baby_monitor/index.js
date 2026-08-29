'use strict';

const { BabyMonitorServer } = require('./src/platform');

function readStunServers() {
  try {
    const stunServers = JSON.parse(process.env.STUN_SERVERS || '[]');
    return Array.isArray(stunServers) ? stunServers : undefined;
  } catch {
    throw new Error('STUN_SERVERS must be a JSON array of server URLs.');
  }
}

const log = {
  info: (...args) => console.log('[baby-monitor]', ...args),
  warn: (...args) => console.warn('[baby-monitor]', ...args),
  error: (...args) => console.error('[baby-monitor]', ...args)
};

function start() {
  const server = new BabyMonitorServer(log, {
    port: Number(process.env.PORT || 8099),
    stunServers: readStunServers(),
    certificatePath: process.env.TLS_CERTIFICATE_PATH,
    keyPath: process.env.TLS_KEY_PATH,
    caCertificatePath: process.env.CA_CERTIFICATE_PATH,
    tlsPort: Number(process.env.TLS_PORT || 8443)
  });

  server.startServer().catch((error) => {
    log.error('Server failed to start:', error);
    process.exitCode = 1;
  });

  process.once('SIGINT', () => server.stopServer());
  process.once('SIGTERM', () => server.stopServer());

  return server;
}

if (require.main === module) {
  start();
}

module.exports = { BabyMonitorServer, start };
