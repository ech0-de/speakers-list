/**
 * composables/useSpeakers.js
 *
 * Speaker list state, persisted in localStorage and synced with other devices via PeerJS.
 * The state is shared by all views, so the peer is only created once per page load.
 */

import { ref, toRaw } from 'vue';
import { Peer } from 'peerjs';

const history = ref([]);
const list = ref([]);
// The current speaker is followed by metaCount meta entries, then priorityCount
// priority entries, then the normal queue.
const metaCount = ref(0);
const priorityCount = ref(0);
// A closed list is only marked as such; entries can still be added.
const closed = ref(false);

const peer = ref(null);
const peerId = ref(null);
const connections = ref([]);

// The peer whose share link this tab joined; kept per tab so a reload rejoins it.
let hostId = sessionStorage.getItem('hostId');
let reconnectTimer = null;
let initialized = false;

function init() {
  if (initialized) {
    return;
  }
  initialized = true;

  try {
    list.value = JSON.parse(localStorage.getItem('list')) || [];
    history.value = JSON.parse(localStorage.getItem('history')) || [];
    metaCount.value = Number(localStorage.getItem('metaCount')) || 0;
    priorityCount.value = Number(localStorage.getItem('priorityCount')) || 0;
    closed.value = localStorage.getItem('closed') === 'true';
  } catch (e) {
    console.error('Restore failed', e);
  }

  createPeer(localStorage.getItem('peerId'), 3);

  // Opening a share link in a tab that already shows the app only changes the hash.
  window.addEventListener('hashchange', connectFromHash);
}

// Reuses the stored ID so share links survive reloads. Right after a reload the
// broker may still hold the ID for the old page, so retry a few times before
// falling back to a random ID (e.g. when the app is open in a second tab).
function createPeer(id, retries) {
  const p = id ? new Peer(id) : new Peer();
  peer.value = p;

  p.on('open', (openedId) => {
    peerId.value = openedId;
    if (!localStorage.getItem('peerId')) {
      localStorage.setItem('peerId', openedId);
    }
    connectFromHash();
    connectToHost();
  });

  p.on('connection', (conn) => {
    setupConnection(conn, true);
  });

  p.on('error', (err) => {
    // The host is offline (e.g. reloading); keep trying until it is back.
    if (err.type === 'peer-unavailable') {
      scheduleReconnect();
      return;
    }

    if (err.type !== 'unavailable-id') {
      return;
    }

    p.destroy();
    if (retries > 0) {
      setTimeout(() => createPeer(id, retries - 1), 2000);
    } else {
      createPeer(null, 0);
    }
  });
}

function connectFromHash() {
  const hashId = window.location.hash.replace('#', '');
  if (!hashId || !peerId.value) {
    return;
  }

  window.history.pushState(null, null, '#');

  if (hashId !== peerId.value) {
    hostId = hashId;
    sessionStorage.setItem('hostId', hostId);
    connectToHost();
  }
}

function connectToHost() {
  if (!hostId || !peerId.value || connections.value.some(c => c.peer === hostId)) {
    return;
  }

  const conn = peer.value.connect(hostId);
  setupConnection(conn, false);
}

function scheduleReconnect() {
  if (!hostId || reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToHost();
  }, 3000);
}

// Only the peer that accepted the connection sends its state on open,
// otherwise the joining peer's (usually empty) state overwrites the host's.
function setupConnection(conn, sendStateOnOpen) {
  conn.on('open', () => {
    // A peer that reloaded comes back with the same ID; drop its stale connection.
    connections.value
      .filter(c => c.peer === conn.peer)
      .forEach(c => c.close());
    connections.value = connections.value.filter(c => c.peer !== conn.peer);

    connections.value.push(conn);
    if (sendStateOnOpen) {
      conn.send(statePayload());
    }
  });

  conn.on('data', (data) => {
    if (data.type !== 'SYNC_STATE') {
      return;
    }

    // Ignoring unchanged state stops relayed updates from looping forever.
    if (JSON.stringify(data.list) === JSON.stringify(list.value)
      && JSON.stringify(data.history) === JSON.stringify(history.value)
      && (data.metaCount ?? 0) === metaCount.value
      && (data.priorityCount ?? 0) === priorityCount.value
      && (data.closed ?? false) === closed.value) {
      return;
    }

    list.value = data.list;
    history.value = data.history;
    metaCount.value = data.metaCount ?? 0;
    priorityCount.value = data.priorityCount ?? 0;
    closed.value = data.closed ?? false;
    saveLocally();
    // Relay to the other peers so guests connected to the same host stay in sync.
    broadcastState(conn.peer);
  });

  conn.on('close', () => {
    connections.value = connections.value.filter(c => toRaw(c) !== conn);
    if (conn.peer === hostId) {
      scheduleReconnect();
    }
  });
}

function statePayload() {
  return {
    type: 'SYNC_STATE',
    list: toRaw(list.value),
    history: toRaw(history.value),
    metaCount: metaCount.value,
    priorityCount: priorityCount.value,
    closed: closed.value
  };
}

function broadcastState(exceptPeer) {
  const payload = statePayload();

  connections.value.forEach((conn) => {
    if (conn.open && conn.peer !== exceptPeer) {
      conn.send(payload);
    }
  });
}

function saveLocally() {
  localStorage.setItem('list', JSON.stringify(list.value));
  localStorage.setItem('history', JSON.stringify(history.value));
  localStorage.setItem('metaCount', String(metaCount.value));
  localStorage.setItem('priorityCount', String(priorityCount.value));
  localStorage.setItem('closed', String(closed.value));
}

function commit() {
  saveLocally();
  broadcastState();
}

// "#Name" queues Name behind earlier meta entries, "+Name" behind earlier
// meta and priority entries; both go ahead of the normal queue.
function addSpeaker(name) {
  if (name.startsWith('#') || name.startsWith('+')) {
    const isMetaEntry = name.startsWith('#');
    const priorityName = name.slice(1).trim();
    if (!priorityName) {
      return;
    }

    if (list.value.length === 0) {
      list.value.push(priorityName);
    } else if (isMetaEntry) {
      list.value.splice(1 + metaCount.value, 0, priorityName);
      metaCount.value++;
    } else {
      list.value.splice(1 + metaCount.value + priorityCount.value, 0, priorityName);
      priorityCount.value++;
    }
  } else {
    list.value.push(name);
  }

  commit();
}

function isMeta(index) {
  return index >= 1 && index <= metaCount.value;
}

function isPriority(index) {
  return index > metaCount.value && index <= metaCount.value + priorityCount.value;
}

function rowLabel(index) {
  if (isMeta(index)) {
    return '‼️ Meta';
  }
  if (isPriority(index)) {
    return '❗ Priority';
  }
  return undefined;
}

function removeSpeaker() {
  const removed = list.value.shift();
  if (removed) {
    history.value.push(removed);
    // The first meta (or else priority) entry is now speaking.
    if (metaCount.value > 0) {
      metaCount.value--;
    } else if (priorityCount.value > 0) {
      priorityCount.value--;
    }
  }

  commit();
}

// Removes a queued entry without marking it as spoken; the name stays in the suggestions.
function removeFromList(index) {
  if (isMeta(index)) {
    metaCount.value--;
  } else if (isPriority(index)) {
    priorityCount.value--;
  }

  const [removed] = list.value.splice(index, 1);
  if (removed && !history.value.includes(removed)) {
    history.value.push(removed);
  }

  commit();
}

function setClosed(value) {
  closed.value = value;
  commit();
}

function removeFromHistory(name) {
  history.value = history.value.filter(e => e !== name);
  commit();
}

export function useSpeakers() {
  init();

  return {
    list,
    history,
    peerId,
    connections,
    closed,
    addSpeaker,
    removeSpeaker,
    removeFromList,
    removeFromHistory,
    setClosed,
    rowLabel,
  };
}
