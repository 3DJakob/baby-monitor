(async () => {
  const streamButton = document.getElementById('streamButton');
  const watchButton = document.getElementById('watchButton');
  const modePicker = document.getElementById('modePicker');
  const experience = document.getElementById('experience');
  const localCard = document.getElementById('localCard');
  const remoteCard = document.getElementById('remoteCard');
  const statusEl = document.getElementById('status');
  const panelLabel = document.getElementById('panelLabel');
  const panelTitle = document.getElementById('panelTitle');
  const liveBadgeText = document.getElementById('liveBadgeText');
  const remotePill = document.getElementById('remotePill');
  const localVideo = document.getElementById('localVideo');
  const remoteVideo = document.getElementById('remoteVideo');

  const config = await fetch('/config.json', { cache: 'no-store' }).then((response) => response.json());
  const iceServers = (config.stunServers || []).map((urls) => ({ urls }));
  const peers = new Map();
  const pendingIce = new Map();

  let socket = null;
  let role = null;
  let clientId = null;
  let streamerId = config.hasActiveStreamer ? 'pending' : null;
  let localStream = null;
  let hasJoined = false;
  let autoWatchStarted = false;
  let statusPollTimer = null;
  let joinResolver = null;
  let joinRejecter = null;

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function setPanel(label, title) {
    panelLabel.textContent = label;
    panelTitle.textContent = title;
  }

  function showExperience() {
    modePicker.classList.add('hidden');
    experience.classList.remove('hidden');
    requestAnimationFrame(() => experience.classList.add('visible'));
  }

  function revealCard(card) {
    card.classList.remove('hidden');
    requestAnimationFrame(() => card.classList.add('visible'));
  }

  function updateLiveBadge(isLive) {
    liveBadgeText.textContent = isLive ? 'Stream live now' : 'No live stream yet';
    document.body.dataset.live = isLive ? 'true' : 'false';
  }

  function socketUrl() {
    return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  }

  function send(type, targetClientId, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('The signaling connection is not open.');
    }
    socket.send(JSON.stringify({ type, targetClientId, payload }));
  }

  function closePeer(peerId) {
    const peer = peers.get(peerId);
    if (peer) {
      peer.close();
      peers.delete(peerId);
    }
    pendingIce.delete(peerId);
  }

  async function addIce(peerId, candidate) {
    const peer = peers.get(peerId);
    if (!peer || !peer.remoteDescription) {
      const queued = pendingIce.get(peerId) || [];
      queued.push(candidate);
      pendingIce.set(peerId, queued);
      return;
    }
    await peer.addIceCandidate(candidate);
  }

  async function flushIce(peerId) {
    const peer = peers.get(peerId);
    const queued = pendingIce.get(peerId) || [];
    pendingIce.delete(peerId);
    for (const candidate of queued) {
      await peer.addIceCandidate(candidate);
    }
  }

  function createPeer(peerId) {
    const peer = new RTCPeerConnection({ iceServers });
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) {
        send('ice-candidate', peerId, candidate);
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        setStatus(role === 'streamer' ? 'Streaming live.' : 'Watching live.');
        remotePill.textContent = 'Live';
      } else if (peer.connectionState === 'failed') {
        closePeer(peerId);
        setStatus(role === 'streamer' ? 'Viewer connection failed.' : 'Connection failed. Waiting to reconnect…');
        remotePill.textContent = 'Waiting';
      }
    };
    peer.ontrack = ({ streams }) => {
      remoteVideo.srcObject = streams[0];
      remoteVideo.play().catch(() => {
        remotePill.textContent = 'Tap to play';
        setStatus('Tap the video to start playback.');
      });
      revealCard(remoteCard);
    };
    peers.set(peerId, peer);
    return peer;
  }

  async function startLocalStream() {
    if (localStream) {
      return localStream;
    }
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true
    });
    localVideo.srcObject = localStream;
    revealCard(localCard);
    return localStream;
  }

  function stopLocalStream() {
    localStream?.getTracks().forEach((track) => track.stop());
    localStream = null;
    localVideo.srcObject = null;
  }

  async function offerWatcher(watcherId) {
    if (!localStream || peers.has(watcherId)) {
      return;
    }
    const peer = createPeer(watcherId);
    for (const track of localStream.getTracks()) {
      peer.addTrack(track, localStream);
    }
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    send('offer', watcherId, peer.localDescription);
    setStatus('Connecting viewer…');
  }

  async function acceptOffer(nextStreamerId, offer) {
    closePeer(nextStreamerId);
    const peer = createPeer(nextStreamerId);
    await peer.setRemoteDescription(offer);
    await flushIce(nextStreamerId);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    send('answer', nextStreamerId, peer.localDescription);
    setStatus('Connecting to stream…');
  }

  async function connect(nextRole) {
    role = nextRole;
    const url = socketUrl();
    socket = new WebSocket(url);
    const joined = new Promise((resolve, reject) => {
      joinResolver = resolve;
      joinRejecter = reject;
    });

    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'join', role: nextRole })), { once: true });
    socket.addEventListener('message', async ({ data }) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'joined') {
          hasJoined = true;
          clientId = message.clientId;
          role = message.role;
          streamerId = message.activeStreamerId || null;
          updateLiveBadge(Boolean(message.hasActiveStreamer));
          joinResolver?.(message);
          joinResolver = null;
          joinRejecter = null;

          if (role === 'watcher') {
            if (localStream) {
              stopLocalStream();
            }
            revealCard(remoteCard);
            setPanel('Watch', 'Watching the nursery.');
            setStatus(streamerId ? 'Waiting for camera connection…' : 'Waiting for a stream to start…');
          } else {
            setStatus('Camera ready. Waiting for a watcher…');
          }
          return;
        }
        if (message.type === 'watcher-joined' && role === 'streamer') {
          await offerWatcher(message.watcherId);
          return;
        }
        if (message.type === 'watcher-left' && role === 'streamer') {
          closePeer(message.watcherId);
          setStatus('Camera ready. Waiting for a watcher…');
          return;
        }
        if (message.type === 'offer' && role === 'watcher') {
          streamerId = message.fromClientId;
          await acceptOffer(message.fromClientId, message.payload);
          return;
        }
        if (message.type === 'answer' && role === 'streamer') {
          const peer = peers.get(message.fromClientId);
          if (peer) {
            await peer.setRemoteDescription(message.payload);
            await flushIce(message.fromClientId);
          }
          return;
        }
        if (message.type === 'ice-candidate') {
          await addIce(message.fromClientId, message.payload);
          return;
        }
        if (message.type === 'streamer-status') {
          streamerId = message.activeStreamerId || null;
          updateLiveBadge(Boolean(message.hasActiveStreamer));
          if (role === 'watcher' && !streamerId) {
            remoteVideo.srcObject = null;
            remotePill.textContent = 'Waiting';
            setStatus('Waiting for a stream to start…');
          }
        }
      } catch (error) {
        setStatus(`Connection error: ${error.message}`);
      }
    });
    socket.addEventListener('close', () => {
      hasJoined = false;
      joinRejecter?.(new Error('Connection to the baby monitor closed.'));
      joinResolver = null;
      joinRejecter = null;
      setStatus('Connection closed. Refresh to reconnect.');
    });
    socket.addEventListener('error', () => joinRejecter?.(new Error(`Could not reach ${url}.`)), { once: true });
    return joined;
  }

  async function enterStreamMode() {
    autoWatchStarted = true;
    showExperience();
    setPanel('Stream', 'This device is the baby camera.');
    setStatus('Starting camera…');
    try {
      // Only advertise a stream after camera permission succeeds.
      await startLocalStream();
      await connect('streamer');
      updateLiveBadge(role === 'streamer');
    } catch (error) {
      stopLocalStream();
      setStatus(`Could not start stream: ${error.message}`);
    }
  }

  async function enterWatchMode(autoStarted = false) {
    autoWatchStarted = true;
    showExperience();
    revealCard(remoteCard);
    setPanel('Watch', autoStarted ? 'Live stream found. Joining now.' : 'Watching the nursery.');
    setStatus(autoStarted ? 'Joining live stream…' : 'Waiting for stream…');
    try {
      await connect('watcher');
    } catch (error) {
      setStatus(`Could not join stream: ${error.message}`);
    }
  }

  function startStatusPolling() {
    statusPollTimer = window.setInterval(async () => {
      if (hasJoined || autoWatchStarted) {
        return;
      }
      try {
        const health = await fetch('/health', { cache: 'no-store' }).then((response) => response.json());
        updateLiveBadge(Boolean(health.hasActiveStreamer));
        if (health.hasActiveStreamer) {
          streamButton.disabled = true;
          watchButton.disabled = true;
          await enterWatchMode(true);
        }
      } catch (_) {
        // The picker remains usable if the status request is temporarily unavailable.
      }
    }, 1000);
  }

  remoteVideo.addEventListener('click', () => remoteVideo.play().catch(() => {}));
  streamButton.addEventListener('click', () => {
    streamButton.disabled = true;
    watchButton.disabled = true;
    enterStreamMode();
  });
  watchButton.addEventListener('click', () => {
    streamButton.disabled = true;
    watchButton.disabled = true;
    enterWatchMode();
  });

  updateLiveBadge(Boolean(config.hasActiveStreamer));
  setStatus(config.hasActiveStreamer ? 'Live stream detected.' : 'Choose Stream or Watch.');
  startStatusPolling();
  if (config.hasActiveStreamer) {
    streamButton.disabled = true;
    watchButton.disabled = true;
    await enterWatchMode(true);
  }
})();
