'use strict';

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

class BabyMonitorServer {
  constructor(log, config = {}) {
    this.log = log;
    this.config = config;
    this.server = null;
    this.wss = null;
    this.tlsServer = null;
    this.tlsWss = null;
    this.clients = new Set();
    this.streamerClientId = null;
  }

  async startServer() {
    const port = Number(this.config.port ?? 8088);
    const publicPath = path.join(__dirname, '..', 'public');

    const app = express();
    app.use(express.json());
    app.use(express.static(publicPath, {
      etag: false,
      lastModified: false,
      maxAge: 0,
      setHeaders: (res) => res.set('Cache-Control', 'no-store')
    }));

    app.get('/health', (_req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({
        ok: true,
        hasActiveStreamer: this.hasActiveStreamer(),
        mode: 'webrtc-p2p-signaling'
      });
    });

    app.get('/config.json', (_req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({
        stunServers: this.config.stunServers || ['stun:stun.l.google.com:19302'],
        pluginName: 'Baby Monitor Local',
        hasActiveStreamer: this.hasActiveStreamer()
      });
    });

    if (this.config.caCertificatePath) {
      app.get('/baby-monitor-ca.crt', (_req, res) => {
        res.type('application/x-x509-ca-cert');
        res.sendFile(this.config.caCertificatePath);
      });
    }

    this.server = http.createServer(app);
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on('error', (error) => {
      this.log.error('WebSocket server error:', error.message);
    });
    this.wss.on('connection', (socket, request) => this.handleSocket(socket, request));

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, '0.0.0.0', resolve);
    });

    this.log.info(`Baby monitor signaling server listening on port ${this.server.address().port}`);

    const hasCertificate = Boolean(this.config.certificatePath);
    const hasKey = Boolean(this.config.keyPath);
    if (hasCertificate !== hasKey) {
      throw new Error('certificatePath and keyPath must be configured together.');
    }

    if (hasCertificate) {
      const tlsPort = Number(this.config.tlsPort ?? 8443);
      this.tlsServer = https.createServer({
        cert: fs.readFileSync(this.config.certificatePath),
        key: fs.readFileSync(this.config.keyPath)
      }, app);
      this.tlsWss = new WebSocketServer({ server: this.tlsServer });
      this.tlsWss.on('error', (error) => {
        this.log.error('Secure WebSocket server error:', error.message);
      });
      this.tlsWss.on('connection', (socket, request) => this.handleSocket(socket, request));

      await new Promise((resolve, reject) => {
        this.tlsServer.once('error', reject);
        this.tlsServer.listen(tlsPort, '0.0.0.0', resolve);
      });
      this.log.info(`Secure direct-access server listening on port ${this.tlsServer.address().port}`);
    }
  }

  stopServer() {
    for (const client of this.clients) {
      client.socket.close();
    }
    this.clients.clear();
    this.streamerClientId = null;

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.tlsWss) {
      this.tlsWss.close();
      this.tlsWss = null;
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    if (this.tlsServer) {
      this.tlsServer.close();
      this.tlsServer = null;
    }

  }

  handleSocket(socket, request) {
    let currentClient = null;

    this.log.info(`WebSocket connection opened from ${request.socket.remoteAddress || 'unknown-address'}`);

    socket.on('message', (messageBuffer) => {
      try {
        const message = JSON.parse(messageBuffer.toString());

        if (message.type === 'join') {
          if (currentClient) {
            return;
          }

          const requestedRole = message.role === 'streamer' ? 'streamer' : 'watcher';
          // The server owns the single-streamer decision. A concurrent camera
          // request becomes a watcher rather than an unregistered dead socket.
          const role = requestedRole === 'streamer' && !this.hasActiveStreamer()
            ? 'streamer'
            : 'watcher';
          const clientId = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          currentClient = { id: clientId, role, socket };
          this.clients.add(currentClient);

          if (role === 'streamer') {
            this.streamerClientId = clientId;
          }

          this.log.info(`Client joined as ${role}: ${clientId}`);
          this.sendToClient(clientId, {
            type: 'joined',
            clientId,
            role,
            activeStreamerId: this.streamerClientId,
            hasActiveStreamer: this.hasActiveStreamer()
          });

          if (role === 'streamer') {
            // A newly active camera must explicitly pair with watchers that
            // were already waiting, not rely on clients noticing a broadcast.
            for (const client of this.clients) {
              if (client.role === 'watcher') {
                this.sendToClient(clientId, { type: 'watcher-joined', watcherId: client.id });
              }
            }
          } else if (this.streamerClientId) {
            this.sendToClient(this.streamerClientId, {
              type: 'watcher-joined',
              watcherId: clientId
            });
          }

          this.broadcastStreamerStatus();
          return;
        }

        if (!currentClient) {
          socket.send(JSON.stringify({
            type: 'error',
            message: 'Join before sending signaling messages.'
          }));
          return;
        }

        if (!['offer', 'answer', 'ice-candidate'].includes(message.type)) {
          return;
        }

        const targetClientId = String(message.targetClientId || '');
        const targetClient = this.findClient(targetClientId);
        if (!targetClient || !this.isValidSignalRoute(currentClient, targetClient, message.type)) {
          this.log.warn(`Rejected ${message.type} from ${currentClient.id} to ${targetClientId || 'unknown'}`);
          return;
        }

        this.sendToClient(targetClientId, {
          type: message.type,
          fromClientId: currentClient.id,
          payload: message.payload || null
        });
      } catch (error) {
        socket.send(JSON.stringify({
          type: 'error',
          message: `Invalid message: ${error.message}`
        }));
      }
    });

    socket.on('close', () => {
      if (!currentClient) {
        return;
      }

      this.clients.delete(currentClient);

      if (currentClient.id === this.streamerClientId) {
        this.streamerClientId = null;
      }

      this.log.info(`Client disconnected: ${currentClient.id}`);

      if (currentClient.role === 'watcher' && this.streamerClientId) {
        this.sendToClient(this.streamerClientId, {
          type: 'watcher-left',
          watcherId: currentClient.id
        });
      }

      this.broadcastStreamerStatus();
    });
  }

  broadcast(message, exceptClientId = null) {
    for (const client of this.clients) {
      if (client.id === exceptClientId) {
        continue;
      }

      if (client.socket.readyState === 1) {
        client.socket.send(JSON.stringify(message));
      }
    }
  }

  sendToClient(clientId, message) {
    const client = this.findClient(clientId);
    if (client && client.socket.readyState === 1) {
      client.socket.send(JSON.stringify(message));
    }
  }

  findClient(clientId) {
    for (const client of this.clients) {
      if (client.id === clientId) {
        return client;
      }
    }
    return null;
  }

  isValidSignalRoute(source, target, type) {
    if (type === 'offer') {
      return source.role === 'streamer' && target.role === 'watcher';
    }
    if (type === 'answer') {
      return source.role === 'watcher' && target.id === this.streamerClientId;
    }
    return (source.role === 'streamer' && target.role === 'watcher')
      || (source.role === 'watcher' && target.id === this.streamerClientId);
  }

  broadcastStreamerStatus() {
    this.broadcast({
      type: 'streamer-status',
      activeStreamerId: this.streamerClientId,
      hasActiveStreamer: this.hasActiveStreamer()
    });
  }

  hasActiveStreamer() {
    return Boolean(this.streamerClientId);
  }
}

module.exports = {
  BabyMonitorServer
};
