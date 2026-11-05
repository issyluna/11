'use strict';

(function () {
  const U = window.UI;
  U.renderShell('database');

  let data = null;
  let active = 'news';

  const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

  function table() {
    return data?.tables.find((t) => t.name === active) || data?.tables[0];
  }

  function renderList() {
    document.getElementById('db-table-list').innerHTML = data.tables.map((t) => `
      <button class="db-table-btn ${t.name === active ? 'active' : ''}" data-table="${U.escapeHtml(t.name)}">
        <span class="n">${U.fmtNum(t.count)}</span>
        <b>${U.escapeHtml(t.name)}</b>
        <span>${U.escapeHtml(t.label)}</span>
      </button>`).join('');
    document.querySelectorAll('.db-table-btn').forEach((btn) => {
      btn.onclick = () => {
        active = btn.dataset.table;
        renderList();
        renderDetail();
      };
    });
  }

  function renderDetail() {
    const t = table();
    if (!t) return;
    document.getElementById('db-title').textContent = `${t.name} · ${t.label}`;
    document.getElementById('db-subtitle').innerHTML = `${U.fmtNum(t.count)} 行 · ${t.fields.length} 个字段 · 库文件 ${fmtBytes(data.file_size)}`;
    document.getElementById('db-count').textContent = `${U.fmtNum(t.count)} 行`;

    document.getElementById('db-fields').innerHTML = t.fields.map((f) => `
      <tr>
        <td class="mono" style="color:#8fdcff">${U.escapeHtml(f.name)}</td>
        <td class="field-type">${U.escapeHtml(f.type || '—')}</td>
        <td class="tiny muted">${U.escapeHtml(f.constraint || '—')}</td>
        <td>${U.escapeHtml(f.desc || '')}</td>
      </tr>`).join('');

    const ddl = (t.ddl || '').trim() || '-- 暂无建表语句';
    document.getElementById('db-ddl').innerHTML = U.escapeHtml(ddl)
      .replace(/\b(CREATE|TABLE|IF|NOT|EXISTS|PRIMARY|KEY|UNIQUE|DEFAULT|AUTOINCREMENT|TEXT|INTEGER)\b/g, '<span class="json-key">$1</span>')
      .replace(/(--.*)$/gm, '<span class="muted">$1</span>');

    document.getElementById('db-indexes').innerHTML = data.indexes.map((i) => `
      <tr>
        <td class="mono" style="color:#8fdcff">${U.escapeHtml(i.name)}</td>
        <td class="mono">${U.escapeHtml(i.field)}</td>
        <td>${i.unique ? '<span class="badge badge-term">唯一</span>' : '<span class="badge badge-muted">普通</span>'}</td>
      </tr>`).join('');

    const v = data.vector || {};
    const c = v.chunks || {};
    const byType = Array.isArray(v.byType) ? v.byType : [];
    const typeLabel = { news: '新闻切片', corpus: '语料切片', term: '术语切片' };
    document.getElementById('db-vector').innerHTML = `
      <div class="meta-item"><span>向量模型</span><b>${U.escapeHtml(v.model || 'embedding-3')}</b></div>
      <div class="meta-item"><span>向量维度</span><b>${U.escapeHtml(String(v.dim || 1024))}</b></div>
      <div class="meta-item"><span>切片总数</span><b>${U.fmtNum(c.total || 0)}</b></div>
      <div class="meta-item"><span>已嵌入</span><b>${U.fmtNum(c.embedded || 0)}</b></div>
      ${byType.map((x) => `<div class="meta-item"><span>${U.escapeHtml(typeLabel[x.source_type] || x.source_type)}</span><b>${U.fmtNum(x.embedded || 0)} / ${U.fmtNum(x.total || 0)}</b></div>`).join('')}
      <div class="meta-item"><span>覆盖率</span><b>${c.total ? Math.round((c.embedded / c.total) * 100) : 0}%</b></div>`;
  }

  function renderSummary() {
    const rows = data.tables.reduce((s, t) => s + t.count, 0);
    const c = data.vector?.chunks || {};
    document.getElementById('d-tables').textContent = data.tables.length;
    document.getElementById('d-rows').textContent = U.fmtNum(rows);
    document.getElementById('d-size').textContent = fmtBytes(data.file_size);
    document.getElementById('d-vec').textContent = c.total ? `${Math.round((c.embedded / c.total) * 100)}%` : '0%';

    document.getElementById('db-relations').innerHTML = data.relations.map((r) => `
      <div class="relation-row">
        <span class="mono">${U.escapeHtml(r.from)}</span>
        <span style="color:var(--muted)">→</span>
        <span class="mono">${U.escapeHtml(r.to)}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--muted)">${U.escapeHtml(r.type)}</span>
      </div>`).join('');
  }

  document.querySelectorAll('#db-tabs .tab').forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll('#db-tabs .tab').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelector(`.tab-panel[data-panel="${t.dataset.tab}"]`).classList.add('active');
    };
  });

  async function load() {
    try {
      data = await U.fetchJson('/api/database');
      renderSummary();
      renderList();
      renderDetail();
    } catch (e) {
      U.toast('数据库信息加载失败：' + e.message, 'err');
    }
  }

  load();
})();
