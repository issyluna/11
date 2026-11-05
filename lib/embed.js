'use strict';

// 智谱 BigModel 文本嵌入（embedding-3，1024 维）
// 文档：https://docs.bigmodel.cn/api-reference/模型-api/文本嵌入

const BASE = 'https://open.bigmodel.cn/api/paas/v4';

class EmbedError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function requestBatch(apiKey, part, model, dim, attempt = 0) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  let res;
  try {
    res = await fetch(BASE + '/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: part, dimensions: dim }),
      signal: ctrl.signal
    });
  } catch (e) {
    clearTimeout(timer);
    if (attempt < 3) {
      await sleep(2500 * (attempt + 1));
      return requestBatch(apiKey, part, model, dim, attempt + 1);
    }
    throw new EmbedError('无法连接智谱向量服务：' + (e.cause?.code || e.message), 0);
  }
  clearTimeout(timer);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 批量过大 / 触发限流时，智谱可能返回“令牌已过期”这类鉴权提示；统一做指数退避重试
    if (attempt < 4) {
      await sleep(4000 * (attempt + 1));
      return requestBatch(apiKey, part, model, dim, attempt + 1);
    }
    throw new EmbedError(`${j?.error?.message || '智谱嵌入接口错误'}（HTTP ${res.status}）`, res.status);
  }
  const sorted = [...(j.data || [])].sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

async function embed(apiKey, inputs, { model = 'embedding-3', dim = 1024 } = {}) {
  if (!inputs.length) return [];
  // embedding-3 存在单次请求总 token 上限，批量取 8；批次间留间隔以规避限流
  const BATCH = 8;
  const out = new Array(inputs.length);
  for (let i = 0; i < inputs.length; i += BATCH) {
    const part = inputs.slice(i, i + BATCH).map((t) => String(t).slice(0, 1200));
    const vectors = await requestBatch(apiKey, part, model, dim);
    vectors.forEach((v, k) => { out[i + k] = v; });
    if (i + BATCH < inputs.length) await sleep(1200);
  }
  return out;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

module.exports = { embed, cosine, EmbedError };
