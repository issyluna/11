'use strict';

(function () {
  const U = window.UI;
  U.renderShell('news');

  const state = { q: '', section: '', docId: new URLSearchParams(location.search).get('doc') || '' };
  const grid = document.getElementById('news-grid');
  const modalRoot = document.getElementById('modal-root');

  const thumb = (n) => {
    const m = (n.media || [])[0];
    if (m && m.local_path) return '/media/' + m.local_path.split('/').pop();
    return m && m.url ? m.url : '';
  };

  function renderCards(rows) {
    if (!rows.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${U.icon('search')}<div>没有找到匹配的新闻</div></div>`;
      return;
    }
    grid.innerHTML = rows.map((n) => {
      const img = thumb(n);
      return `
        <article class="card card-hover news-card" data-doc="${U.escapeHtml(n.id)}" style="cursor:pointer">
          <div class="news-thumb">
            ${img ? `<img src="${img}" alt="" loading="lazy">` : '<div style="height:100%;background:linear-gradient(135deg,#0d1e3a,#0a1424)"></div>'}
            ${U.sectionBadge(n.section)}
          </div>
          <div class="news-body">
            <div class="news-date">${U.fmtDate(n.published_at)} · ${n.char_count_en} EN chars</div>
            <h3>${U.escapeHtml(n.title_zh || n.title_en)}</h3>
            ${n.title_zh ? `<div class="tiny muted" style="margin-top:4px">${U.escapeHtml(n.title_en)}</div>` : ''}
            <p>${U.escapeHtml(n.summary_zh || n.summary_en || '')}</p>
            <div class="news-meta">
              ${(n.tags || []).slice(0, 2).map((t) => `<span class="tag">${U.escapeHtml(t)}</span>`).join('')}
              ${(n.entities?.countries || []).slice(0, 2).map((c) => `<span class="tag">${U.escapeHtml(c)}</span>`).join('')}
            </div>
            <span class="news-link">查看元数据与双语全文 ${U.icon('arrow')}</span>
          </div>
        </article>`;
    }).join('');
    grid.querySelectorAll('[data-doc]').forEach((el) => {
      el.addEventListener('click', () => openDetail(el.getAttribute('data-doc')));
    });
  }

  async function load() {
    grid.innerHTML = Array.from({ length: 6 }, () => '<div class="card card-pad"><div class="skeleton" style="height:230px"></div></div>').join('');
    try {
      const params = new URLSearchParams({ q: state.q, section: state.section, pageSize: '50' });
      const data = await U.fetchJson('/api/news?' + params.toString());
      renderCards(data.rows);
      document.getElementById('n-total').textContent = data.total;
      document.getElementById('n-vector').textContent = data.rows.filter((r) => r.vectorized).length;
      document.getElementById('n-bilingual').textContent = data.rows.filter((r) => r.char_count_zh > 0).length;
      document.getElementById('n-chars').textContent = U.fmtNum(data.rows.reduce((s, r) => s + (r.char_count_zh || 0), 0));
    } catch (e) {
      U.toast('加载失败：' + e.message, 'err');
    }
  }

  async function openDetail(id) {
    modalRoot.innerHTML = '<div class="modal-backdrop open"><div class="modal modal-lg"><div class="modal-body"><div class="skeleton" style="height:320px"></div></div></div></div>';
    try {
      const n = await U.fetchJson('/api/news/' + encodeURIComponent(id));
      renderDetail(n);
    } catch (e) {
      modalRoot.innerHTML = '';
      U.toast('加载详情失败：' + e.message, 'err');
    }
  }

  function renderDetail(n) {
    const media = (n.media || []).filter((m) => m.local_path);
    const ents = n.entities || {};
    const parasZh = n.paragraphs_zh || [];
    const parasEn = n.paragraphs_en || [];
    const meta = [
      ['文档 ID', n.id], ['发布日期', U.fmtDate(n.published_at)], ['栏目', n.section], ['发布机构', n.author],
      ['英文正文', n.char_count_en + ' 字符'], ['中文正文', n.char_count_zh + ' 字符'], ['内容指纹', (n.checksum || '').slice(0, 16) + '…'],
      ['JSON 文件', n.file_name || '—'], ['向量切片', (n.chunks || []).length + ' 个'], ['向量状态', n.vectorized ? '已索引' : '待索引']
    ];
    const tab = (key, label, count) => `<button class="tab ${key === 'zh' ? 'active' : ''}" data-tab="${key}">${label}${count !== undefined ? `<span class="n">${count}</span>` : ''}</button>`;
    modalRoot.innerHTML = `
      <div class="modal-backdrop open" id="detail-backdrop">
        <div class="modal modal-lg">
          <div class="modal-head">
            <div>
              <div class="chip-row" style="margin-bottom:8px">${U.sectionBadge(n.section)}<span class="badge badge-muted">${U.escapeHtml(n.id)}</span>${n.vectorized ? '<span class="badge badge-corpus">已向量化</span>' : ''}</div>
              <h3 style="font-size:20px;line-height:1.4">${U.escapeHtml(n.title_zh || n.title_en)}</h3>
              ${n.title_zh ? `<div class="tiny muted" style="margin-top:4px">${U.escapeHtml(n.title_en)}</div>` : ''}
            </div>
            <button class="icon-btn" id="modal-close">${U.icon('close')}</button>
          </div>
          <div class="modal-body">
            ${media.length ? `<div style="display:grid;grid-template-columns:repeat(${Math.min(media.length, 3)},1fr);gap:8px;margin-bottom:20px">${media.map((m) => `<img src="/media/${m.local_path.split('/').pop()}" style="width:100%;height:150px;object-fit:cover;border-radius:10px;border:1px solid var(--line)" alt="">`).join('')}</div>` : ''}
            <div class="tabs">
              ${tab('zh', '中文译文', parasZh.length)}${tab('en', 'English', parasEn.length)}${tab('meta', '元数据')}
            </div>
            <div class="tab-panel active" data-panel="zh">
              ${parasZh.length ? parasZh.map((p) => `<p style="margin-bottom:14px;line-height:1.95">${U.escapeHtml(p)}</p>`).join('') : '<div class="empty">暂无中文译文</div>'}
            </div>
            <div class="tab-panel" data-panel="en">
              ${parasEn.map((p) => `<p style="margin-bottom:14px;line-height:1.9;color:var(--text-2)">${U.escapeHtml(p)}</p>`).join('')}
            </div>
            <div class="tab-panel" data-panel="meta">
              <div class="meta-grid">
                ${meta.map(([k, v]) => `<div class="meta-item"><span>${k}</span><b>${U.escapeHtml(String(v))}</b></div>`).join('')}
              </div>
              <div class="field" style="margin-top:4px">
                <label>实体抽取</label>
                <div class="chip-row">
                  ${[...(ents.countries || []).map((x) => ['国家', x]), ...(ents.regions || []).map((x) => ['区域', x]), ...(ents.organizations || []).map((x) => ['组织', x]), ...(ents.usar_teams || []).map((x) => ['队伍', x])].map(([t, v]) => `<span class="tag">${t} · ${U.escapeHtml(v)}</span>`).join('') || '<span class="muted tiny">无</span>'}
                </div>
              </div>
              <div class="field" style="margin-top:16px">
                <label>标签</label>
                <div class="chip-row">${(n.tags || []).map((t) => `<span class="tag">${U.escapeHtml(t)}</span>`).join('') || '<span class="muted tiny">无</span>'}</div>
              </div>
              <div class="field" style="margin-top:16px">
                <label>原文链接与数据导出</label>
                <div class="chip-row">
                  <a class="btn btn-ghost btn-sm" href="${U.escapeHtml(n.url)}" target="_blank" rel="noopener">${U.icon('external')} 访问 insarag.org</a>
                  <a class="btn btn-ghost btn-sm" href="/api/news/${encodeURIComponent(n.id)}/export">${U.icon('download')} 下载 JSON</a>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-foot">
            <a class="btn btn-ghost btn-sm" href="/qa">在问答中提问</a>
            <button class="btn btn-primary btn-sm" id="modal-ok">关闭</button>
          </div>
        </div>
      </div>`;

    const close = () => { modalRoot.innerHTML = ''; };
    document.getElementById('modal-close').onclick = close;
    document.getElementById('modal-ok').onclick = close;
    document.getElementById('detail-backdrop').addEventListener('click', (e) => { if (e.target.id === 'detail-backdrop') close(); });
    document.querySelectorAll('#modal-root .tab').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('#modal-root .tab').forEach((x) => x.classList.remove('active'));
        document.querySelectorAll('#modal-root .tab-panel').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        document.querySelector(`#modal-root .tab-panel[data-panel="${b.dataset.tab}"]`).classList.add('active');
      };
    });
  }

  document.getElementById('search').addEventListener('input', U.debounce((e) => {
    state.q = e.target.value.trim();
    load();
  }, 280));
  document.querySelectorAll('#section-chips .chip').forEach((c) => {
    c.onclick = () => {
      document.querySelectorAll('#section-chips .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      state.section = c.dataset.section;
      load();
    };
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modalRoot.innerHTML = ''; });

  load();
  if (state.docId) openDetail(state.docId);
})();
