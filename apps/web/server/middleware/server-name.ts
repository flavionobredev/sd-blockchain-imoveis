export default defineEventHandler((event) => {
  const serverName = process.env.NUXT_SERVER_NAME ?? 'unknown';
  setHeader(event, 'X-Served-By', serverName);
});