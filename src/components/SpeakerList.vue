<template>
  <v-dialog :model-value="true" max-width="500" height="90vh" persistent :fullscreen="$vuetify.display.mobile" scrollable>
    <v-card variant="flat">
      <v-card-title class="text-h4 text-center">
        🎤 Speaker's List &nbsp;📝
      </v-card-title>

      <v-card-text>
        <v-list>
          <template v-for="(item, i) in list" :key="i">
            <v-divider v-if="i === 1" class="my-2" />
            <v-list-item :title="item">
              <template v-slot:prepend>
                <v-avatar color="grey-lighten-1">
                  <v-img :src="svgs[i]" />
                </v-avatar>
              </template>

              <template #append v-if="i === 0">
                <v-btn color="grey-lighten-1" icon="mdi-check-decagram" @click="removeSpeaker" />
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-card-text>

      <v-card-actions>
        <v-combobox v-model="speaker" variant="solo-filled" label="Speaker Name" chips autocomplete="off" ref="box"
          :items="speakers" class="mx-4" clearable @update:model-value="updateModelValue" @update:menu="scrollIntoView">
          <template #chip></template>
          <template #item="{ props, item }">
            <v-list-item @click="props.onClick">
              <v-chip :text="item.title" variant="flat" label />
              <template #append>
                <v-btn icon="mdi-delete" size="small" variant="text"
                  @click.stop.prevent="removeFromHistory(item.title)" />
              </template>
            </v-list-item>
          </template>
        </v-combobox>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
  import { useTemplateRef } from 'vue';
  import { createAvatar } from '@dicebear/core';
  import { initials } from '@dicebear/collection';

  const box = useTemplateRef('box');

  const list = ref([]);
  const history = ref([]);

  const speakers = computed(() => [...new Set([...list.value, ...history.value])].sort());
  const speaker = ref('');

  const svgs = computed(() => list.value.map(e => createAvatar(initials, { seed: e }).toDataUri()));
  
  try {
    const restored = JSON.parse(localStorage.getItem('list'));
    list.value.push(...restored.filter(e => e));
  } catch {
    // ignore
  }

  try {
    const restored = JSON.parse(localStorage.getItem('history'));
    history.value.push(...restored.filter(e => e));
  } catch {
    // ignore
  }

  function updateModelValue(name) {
    list.value.push(name);
    localStorage.setItem('list', JSON.stringify(list.value));
    speaker.value = '';
  }

  function removeSpeaker() {
    history.value.push(list.value.shift());
    localStorage.setItem('list', JSON.stringify(list.value));
    localStorage.setItem('history', JSON.stringify(history.value));
  }

  function removeFromHistory(name) {
    history.value = history.value.filter(e => e !== name);
    localStorage.setItem('history', JSON.stringify(history.value));
  }

  function scrollIntoView() {
    setTimeout(() => {
      box?.value?.$el?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    }, 100);
  }
</script>
