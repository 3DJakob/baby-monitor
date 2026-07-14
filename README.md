# Homebridge Baby Monitor Local

This project is a simple Homebridge platform plugin that serves a local baby monitor web page from your Raspberry Pi. The page offers two actions:

- `Stream`: opens the local camera and microphone on one device
- `Watch`: receives the live stream on another device

After the initial WebSocket signaling handshake, the media stream is sent directly between peers with WebRTC, so the Homebridge server does not relay the video itself.

## What this does

- Hosts a small Express web app on your Homebridge Raspberry Pi
- Uses WebSockets only for signaling
- Uses WebRTC for peer-to-peer audio/video
- Supports one live stream at a time with automatic watcher join
- The server is authoritative: it records the active camera and explicitly pairs every new watcher with it
- Advertises the site with Bonjour so it is easier to discover on your network

## Recommended URL

Because your Homebridge machine already resolves as `homebridge.local`, the simplest URL is:

```text
http://homebridge.local:8088
```

If `homebridge.local` is unavailable on a given device, use the Pi IP address instead, for example:

```text
http://192.168.1.50:8088
```

## Install

From this project directory:

```bash
npm install
```

To use it with Homebridge, link or publish it as a normal Homebridge plugin, then add this platform config:

```json
{
  "platform": "BabyMonitorLocal",
  "name": "Baby Monitor",
  "port": 8088,
  "hostName": "homebridge.local",
  "serviceName": "Baby Monitor"
}
```

## Local development

You can run the web server entry directly:

```bash
node index.js
```

For a real Homebridge run, Homebridge will load the plugin and start the server after launch.

## How to use

1. Open the page on the camera device and press `Stream`.
2. Allow camera and microphone access.
3. Open the same page on another device.
4. If a stream is already live, the page joins it automatically. Otherwise press `Watch`.

The camera creates a separate peer-to-peer WebRTC connection for each watcher. The server only relays the small setup messages and never receives the video or audio.

## Current limitations

- This is a lightweight local prototype, not a hardened production baby monitor
- Some mobile browsers pause background tabs aggressively
- Browsers only allow camera access from a secure origin. `localhost` works for local development; to use a phone or tablet as the camera over the LAN, serve this page over HTTPS and trust its certificate on that device
- WebRTC on a strict network may need different STUN or TURN settings
- Only one camera stream can be live at a time
- This plugin does not yet create a HomeKit accessory tile inside Apple Home
