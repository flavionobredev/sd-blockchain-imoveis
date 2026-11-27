// The X-Served-By header is set by the server-name middleware.
export default defineEventHandler(() => ({ status: 'ok' }));
