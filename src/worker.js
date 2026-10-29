export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/health') {
      return Response.json({
        app: 'r5r5 Bank',
        mode: 'ui-preview',
        integrations: { model: 'not-configured', guard: 'not-configured', scanner: 'not-configured' },
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Live integrations are not configured in this UI preview.' }, { status: 503 });
    }
    return env.ASSETS.fetch(request);
  },
};
