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

- `http://<home-assistant-ip>:8099` works for watching, but browsers such as
  iPhone Safari will not permit camera access over HTTP.
- `https://<home-assistant-hostname>:8443` supports streaming when TLS is
  enabled and the certificate matches the hostname you use.

Direct endpoints have **no application authentication**. Anyone able to reach
these ports on your local network can watch or start a stream. Do not expose
them to the internet.

To enable direct HTTPS, enable `ssl` and configure `certfile` and `keyfile`.
They are read from Home Assistant's `/ssl` folder, so a certificate managed by
your existing Home Assistant/DuckDNS setup can be reused. Use a hostname that
is present in the certificate's Subject Alternative Name; a certificate for a
DNS name does not validate when you browse by IP address.

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
