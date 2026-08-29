# Home Assistant Baby Monitor

This project is a Home Assistant app (formerly called an add-on) that serves a
local baby monitor web page. The page offers two actions:

- `Stream`: opens the local camera and microphone on one device
- `Watch`: receives the live stream on another device

After the initial WebSocket signaling handshake, the media stream is sent directly between peers with WebRTC, so Home Assistant does not relay the video itself.

## What this does

- Runs as a small Node.js app in Home Assistant
- Uses Home Assistant Ingress for authenticated, HTTPS browser access
- Uses WebSockets only for signaling
- Uses WebRTC for peer-to-peer audio/video
- Supports one live stream at a time with automatic watcher join
- The server is authoritative: it records the active camera and explicitly pairs every new watcher with it
- Does not create a camera entity, record video, or relay media through Home Assistant

## Install in Home Assistant OS or Supervised

1. Push this repository to GitHub, or copy it to Home Assistant's local apps
   directory as `/addons/baby-monitor`.
2. In Home Assistant, open **Settings → Apps → App store** and add the GitHub
   repository URL (or refresh the local app store).
3. Install **Baby Monitor**, then start it.
4. Open **Baby Monitor** from the sidebar on the streaming and watching devices.

The Ingress connection is served through your Home Assistant URL, so no
certificate paths or Bonjour settings are required. For camera access, use a
secure Home Assistant URL on the streaming browser.

For unauthenticated local access, use `http://<home-assistant-ip>:8099`.
Enable the app's optional TLS settings to stream directly from iOS at
`https://<certificate-hostname>:8443`. Direct endpoints are accessible to any
device on the LAN and must not be exposed to the internet.

## Configuration

`stun_servers` is a list of WebRTC STUN server URLs. The default works on most
home networks. Advanced networks may need a TURN server; credentials are not
yet configurable.

## Development

From this project directory:

```bash
npm install
```

You can run the signaling server directly:

```bash
node index.js
```

It listens on port `8099` by default. Set `PORT` to use another port, and
`STUN_SERVERS` to a JSON array of STUN URLs.

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
- This app does not create a Home Assistant camera entity
