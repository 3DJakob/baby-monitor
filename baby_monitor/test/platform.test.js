'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { WebSocket } = require('ws');
const { BabyMonitorServer } = require('../src/platform');

function waitFor(socket, type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2000);
    socket.on('message', (buffer) => {
      const message = JSON.parse(buffer.toString());
      if (message.type === type) {
        clearTimeout(timeout);
        resolve(message);
      }
    });
  });
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

test('the active streamer is paired with watchers and routes signaling', async (t) => {
  const platform = new BabyMonitorServer({ info() {}, warn() {}, error() {} }, { port: 0 });
  await platform.startServer();
  t.after(() => platform.stopServer());

  const port = platform.server.address().port;
  const streamer = await connect(`ws://127.0.0.1:${port}`);
  t.after(() => streamer.close());
  const streamerJoined = waitFor(streamer, 'joined');
  streamer.send(JSON.stringify({ type: 'join', role: 'streamer' }));
  const active = await streamerJoined;
  assert.equal(active.role, 'streamer');

  const watcher = await connect(`ws://127.0.0.1:${port}`);
  t.after(() => watcher.close());
  const watcherJoined = waitFor(watcher, 'joined');
  const watcherPaired = waitFor(streamer, 'watcher-joined');
  watcher.send(JSON.stringify({ type: 'join', role: 'watcher' }));
  const joiningWatcher = await watcherJoined;
  const paired = await watcherPaired;
  assert.equal(joiningWatcher.role, 'watcher');
  assert.equal(paired.watcherId, joiningWatcher.clientId);

  const offerReceived = waitFor(watcher, 'offer');
  streamer.send(JSON.stringify({
    type: 'offer',
    targetClientId: joiningWatcher.clientId,
    payload: { type: 'offer', sdp: 'test-offer' }
  }));
  const offer = await offerReceived;
  assert.equal(offer.fromClientId, active.clientId);

  const answerReceived = waitFor(streamer, 'answer');
  watcher.send(JSON.stringify({
    type: 'answer',
    targetClientId: active.clientId,
    payload: { type: 'answer', sdp: 'test-answer' }
  }));
  const answer = await answerReceived;
  assert.equal(answer.fromClientId, joiningWatcher.clientId);
});
