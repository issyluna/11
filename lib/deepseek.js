'use strict';

// Deepseek 对话服务：支持流式（SSE）与非流式，兼容 OpenAI Chat Completions 协议

function baseUrl(cfg) {
  return (cfg.deepseek_base || 'https://api.deepseek.com').replace(/\/$/, '');
}

async function chat(cfg, { system, user, temperature = 0.2, maxTokens = 1200 }) {
  const res = await fetch(baseUrl(cfg) + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.deepseek_key}` },
    body: JSON.stringify({
      model: cfg.deepseek_model || 'deepseek-chat',
      temperature,
      max_tokens: maxTokens,
      stream: false,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user }
      ]
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Deepseek HTTP ${res.status}`);
  return { text: j.choices?.[0]?.message?.content || '', usage: j.usage || null, model: j.model };
}

/**
 * 流式生成：逐段回调 onDelta(text)
 * 返回 { full, usage, model }
 */
async function chatStream(cfg, { system, user, temperature = 0.2, maxTokens = 1600, onDelta }) {
  const res = await fetch(baseUrl(cfg) + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.deepseek_key}` },
    body: JSON.stringify({
      model: cfg.deepseek_model || 'deepseek-chat',
      temperature,
      max_tokens: maxTokens,
      stream: true,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user }
      ]
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Deepseek HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';
  let usage = null;
  let model = cfg.deepseek_model || 'deepseek-chat';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const data = s.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      if (j.model) model = j.model;
      if (j.usage) usage = j.usage;
      const delta = j.choices?.[0]?.delta?.content || '';
      if (delta) {
        full += delta;
        onDelta(delta);
      }
    }
  }
  return { full, usage, model };
}

module.exports = { chat, chatStream };
