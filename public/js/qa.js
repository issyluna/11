'use strict';

(function () {
  const U = window.UI;
  U.renderShell('qa');

  const scroll = document.getElementById('chat-scroll');
  const input = document.getElementById('question');
  const sendBtn = document.getElementById('send');
  const sourceList = document.getElementById('source-list');
  const sourceCount = document.getElementById('source-count');
  let busy = false;

  async function loadCoverage() {
    try {
      const s = await U.fetchJson('/api/stats');
      document.getElementById('coverage').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="meta-item"><span>新闻</span><b>${s.news} 条</b></div>
          <div class="meta-item"><span>术语</span><b>${s.terms} 条</b></div>
          <div class="meta-item"><span>平行语料</span><b>${s.corpus} 对</b></div>
          <div class="meta-item"><span>向量切片</span><b>${s.vectors?.chunks?.embedded || 0} 个</b></div>
        </div>`;
    } catch {
      document.getElementById('coverage').textContent = '知识库统计加载失败';
    }
  }

  function addUser(text) {
    const el = document.createElement('div');
    el.className = 'msg msg-user';
    el.innerHTML = `<div class="avatar">YOU</div><div class="msg-body"><div class="msg-name"><b>你</b></div><div class="bubble"><p>${U.escapeHtml(text)}</p></div></div>`;
    scroll.appendChild(el);
    scroll.scrollTop = scroll.scrollHeight;
  }

  function addAI() {
    const el = document.createElement('div');
    el.className = 'msg msg-ai';
    el.innerHTML = `<div class="avatar">AI</div><div class="msg-body"><div class="msg-name"><b>INSARAG 知识助手</b><span class="badge badge-news" id="ai-state">检索中…</span></div><div class="bubble typing" id="ai-bubble"><p class="muted">正在计算问题向量并检索知识库…</p></div><div class="tiny muted" id="ai-meta" style="margin-top:6px"></div></div>`;
    scroll.appendChild(el);
    scroll.scrollTop = scroll.scrollHeight;
    return el;
  }

  function renderSources(list) {
    sourceCount.textContent = list.length;
    if (!list.length) {
      sourceList.innerHTML = '<div class="empty" style="padding:30px 10px"><div class="tiny">未检索到相似度足够高的资料</div></div>';
      return;
    }
    sourceList.innerHTML = list.map((s) => {
      const pct = Math.round(s.score * 100);
      const link = s.type === 'term'
        ? `<span class="link">${U.icon('book')} 术语库 · ${U.escapeHtml(s.id)}</span>`
        : `<a class="link" href="${U.escapeHtml(s.url || '#')}" target="_blank" rel="noopener">${U.icon('external')} ${s.type === 'news' ? '打开原文' : '查看来源新闻'}</a>`;
      return `
        <div class="source-item" id="src-${s.index}" data-idx="${s.index}">
          <div class="top">
            <span class="idx">[${s.index}]</span>${U.typeBadge(s.type)}
            <span class="score">${pct}%</span>
          </div>
          <b>${U.escapeHtml(s.title)}</b>
          <p>${U.escapeHtml(s.snippet)}</p>
          <div class="score-bar"><i style="width:${pct}%"></i></div>
          ${link}
        </div>`;
    }).join('');
    sourceList.querySelectorAll('.source-item').forEach((el) => {
      el.addEventListener('click', () => highlight(el.dataset.idx));
    });
  }

  function highlight(idx) {
    const el = document.getElementById('src-' + idx);
    if (!el) return;
    el.style.borderColor = 'rgba(56,205,240,.75)';
    el.style.background = 'rgba(56,205,240,.10)';
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setTimeout(() => { el.style.borderColor = ''; el.style.background = ''; }, 1400);
  }

  function bindCitations() {
    scroll.querySelectorAll('.cite').forEach((c) => {
      c.onclick = () => highlight(c.dataset.cite);
    });
  }

  async function ask(text) {
    if (busy) return;
    const q = String(text || '').trim();
    if (!q) return;
    busy = true;
    sendBtn.classList.add('loading');
    document.getElementById('qa-status').textContent = '生成中…';
    addUser(q);
    input.value = '';
    input.style.height = 'auto';
    const aiEl = addAI();
    const bubble = aiEl.querySelector('#ai-bubble');
    const stateBadge = aiEl.querySelector('#ai-state');
    const metaEl = aiEl.querySelector('#ai-meta');
    let full = '';
    let sources = [];
    let started = Date.now();

    try {
      await U.sse('/api/qa', { question: q }, (event, data) => {
        if (event === 'sources') {
          sources = data.sources || [];
          renderSources(sources);
          stateBadge.textContent = sources.length ? `已召回 ${sources.length} 条` : '无召回';
          stateBadge.className = 'badge ' + (sources.length ? 'badge-corpus' : 'badge-term');
        }
        if (event === 'delta') {
          full += data.text || '';
          bubble.classList.add('typing');
          bubble.innerHTML = U.renderRich(full);
          bindCitations();
          scroll.scrollTop = scroll.scrollHeight;
        }
        if (event === 'done') {
          stateBadge.textContent = '回答完成';
          stateBadge.className = 'badge badge-corpus';
          metaEl.textContent = `${sources.length} 条来源 · ${data.model || 'deepseek'} · ${((data.latency_ms || (Date.now() - started)) / 1000).toFixed(1)}s`;
          document.getElementById('qa-status').textContent = '知识库：新闻 / 术语 / 平行语料';
        }
        if (event === 'error') {
          throw new Error(data.message || '生成失败');
        }
      });
    } catch (e) {
      bubble.classList.remove('typing');
      bubble.innerHTML = `<p style="color:#ffb3bf">生成失败：${U.escapeHtml(e.message)}</p>`;
      stateBadge.textContent = '出错';
      stateBadge.className = 'badge badge-term';
      U.toast('问答失败：' + e.message, 'err');
      document.getElementById('qa-status').textContent = '知识库：新闻 / 术语 / 平行语料';
    } finally {
      bubble.classList.remove('typing');
      busy = false;
      sendBtn.classList.remove('loading');
      scroll.scrollTop = scroll.scrollHeight;
    }
  }

  sendBtn.onclick = () => ask(input.value);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(150, input.scrollHeight) + 'px';
  });
  scroll.addEventListener('click', (e) => {
    const sug = e.target.closest('.suggest');
    if (sug) ask(sug.textContent);
  });
  document.getElementById('new-chat').onclick = () => location.reload();

  loadCoverage();

  const preset = new URLSearchParams(location.search).get('q');
  if (preset) {
    input.value = preset;
    setTimeout(() => ask(preset), 600);
  }
})();
