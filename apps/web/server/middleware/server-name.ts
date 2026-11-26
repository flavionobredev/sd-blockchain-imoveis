export default defineEventHandler((event) => {
  setHeader(event, 'X-Served-By', getServerName(event));
});
