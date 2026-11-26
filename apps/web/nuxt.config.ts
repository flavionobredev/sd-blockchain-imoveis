// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  // Valores padrão; sobrescritos em runtime pelas envs NUXT_* (não pelo build):
  //   serverName         <- NUXT_SERVER_NAME
  //   nodeCoordinatorUrl <- NUXT_NODE_COORDINATOR_URL
  runtimeConfig: {
    serverName: 'WEB-LOCAL',
    nodeCoordinatorUrl: 'http://node-coordinator:3000',
  },
  nitro: {
    preset: 'node-server',
  },
});
