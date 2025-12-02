// Cloudflare Worker - SmartICE 后端保活
// v1.1 - 每 3 分钟 ping Render 后端，防止休眠 (从 5 分钟缩短)

const BACKEND_HEALTH_URL = 'https://inventoryentryofsmartice.onrender.com/api/voice/health';

export default {
  // 定时任务触发
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pingBackend());
  },

  // 也支持手动访问触发
  async fetch(request, env, ctx) {
    const result = await pingBackend();
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

async function pingBackend() {
  const startTime = Date.now();

  try {
    const response = await fetch(BACKEND_HEALTH_URL, {
      method: 'GET',
      headers: { 'User-Agent': 'SmartICE-KeepAlive-Worker/1.0' }
    });

    const latency = Date.now() - startTime;
    const data = await response.json();

    console.log(`[KeepAlive] Backend ping successful: ${latency}ms`);

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      latency_ms: latency,
      backend_status: data.status
    };
  } catch (error) {
    console.error(`[KeepAlive] Backend ping failed:`, error.message);

    return {
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}
