<template>
  <v-dialog
    :fullscreen="$vuetify.display.mobile"
    height="90vh"
    max-width="800"
    :model-value="true"
    persistent
    scrollable
  >
    <v-card variant="flat">
      <div>
        <div class="d-flex align-center justify-space-between">
          <div class="mx-4 mt-2">
            <v-alert
                class="text-caption"
                density="compact"
                color="info"
                variant="tonal"
              >
                Status: <strong>Online</strong><br>
                Connected Peers: {{ connections.length }}
            </v-alert>
          </div>

          <v-card-title class="text-h4 text-center flex-grow-1">
            🎤 Speaker's List &nbsp;📝
          </v-card-title>

          <v-btn class="mr-4" size="x-small" variant="flat" prepend-icon="mdi-link-variant" @click="copyShareLink" :disabled="!peerId">
            Copy Share Link
          </v-btn>
        </div>
      </div>

      <v-card-text>
        <v-list>
          <template v-for="(item, i) in list" :key="i">
            <v-divider v-if="i === 1" class="my-2" />
            <v-list-item
              class="speaker-row"
              :subtitle="rowLabel(i)"
              :title="item"
            >
              <template #prepend>
                <v-avatar color="grey-lighten-1">
                  <v-img :src="svgs[i]" />
                </v-avatar>
              </template>

              <template #append>
                <v-btn v-if="i === 0" color="grey-lighten-1" icon="mdi-check-decagram" @click="removeSpeaker" />
                <v-btn
                  v-else
                  class="remove-btn"
                  icon="mdi-close"
                  size="small"
                  variant="text"
                  @click="removeFromList(i)"
                />
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-card-text>

      <v-card-actions>
        <v-combobox
          ref="box"
          v-model="speaker"
          autofocus
          autocomplete="off"
          chips
          class="mx-4"
          clearable
          :items="speakers"
          label="Speaker Name"
          :menu-props="{ maxHeight: 3 * 48 + 16 }"
          variant="solo-filled"
          @update:menu="scrollIntoView"
          @update:model-value="updateModelValue"
          @update:focused="$refs.box.focus()"
        >
          <template #chip />
          <template #item="{ props, item }">
            <v-list-item @click="props.onClick">
              <v-chip label :text="item.title" variant="flat" />
              <template #append v-if="!list.includes(item.title)">
                <v-btn
                  icon="mdi-delete"
                  size="small"
                  variant="text"
                  @click.stop.prevent="removeFromHistory(item.title)"
                />
              </template>
            </v-list-item>
          </template>
        </v-combobox>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar v-model="showCopySnack" timeout="2000">Link copied to clipboard!</v-snackbar>
</template>

<script setup>
  import { computed, onMounted, ref, toRaw, useTemplateRef } from 'vue';
  import { initials } from '@dicebear/collection';
  import { createAvatar } from '@dicebear/core';
  import { Peer } from 'peerjs';

  const box = useTemplateRef('box');
  const speaker = ref('');
  const history = ref([]);
  const list = ref([]);
  // The current speaker is followed by metaCount meta entries, then priorityCount
  // priority entries, then the normal queue.
  const metaCount = ref(0);
  const priorityCount = ref(0);

  const peer = ref(null);
  const peerId = ref(null);
  const connections = ref([]);
  const showCopySnack = ref(false);

  // The peer whose share link this tab joined; kept per tab so a reload rejoins it.
  let hostId = sessionStorage.getItem('hostId');
  let reconnectTimer = null;

  const speakers = computed(() => [...new Set([...list.value, ...history.value])].sort());
  const svgs = computed(() => list.value.map(e => createAvatar(initials, { seed: e }).toDataUri()));

  onMounted(() => {
    try {
      list.value = JSON.parse(localStorage.getItem('list')) || [];
      history.value = JSON.parse(localStorage.getItem('history')) || [];
      metaCount.value = Number(localStorage.getItem('metaCount')) || 0;
      priorityCount.value = Number(localStorage.getItem('priorityCount')) || 0;
    } catch (e) {
      console.error('Restore failed', e);
    }

    createPeer(localStorage.getItem('peerId'), 3);

    // Opening a share link in a tab that already shows the app only changes the hash.
    window.addEventListener('hashchange', connectFromHash);
  });

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
        && (data.priorityCount ?? 0) === priorityCount.value) {
        return;
      }

      list.value = data.list;
      history.value = data.history;
      metaCount.value = data.metaCount ?? 0;
      priorityCount.value = data.priorityCount ?? 0;
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
      priorityCount: priorityCount.value
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
  }

  function copyShareLink() {
    const url = `${window.location.origin}${window.location.pathname}#${peerId.value}`;
    navigator.clipboard.writeText(url);
    showCopySnack.value = true;
  }

  function updateModelValue(name) {
    if (!name) {
      return;
    }

    if (name === '/') {
      speaker.value = '';
      removeSpeaker();
      return;
    }

    speaker.value = '';

    // "#Name" queues Name behind earlier meta entries, "+Name" behind earlier
    // meta and priority entries; both go ahead of the normal queue.
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

    saveLocally();
    broadcastState();
  }

  function rowLabel(index) {
    if (isMeta(index)) {
      return 'Meta';
    }
    if (isPriority(index)) {
      return 'Priority';
    }
    return undefined;
  }

  function isMeta(index) {
    return index >= 1 && index <= metaCount.value;
  }

  function isPriority(index) {
    return index > metaCount.value && index <= metaCount.value + priorityCount.value;
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

    saveLocally();
    broadcastState();
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

    saveLocally();
    broadcastState();
  }

  function removeFromHistory(name) {
    history.value = history.value.filter(e => e !== name);
    saveLocally();
    broadcastState();
  }

  function scrollIntoView() {
    setTimeout(() => {
      box?.value?.$el?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    }, 100);
  }
</script>

<style scoped>
  /* Touch devices have no hover, so the button stays visible there. */
  @media (hover: hover) {
    .speaker-row .remove-btn {
      opacity: 0;
    }

    .speaker-row:hover .remove-btn,
    .speaker-row .remove-btn:focus-visible {
      opacity: 1;
    }
  }
</style>
