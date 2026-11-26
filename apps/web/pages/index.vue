<script setup lang="ts">
// Buscado no servidor durante o SSR: mostra a instância que renderizou a página.
const { data } = await useFetch('/api/instance');
const serverName = computed(() => data.value?.serverName ?? '—');
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
    <h1 class="text-2xl font-semibold">
      Cluster de Alta Disponibilidade — Blockchain Imóveis
    </h1>
    <p class="text-muted">
      Esqueleto da spec 001 (sem lógica de negócio).
    </p>
    <UBadge color="primary" variant="subtle">
      Instância: {{ serverName }}
    </UBadge>
  </div>
</template>
