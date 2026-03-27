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
            <v-list-item :title="item">
              <template #prepend>
                <v-avatar color="grey-lighten-1">
                  <v-img :src="svgs[i]" />
                </v-avatar>
              </template>

              <template v-if="i === 0" #append>
                <v-btn color="grey-lighten-1" icon="mdi-check-decagram" @click="removeSpeaker" />
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
  import { computed, onMounted, ref, useTemplateRef } from 'vue';
  import { initials } from '@dicebear/collection';
  import { createAvatar } from '@dicebear/core';
  import { Peer } from 'peerjs';

  const box = useTemplateRef('box');
  const speaker = ref('');
  const history = ref([]);
  const list = ref([]);

  const peer = ref(null);
  const peerId = ref(null);
  const connections = ref([]);
  const showCopySnack = ref(false);

  const speakers = computed(() => [...new Set([...list.value, ...history.value])].sort());
  const svgs = computed(() => list.value.map(e => createAvatar(initials, { seed: e }).toDataUri()));

  onMounted(() => {
    try {
      list.value = JSON.parse(localStorage.getItem('list')) || [];
      history.value = JSON.parse(localStorage.getItem('history')) || [];
    } catch (e) {
      console.error('Restore failed', e);
    }

    peer.value = new Peer();

    peer.value.on('open', (id) => {
      peerId.value = id;

      const hashId = window.location.hash.replace('#', '');
      if (hashId) {
        history.pushState(null, null, '#');

        const conn = peer.value.connect(hashId);
        setupConnection(conn);
      }
    });

    peer.value.on('connection', (conn) => {
      setupConnection(conn);
    });
  });

  function setupConnection(conn) {
    conn.on('open', () => {
      if (connections.value.find(c => c.peer === conn.peer)) {
        return;
      }

      connections.value.push(conn);
      broadcastState();
    });

    conn.on('data', (data) => {
      if (data.type === 'SYNC_STATE') {
        list.value = data.list;
        history.value = data.history;
        saveLocally();
      }
    });

    conn.on('close', () => {
      connections.value = connections.value.filter(c => c.peer !== conn.peer);
    });
  }

  function broadcastState() {
    const payload = {
      type: 'SYNC_STATE',
      list: list.value,
      history: history.value
    };

    connections.value.forEach((conn) => {
      if (conn.open) {
        conn.send(payload);
      }
    });
  }

  function saveLocally() {
    localStorage.setItem('list', JSON.stringify(list.value));
    localStorage.setItem('history', JSON.stringify(history.value));
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

    list.value.push(name);
    speaker.value = '';
    saveLocally();
    broadcastState();
  }

  function removeSpeaker() {
    const removed = list.value.shift();
    if (removed) {
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
