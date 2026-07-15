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

### HTTPS setup for iPhone and iPad streaming

iOS only allows a page to use the camera and microphone when it is loaded from a secure origin. For a Homebridge server on your local network, the simplest setup is one local certificate authority (CA) and one server certificate for `homebridge.local`. Use the same server certificate and private key for every phone or tablet; the devices only need to trust the CA certificate.

The instructions below assume that:

- the Homebridge machine is reachable as `homebridge.local`;
- you will always open `https://homebridge.local:8088` (do not switch between the hostname and the IP address); and
- OpenSSL is installed on the Homebridge machine.

#### 1. Create a certificate directory

Run these commands on the Homebridge machine. The example uses `/var/lib/homebridge/certs`; use another directory if your Homebridge installation uses a different service home directory.

```bash
sudo mkdir -p /var/lib/homebridge/certs
cd /var/lib/homebridge/certs
```

#### 2. Create a local certificate authority

Create this once. Keep `baby-monitor-ca.key` private and backed up; anyone who obtains it could create certificates trusted by your devices.

```bash
sudo openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
  -keyout baby-monitor-ca.key \
  -out baby-monitor-ca.crt \
  -subj "/CN=Baby Monitor Local CA"
```

#### 3. Create a certificate for `homebridge.local`

Create the certificate extension file:

```bash
sudo tee homebridge.local.ext >/dev/null <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:homebridge.local
EOF
```

Then create and sign the server certificate:

```bash
sudo openssl req -new -newkey rsa:2048 -nodes \
  -keyout homebridge.local.key \
  -out homebridge.local.csr \
  -subj "/CN=homebridge.local"

sudo openssl x509 -req -sha256 -days 825 \
  -in homebridge.local.csr \
  -CA baby-monitor-ca.crt \
  -CAkey baby-monitor-ca.key \
  -CAcreateserial \
  -out homebridge.local.crt \
  -extfile homebridge.local.ext
```

The files used by the plugin are now:

- Certificate: `/var/lib/homebridge/certs/homebridge.local.crt`
- Private key: `/var/lib/homebridge/certs/homebridge.local.key`
- CA certificate to install on iOS devices: `/var/lib/homebridge/certs/baby-monitor-ca.crt`

The `.key`, `.csr`, `.srl`, and `.ext` files are not entered in the plugin settings. Never share the CA or server private keys.

#### 4. Allow Homebridge to read the certificate and key

The service user is commonly named `homebridge`, but verify it on your system:

```bash
systemctl show -p User homebridge
```

Then set ownership and permissions, replacing `homebridge:homebridge` if your service uses a different user or group:

```bash
sudo chown -R homebridge:homebridge /var/lib/homebridge/certs
sudo chmod 700 /var/lib/homebridge/certs
sudo chmod 644 /var/lib/homebridge/certs/homebridge.local.crt
sudo chmod 600 /var/lib/homebridge/certs/homebridge.local.key
```

#### 5. Configure the plugin in Homebridge UI

In the plugin settings, set:

- **TLS Certificate Path** to `/var/lib/homebridge/certs/homebridge.local.crt`
- **TLS Private Key Path** to `/var/lib/homebridge/certs/homebridge.local.key`

These correspond to the `https.certificatePath` and `https.keyPath` options:

```json
{
  "platform": "BabyMonitorLocal",
  "name": "Baby Monitor",
  "port": 8088,
  "hostName": "homebridge.local",
  "https": {
    "certificatePath": "/var/lib/homebridge/certs/homebridge.local.crt",
    "keyPath": "/var/lib/homebridge/certs/homebridge.local.key"
  }
}
```

Save the settings and restart Homebridge. The log should show:

```text
Baby monitor UI available on https://homebridge.local:8088
```

#### 6. Trust the CA on each iPhone or iPad

You must do this once per device:

1. Send `baby-monitor-ca.crt` to the device, for example with AirDrop or Files.
2. Open the file and install the configuration profile when iOS prompts you.
3. Go to **Settings → General → VPN & Device Management** and finish installing the profile if necessary.
4. Go to **Settings → General → About → Certificate Trust Settings**.
5. Enable full trust for **Baby Monitor Local CA** and confirm.
6. Open `https://homebridge.local:8088` in Safari and press **Stream**.

If you use the IP address instead, the certificate must also contain that IP address in its `subjectAltName`; a certificate for `homebridge.local` will not validate when opened as `https://192.168.x.x:8088`. Watching over plain HTTP may work, but iOS will not allow that page to start the camera.

The camera creates a separate peer-to-peer WebRTC connection for each watcher. The server only relays the small setup messages and never receives the video or audio.

## Current limitations

- This is a lightweight local prototype, not a hardened production baby monitor
- Some mobile browsers pause background tabs aggressively
- Browsers only allow camera access from a secure origin. `localhost` works for local development; to use a phone or tablet as the camera over the LAN, serve this page over HTTPS and trust its certificate on that device
- WebRTC on a strict network may need different STUN or TURN settings
- Only one camera stream can be live at a time
- This plugin does not yet create a HomeKit accessory tile inside Apple Home
