<script setup lang="ts">
const config = useRuntimeConfig();
const serverName = config.public.serverName;
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