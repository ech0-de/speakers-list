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
            🎤 Speaker's List &nbsp;📝<span v-if="closed" title="Speaker's list is closed">&nbsp;🔒</span>
          </v-card-title>

          <div class="d-flex flex-column align-start mr-4">
            <v-btn size="x-small" variant="flat" prepend-icon="mdi-link-variant" @click="copyLink('')" :disabled="!peerId">
              Copy Share Link
            </v-btn>
            <v-btn size="x-small" variant="flat" prepend-icon="mdi-presentation" @click="copyLink('preview')" :disabled="!peerId">
              Copy Preview Link
            </v-btn>
          </div>
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
  import { computed, ref, useTemplateRef } from 'vue';
  import { initials } from '@dicebear/collection';
  import { createAvatar } from '@dicebear/core';
  import { useSpeakers } from '@/composables/useSpeakers';

  const {
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
  } = useSpeakers();

  const box = useTemplateRef('box');
  const speaker = ref('');
  const showCopySnack = ref(false);

  const speakers = computed(() => [...new Set([...list.value, ...history.value])].sort());
  const svgs = computed(() => list.value.map(e => createAvatar(initials, { seed: e }).toDataUri()));

  // path is relative to the app's base, e.g. '' for this view or 'preview'.
  function copyLink(path) {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}${path}#${peerId.value}`;
    navigator.clipboard.writeText(url);
    showCopySnack.value = true;
  }

  function updateModelValue(name) {
    if (!name) {
      return;
    }

    speaker.value = '';

    if (name === '/') {
      removeSpeaker();
      return;
    }

    if (name === '/close' || name === '/open') {
      setClosed(name === '/close');
      return;
    }

    addSpeaker(name);
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
