export default defineEventHandler((event) => ({ serverName: getServerName(event) }));
