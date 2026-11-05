'use strict';

/* 全局 UI 工具：导航外壳、图标、SSE、Markdown 轻渲染、Toast */

const ICONS = {
  news: '<path d="M4 5h13a2 2 0 0 1 2 2v12a2 2 0 0 0 2-2V7"/><path d="M4 5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h13"/><path d="M6 9h9M6 13h9M6 17h6"/>',
  cms: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 14h8M8 17h5"/>',
  qa: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-4.5A8 8 0 1 1 21 12Z"/><path d="M9 10h6M9 13h4"/>',
  translate: '<path d="M4 5h8M8 5v2c0 4-2 7-5 8"/><path d="M6 10c1.5 2.5 3.5 4 6 4.5"/><path d="M13 20l4-10 4 10M15 16h4"/>',
  assets: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  external: '<path d="M14 4h6v6M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  download: '<path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 19h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V3h8v3M6 6l1 14h10l1-14"/><path d="M10 10v7M14 10v7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9S14.5 19.5 12 21c-2.5-1.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h7v18H6a2 2 0 0 1-2-2Z"/><path d="M13 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
  play: '<path d="M7 4l13 8-13 8Z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  file: '<path d="M6 2h8l4 4v16H6Z"/><path d="M14 2v5h5"/>'
};

function icon(name, cls = '') {
  const p = ICONS[name] || ICONS.info;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

const NAV = [
  ['/', '首页', 'home'],
  ['/news', '新闻库', 'news'],
  ['/cms', '内容管理', 'cms'],
  ['/qa', '智能问答', 'qa'],
  ['/translate', '多语翻译', 'translate'],
  ['/assets', '数据资产', 'assets'],
  ['/database', '数据库', 'database']
];

function renderShell(active) {
  const header = document.getElementById('app-header');
  if (header) {
    header.innerHTML = `
      <header class="site-header">
        <div class="header-inner">
          <a class="brand" href="/">
            <span class="brand-mark">${icon('globe')}</span>
            <span class="brand-text"><b>INSARAG</b><small>Knowledge & Language Hub</small></span>
          </a>
          <nav class="nav" id="main-nav">
            ${NAV.map(([href, label, key]) => `<a href="${href}" class="${key === active ? 'active' : ''}">${label}</a>`).join('')}
          </nav>
          <div class="header-actions">
            <span class="status-pill"><i></i> RAG 就绪</span>
            <button class="menu-btn" id="menu-btn" aria-label="菜单">${icon('layers')}</button>
          </div>
        </div>
      </header>`;
    const btn = document.getElementById('menu-btn');
    btn?.addEventListener('click', () => document.getElementById('main-nav')?.classList.toggle('open'));
  }
  const footer = document.getElementById('app-footer');
  if (footer) {
    footer.innerHTML = `
      <footer class="site-footer">
        <div class="footer-inner">
          <div class="footer-brand">
            <div class="brand">
              <span class="brand-mark">${icon('globe')}</span>
              <span class="brand-text"><b>INSARAG</b><small>Knowledge & Language Hub</small></span>
            </div>
            <p>面向国际搜索与救援领域的知识基础设施：新闻采集与结构化、术语与平行语料库、向量检索增强问答、东盟多语种智能翻译。</p>
          </div>
          <div class="footer-col">
            <h4>数据来源</h4>
            <a href="https://insarag.org/" target="_blank" rel="noopener">INSARAG 官方网站</a>
            <a href="https://insarag.org/global-structures/global-news/" target="_blank" rel="noopener">Global News 栏目</a>
            <span>《INSARAG 国际搜索与救援指南》</span>
            <span>术语表（中文版）</span>
          </div>
          <div class="footer-col">
            <h4>技术栈</h4>
            <span>Node.js · SQLite · PM2</span>
            <span>智谱 embedding-3（1024 维）</span>
            <span>Deepseek Chat（流式生成）</span>
            <span>零依赖前端 · 原生 SSE</span>
          </div>
        </div>
        <div class="footer-bottom">INSARAG Knowledge & Language Hub · 教学演示项目 · 内容版权归原作者与 INSARAG/OCHA 所有</div>
      </footer>`;
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 10);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('zh-CN');
}

function sectionBadge(section) {
  const map = {
    'Global News': 'badge-news',
    'Asia-Pacific News': 'badge-corpus',
    'AEME News': 'badge-term',
    'IEC/R News': 'badge-muted'
  };
  return `<span class="badge ${map[section] || 'badge-muted'}">${escapeHtml(section || 'INSARAG')}</span>`;
}

function typeBadge(type) {
  const map = {
    news: ['badge-news', '新闻'],
    term: ['badge-term', '术语'],
    corpus: ['badge-corpus', '平行语料']
  };
  const [cls, label] = map[type] || ['badge-muted', type];
  return `<span class="badge ${cls}">${label}</span>`;
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** POST + SSE 流式读取 */
async function sse(url, body, onEvent, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      let data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      let parsed = null;
      try { parsed = JSON.parse(data); } catch { continue; }
      onEvent(event, parsed);
    }
  }
}

/** 轻量 Markdown：段落、列表、加粗、引用角标 */
function renderRich(text) {
  const safe = escapeHtml(text);
  const lines = safe.split('\n');
  const out = [];
  let list = [];
  let para = [];
  const flushPara = () => {
    if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; }
  };
  const flushList = () => {
    if (list.length) { out.push(`<ul>${list.map((li) => `<li>${li}</li>`).join('')}</ul>`); list = []; }
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { flushPara(); flushList(); continue; }
    const li = /^[-*]\s+(.*)$/.exec(t) || /^\d+[.、]\s+(.*)$/.exec(t);
    if (li) { flushPara(); list.push(inline(li[1])); continue; }
    flushList();
    if (/^#{1,4}\s+/.test(t)) { flushPara(); out.push(`<p><strong>${inline(t.replace(/^#{1,4}\s+/, ''))}</strong></p>`); continue; }
    para.push(inline(t));
  }
  flushPara();
  flushList();
  return out.join('');
}

function inline(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(\d{1,2})\]/g, '<span class="cite" data-cite="$1">$1</span>');
}

function toast(msg, type = 'ok') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="dot"></span><span>${escapeHtml(msg)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(14px)'; el.style.transition = '0.3s'; setTimeout(() => el.remove(), 320); }, 3600);
}

function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function countUp(el, target, duration = 900) {
  const start = performance.now();
  const from = 0;
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (target - from) * eased).toLocaleString('zh-CN');
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function skeletonRows(n = 5) {
  return Array.from({ length: n }, () => `<tr><td colspan="6"><div class="skeleton" style="height:16px;width:${60 + Math.random() * 30}%"></div></td></tr>`).join('');
}

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.getAttribute('data-icon'));
    el.removeAttribute('data-icon');
  });
}

window.UI = {
  icon, renderShell, hydrateIcons, escapeHtml, fmtDate, fmtNum, sectionBadge, typeBadge,
  fetchJson, sse, renderRich, toast, debounce, countUp, skeletonRows, ICONS
};

document.addEventListener('DOMContentLoaded', () => hydrateIcons());
