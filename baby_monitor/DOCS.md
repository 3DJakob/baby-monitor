# Baby Monitor

Open **Baby Monitor** from the Home Assistant sidebar on the camera device and
select **Stream**. Open the same sidebar panel on another device and select
**Watch**.

Home Assistant's Ingress proxy supplies authenticated access to the panel. The
app only carries WebRTC signaling; audio and video flow directly from the
streaming browser to each viewer.

## Direct local-network access

The app also listens directly on your Home Assistant host, with no Home
Assistant login required:

- `http://192.168.1.67:8099` works for watching, but browsers such as
  iPhone Safari will not permit camera access over HTTP.
- `https://192.168.1.67:8088` supports streaming after the local certificate
  authority is trusted.

Direct endpoints have **no application authentication**. Anyone able to reach
these ports on your local network can watch or start a stream. Do not expose
them to the internet.

On first start, the app creates a local certificate authority (CA) and an IP
certificate for `direct_address`. On every streaming phone or tablet:

1. Open `http://192.168.1.67:8099/baby-monitor-ca.crt` and install the CA
   profile.
2. On iPhone/iPad, go to **Settings → General → About → Certificate Trust
   Settings**, enable full trust for **Baby Monitor Local CA**, and confirm.
3. Open `https://192.168.1.67:8088` and select **Stream**.

If your Home Assistant IP changes, update `direct_address` in the app's
configuration and restart it, then use the new IP in both URLs. Devices that
already trust the CA do not need to install it again.

## Configuration

`stun_servers` is a list of STUN URLs passed to the browser WebRTC clients.
The default Google STUN server is suitable for most local networks. If your
network requires a TURN server, include its URL here; TURN credentials are not
currently supported.

## Limitations

- One device can stream at a time.
- This add-on creates no Home Assistant camera entity and does not record or
  relay video.
- A browser may pause a backgrounded streaming tab. Keep the streaming device
  awake and the Baby Monitor panel open.
