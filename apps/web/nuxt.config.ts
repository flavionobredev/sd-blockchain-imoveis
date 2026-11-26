// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    nodeCoordinatorUrl: process.env.NODE_COORDINATOR_URL ?? 'http://node-coordinator:3000',
    public: {
      serverName: process.env.NUXT_SERVER_NAME ?? 'WEB-LOCAL',
    },
  },
  nitro: {
    preset: 'node-server',
  },
});