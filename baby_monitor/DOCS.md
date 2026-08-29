# Baby Monitor

Open **Baby Monitor** from the Home Assistant sidebar on the camera device and
select **Stream**. Open the same sidebar panel on another device and select
**Watch**.

Home Assistant's Ingress proxy supplies the secure browser context required by
camera devices and authenticates access to the panel. The add-on only carries
WebRTC signaling; audio and video flow directly from the streaming browser to
each viewer.

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
