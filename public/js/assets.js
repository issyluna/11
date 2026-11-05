'use strict';

(function () {
  const U = window.UI;
  U.renderShell('assets');

  const state = { files: [], selected: '', corpus: { q: '', page: 1, pageSize: 10, total: 0 }, terms: { q: '', page: 1, pageSize: 12, total: 0 } };
  let loaded = { corpus: false, terms: false, schema: false };

  const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

  function jsonHtml(obj) {
    const raw = JSON.stringify(obj, null, 2);
    return raw.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?/g, (m, str, colon, bool) => {
      if (str) {
        return colon
          ? `<span class="json-key">${U.escapeHtml(str)}</span>${colon}`
          : `<span class="json-str">${U.escapeHtml(str)}</span>`;
      }
      if (bool) return `<span class="json-bool">${m}</span>`;
      return `<span class="json-num">${m}</span>`;
    });
  }

  async function loadStats() {
    try {
      const s = await U.fetchJson('/api/stats');
      document.getElementById('a-files').textContent = s.news;
      document.getElementById('a-corpus').textContent = s.corpus;
      document.getElementById('a-terms').textContent = s.terms;
      document.getElementById('a-vec').textContent = `${s.vectors?.chunks?.embedded || 0} / ${s.vectors?.chunks?.total || 0}`;
      document.getElementById('vec-text').textContent = (s.vectors?.chunks?.embedded || 0) === (s.vectors?.chunks?.total || 0) ? '索引就绪' : '存在待索引切片';
      document.getElementById('t-files').textContent = s.news;
      document.getElementById('t-corpus').textContent = s.corpus;
      document.getElementById('t-terms').textContent = s.terms;
    } catch (e) {
      U.toast('统计数据加载失败：' + e.message, 'err');
    }
  }

  async function loadFiles() {
    try {
      const data = await U.fetchJson('/api/files');
      state.files = data.files;
      document.getElementById('files-summary').textContent = `${data.count} 个文件 · 共 ${fmtBytes(data.total_bytes)} · Schema ${data.schema_version}`;
      document.getElementById('files-tbody').innerHTML = data.files.map((f) => `
        <tr class="file-row" data-doc="${U.escapeHtml(f.doc_id)}">
          <td><b class="mono" style="color:#8fdcff">${U.escapeHtml(f.doc_id)}</b><br><small class="muted">${U.escapeHtml(f.file)}</small></td>
          <td class="cell-title"><b style="font-size:12.5px">${U.escapeHtml(f.title_zh || f.title_en)}</b><small>${U.escapeHtml((f.title_en || '').slice(0, 70))}</small></td>
          <td class="mono">${fmtBytes(f.size)}</td>
          <td>${f.translation_status === 'done' ? '<span class="badge badge-corpus">中英</span>' : '<span class="badge badge-term">待译</span>'}</td>
        </tr>`).join('');
      document.querySelectorAll('.file-row').forEach((row) => {
        row.onclick = () => selectFile(row.dataset.doc);
      });
      if (data.files[0]) selectFile(data.files[0].doc_id);
    } catch (e) {
      U.toast('文件列表加载失败：' + e.message, 'err');
    }
  }

  async function selectFile(docId) {
    state.selected = docId;
    document.querySelectorAll('.file-row').forEach((r) => r.classList.toggle('active', r.dataset.doc === docId));
    const f = state.files.find((x) => x.doc_id === docId);
    if (!f) return;
    const rec = f.raw;
    const meta = [
      ['doc_id', f.doc_id], ['schema', f.schema_version], ['文件大小', fmtBytes(f.size)], ['发布日期', U.fmtDate(f.published_at)],
      ['栏目', f.section || '—'], ['段落数', String(f.paragraphs)], ['配图', String(f.media)], ['译文状态', f.translation_status],
      ['内容指纹', (f.checksum || '').slice(0, 24) + '…'], ['原始快照', rec.provenance?.source_snapshot || '—']
    ];
    document.getElementById('preview-panel').innerHTML = `
      <div class="preview-head">
        <h3>${U.escapeHtml(f.title_zh || f.title_en)}</h3>
        <div style="display:flex;gap:6px">
          <a class="btn btn-ghost btn-sm" href="/api/news/${encodeURIComponent(f.doc_id)}/export">${U.icon('download')} JSON</a>
        </div>
      </div>
      <div class="meta-grid">
        ${meta.map(([k, v]) => `<div class="meta-item"><span>${k}</span><b>${U.escapeHtml(String(v))}</b></div>`).join('')}
      </div>
      <div class="json-view" style="max-height:460px">${jsonHtml(rec)}</div>
      <div class="tiny muted" style="margin-top:10px">路径：data/news/${U.escapeHtml(f.file)} · 来源：<a href="${U.escapeHtml(f.canonical_url)}" target="_blank" rel="noopener" style="color:#8fdcff">${U.escapeHtml(f.canonical_url)}</a></div>`;
  }

  async function loadCorpus() {
    const p = state.corpus;
    const data = await U.fetchJson(`/api/corpus?q=${encodeURIComponent(p.q)}&page=${p.page}&pageSize=${p.pageSize}`);
    p.total = data.total;
    document.getElementById('corpus-summary').textContent = `共 ${data.total} 组 1:1 句对`;
    document.getElementById('corpus-page').textContent = `${p.page} / ${Math.max(1, Math.ceil(data.total / p.pageSize))}`;
    document.getElementById('corpus-tbody').innerHTML = data.rows.map((r) => `
      <tr>
        <td class="mono" style="color:#8fdcff">${U.escapeHtml(r.pair_id)}</td>
        <td style="color:var(--text-2)">${U.escapeHtml(r.en)}</td>
        <td>${U.escapeHtml(r.zh)}</td>
        <td>${U.sectionBadge(r.section || 'Global News')}<br><small class="muted mono">${U.escapeHtml(r.doc_id || '')}</small></td>
      </tr>`).join('') || '<tr><td colspan="4"><div class="empty">无匹配语料</div></td></tr>';
  }

  async function loadTerms() {
    const p = state.terms;
    const data = await U.fetchJson(`/api/terms?q=${encodeURIComponent(p.q)}&pageSize=200`);
    p.total = data.total;
    const rows = data.rows.slice(0, 200);
    document.getElementById('term-summary').textContent = `共 ${data.total} 条术语（显示 ${rows.length} 条）`;
    document.getElementById('term-tbody').innerHTML = rows.map((t) => `
      <tr>
        <td class="mono muted">${U.escapeHtml(t.term_id)}</td>
        <td><span class="badge badge-term">${U.escapeHtml(t.abbr || '—')}</span></td>
        <td>${U.escapeHtml(t.en_full || '')}</td>
        <td><b>${U.escapeHtml(t.zh_name || '')}</b></td>
        <td class="tiny muted">${U.escapeHtml(t.note || '')}</td>
      </tr>`).join('') || '<tr><td colspan="5"><div class="empty">无匹配术语</div></td></tr>';
  }

  document.querySelectorAll('#asset-tabs .tab').forEach((t) => {
    t.onclick = async () => {
      document.querySelectorAll('#asset-tabs .tab').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelector(`.tab-panel[data-panel="${t.dataset.tab}"]`).classList.add('active');
      if (t.dataset.tab === 'corpus' && !loaded.corpus) { loaded.corpus = true; await loadCorpus(); }
      if (t.dataset.tab === 'terms' && !loaded.terms) { loaded.terms = true; await loadTerms(); }
      if (t.dataset.tab === 'schema' && !loaded.schema) {
        loaded.schema = true;
        const s = await U.fetchJson('/api/schema');
        document.getElementById('schema-view').innerHTML = jsonHtml(s);
      }
    };
  });

  document.getElementById('corpus-q').addEventListener('input', U.debounce((e) => {
    state.corpus.q = e.target.value.trim(); state.corpus.page = 1; loadCorpus();
  }, 300));
  document.getElementById('term-q').addEventListener('input', U.debounce((e) => {
    state.terms.q = e.target.value.trim(); loadTerms();
  }, 300));
  document.getElementById('corpus-prev').onclick = () => { if (state.corpus.page > 1) { state.corpus.page--; loadCorpus(); } };
  document.getElementById('corpus-next').onclick = () => {
    const max = Math.max(1, Math.ceil(state.corpus.total / state.corpus.pageSize));
    if (state.corpus.page < max) { state.corpus.page++; loadCorpus(); }
  };

  document.getElementById('btn-vectorize').onclick = async () => {
    const btn = document.getElementById('btn-vectorize');
    btn.classList.add('loading'); btn.disabled = true;
    document.getElementById('vec-text').textContent = '向量化中…';
    try {
      await U.sse('/api/vectorize', {}, (event, data) => {
        if (event === 'progress') {
          document.getElementById('vec-text').textContent = data.phase === 'staged'
            ? `切片 ${data.staged} 个…`
            : `向量化 ${data.embedded}/${data.total}`;
        }
        if (event === 'done') {
          U.toast(`向量化完成：新增 ${data.embedded} 个切片`);
        }
        if (event === 'error') throw new Error(data.message);
      });
      await loadStats();
      if (state.selected) selectFile(state.selected);
    } catch (e) {
      U.toast('向量化失败：' + e.message, 'err');
      document.getElementById('vec-text').textContent = '索引异常';
    } finally {
      btn.classList.remove('loading'); btn.disabled = false;
    }
  };

  loadStats();
  loadFiles();
})();
