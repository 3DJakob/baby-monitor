'use strict';

const { BabyMonitorPlatform } = require('./src/platform');

const PLUGIN_NAME = 'homebridge-baby-monitor-local';
const PLATFORM_NAME = 'BabyMonitorLocal';

function registerPlugin(api) {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, BabyMonitorPlatform);
}

module.exports = registerPlugin;

if (require.main === module) {
  const log = {
    info: (...args) => console.log('[baby-monitor]', ...args),
    warn: (...args) => console.warn('[baby-monitor]', ...args),
    error: (...args) => console.error('[baby-monitor]', ...args)
  };

  const platform = new BabyMonitorPlatform(log, {}, null);
  platform.startServer().catch((error) => {
    log.error('Standalone server failed to start:', error);
    process.exitCode = 1;
  });

  process.on('SIGINT', () => {
    platform.stopServer();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    platform.stopServer();
    process.exit(0);
  });
}
