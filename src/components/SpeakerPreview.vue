<template>
  <div class="preview d-flex flex-column align-center justify-center pa-6">
    <div class="text-overline text-medium-emphasis">Speaking</div>
    <template v-if="current">
      <v-avatar class="mb-4" color="grey-lighten-1" size="160">
        <v-img :src="avatar(current)" />
      </v-avatar>
      <div class="current-name text-center">{{ current }}</div>
    </template>
    <div v-else class="text-h3 text-medium-emphasis">—</div>

    <v-divider class="my-10 w-50" />

    <div class="text-overline text-medium-emphasis">Next</div>
    <div v-if="next" class="d-flex align-center ga-4">
      <v-avatar color="grey-lighten-1" size="64">
        <v-img :src="avatar(next)" />
      </v-avatar>
      <div>
        <div class="text-h3">{{ next }}</div>
        <div v-if="rowLabel(1)" class="text-h6 text-medium-emphasis">{{ rowLabel(1) }}</div>
      </div>
    </div>
    <div v-else class="text-h4 text-medium-emphasis">—</div>

    <div v-if="closed" class="closed" title="Speaker's list is closed">🔒</div>

    <div class="peers text-caption text-medium-emphasis">
      Connected Peers: {{ connections.length }}
    </div>
  </div>
</template>

<script setup>
  import { computed } from 'vue';
  import { initials } from '@dicebear/collection';
  import { createAvatar } from '@dicebear/core';
  import { useSpeakers } from '@/composables/useSpeakers';

  const { list, connections, closed, rowLabel } = useSpeakers();

  const current = computed(() => list.value[0]);
  const next = computed(() => list.value[1]);

  function avatar(name) {
    return createAvatar(initials, { seed: name }).toDataUri();
  }
</script>

<style scoped>
  .preview {
    min-height: 100vh;
    position: relative;
  }

  .current-name {
    font-size: clamp(3rem, 10vw, 8rem);
    font-weight: 500;
    line-height: 1.1;
  }

  .closed {
    font-size: 4rem;
    position: absolute;
    right: 24px;
    top: 16px;
  }

  .peers {
    bottom: 16px;
    position: absolute;
    right: 16px;
  }
</style>
