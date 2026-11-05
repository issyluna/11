'use strict';

(function () {
  const U = window.UI;
  U.renderShell('cms');

  const state = { q: '', section: '', page: 1, pageSize: 8, total: 0 };
  const tbody = document.getElementById('cms-tbody');
  const modalRoot = document.getElementById('modal-root');

  function listQuery() {
    return new URLSearchParams({
      q: state.q, section: state.section, page: String(state.page), pageSize: String(state.pageSize)
    }).toString();
  }

  async function load() {
    tbody.innerHTML = U.skeletonRows(6);
    try {
      const [data, stats] = await Promise.all([
        U.fetchJson('/api/news?' + listQuery()),
        U.fetchJson('/api/stats')
      ]);
      state.total = data.total;
      document.getElementById('c-total').textContent = stats.news;
      document.getElementById('c-done').textContent = stats.newsVectorized;
      document.getElementById('c-pending').textContent = Math.max(0, stats.news - stats.newsVectorized);
      document.getElementById('c-updated').textContent = U.fmtDate(stats.latest);
      document.getElementById('cms-count').textContent = `共 ${data.total} 条 · 第 ${state.page} / ${Math.max(1, Math.ceil(data.total / state.pageSize))} 页`;

      if (!data.rows.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty">${U.icon('search')}<div>没有匹配的新闻</div></div></td></tr>`;
      } else {
        tbody.innerHTML = data.rows.map((n) => `
          <tr>
            <td class="cell-title">
              <b>${U.escapeHtml(n.title_zh || n.title_en)}</b>
              <small>${U.escapeHtml(n.title_en)} · <span class="mono">${U.escapeHtml(n.id)}</span></small>
            </td>
            <td>${U.sectionBadge(n.section)}</td>
            <td class="mono">${U.fmtDate(n.published_at)}</td>
            <td class="mono">${n.char_count_zh || 0} / ${n.char_count_en || 0}</td>
            <td>${n.vectorized ? '<span class="badge badge-corpus">已索引</span>' : '<span class="badge badge-term">待索引</span>'}</td>
            <td>
              <div style="display:flex;gap:6px">
                <button class="icon-btn" data-act="view" data-id="${U.escapeHtml(n.id)}" title="查看">${U.icon('external')}</button>
                <button class="icon-btn" data-act="edit" data-id="${U.escapeHtml(n.id)}" title="编辑">${U.icon('edit')}</button>
                <a class="icon-btn" href="/api/news/${encodeURIComponent(n.id)}/export" title="下载 JSON">${U.icon('download')}</a>
                <button class="icon-btn" data-act="del" data-id="${U.escapeHtml(n.id)}" title="删除" style="color:#ffb3bf">${U.icon('trash')}</button>
              </div>
            </td>
          </tr>`).join('');
        tbody.querySelectorAll('[data-act]').forEach((b) => {
          b.onclick = () => {
            const id = b.dataset.id;
            if (b.dataset.act === 'view') location.href = `/news?doc=${encodeURIComponent(id)}`;
            if (b.dataset.act === 'edit') editNews(id);
            if (b.dataset.act === 'del') confirmDelete(id);
          };
        });
      }
      const pages = Math.max(1, Math.ceil(data.total / state.pageSize));
      document.getElementById('page-info').textContent = `${state.page} / ${pages}`;
      document.getElementById('page-prev').disabled = state.page <= 1;
      document.getElementById('page-next').disabled = state.page >= pages;
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty">${U.escapeHtml(e.message)}</div></td></tr>`;
      U.toast('加载失败：' + e.message, 'err');
    }
  }

  function formHtml(n = {}) {
    const ents = n.entities || {};
    return `
      <div class="modal-backdrop open" id="form-backdrop">
        <div class="modal modal-lg">
          <div class="modal-head">
            <div>
              <h3>${n.id ? '编辑新闻' : '新建新闻'}</h3>
              <div class="tiny muted" style="margin-top:3px">${n.id ? U.escapeHtml(n.id) : '保存后自动生成 INSARAG-NEWS-MANUAL-* 标识'}</div>
            </div>
            <button class="icon-btn" id="form-close">${U.icon('close')}</button>
          </div>
          <form id="news-form">
            <div class="modal-body">
              <div class="form-grid">
                <div class="field" style="grid-column:1/-1">
                  <label>英文标题 <b>*</b></label>
                  <input class="input" name="title_en" required value="${U.escapeHtml(n.title_en || '')}" placeholder="News title in English">
                </div>
                <div class="field" style="grid-column:1/-1">
                  <label>中文标题</label>
                  <input class="input" name="title_zh" value="${U.escapeHtml(n.title_zh || '')}" placeholder="中文标题">
                </div>
                <div class="field">
                  <label>栏目</label>
                  <select class="input" name="section">
                    ${['Global News', 'Asia-Pacific News', 'AEME News', 'IEC/R News', 'Manual Entry'].map((s) => `<option ${((n.section || 'Manual Entry') === s) ? 'selected' : ''}>${s}</option>`).join('')}
                  </select>
                </div>
                <div class="field">
                  <label>发布日期</label>
                  <input class="input" type="date" name="published_at" value="${(n.published_at || '').slice(0, 10)}">
                </div>
                <div class="field">
                  <label>发布机构 / 作者</label>
                  <input class="input" name="author" value="${U.escapeHtml(n.author || 'INSARAG Secretariat')}">
                </div>
                <div class="field">
                  <label>原文链接</label>
                  <input class="input" name="url" value="${U.escapeHtml(n.url || '')}" placeholder="https://insarag.org/…">
                </div>
                <div class="field" style="grid-column:1/-1">
                  <label>中文摘要</label>
                  <textarea class="input" name="summary_zh" style="min-height:70px">${U.escapeHtml(n.summary_zh || '')}</textarea>
                </div>
                <div class="field" style="grid-column:1/-1">
                  <label>英文摘要</label>
                  <textarea class="input" name="summary_en" style="min-height:70px">${U.escapeHtml(n.summary_en || '')}</textarea>
                </div>
                <div class="field" style="grid-column:1/-1">
                  <label>中文正文 <span class="tiny muted">（空行分段）</span></label>
                  <textarea class="input" name="content_zh" style="min-height:150px">${U.escapeHtml((n.paragraphs_zh || []).join('\n\n'))}</textarea>
                </div>
                <div class="field" style="grid-column:1/-1">
                  <label>英文正文 <span class="tiny muted">（空行分段）</span></label>
                  <textarea class="input" name="content_en" style="min-height:150px">${U.escapeHtml((n.paragraphs_en || []).join('\n\n'))}</textarea>
                </div>
                <div class="field">
                  <label>标签 <span class="tiny muted">（逗号分隔）</span></label>
                  <input class="input" name="tags" value="${U.escapeHtml((n.tags || []).join(', '))}">
                </div>
                <div class="field">
                  <label>国家 / 地区 <span class="tiny muted">（逗号分隔）</span></label>
                  <input class="input" name="countries" value="${U.escapeHtml((ents.countries || []).join(', '))}">
                </div>
              </div>
            </div>
            <div class="modal-foot">
              <button type="button" class="btn btn-ghost" id="form-cancel">取消</button>
              <button type="submit" class="btn btn-primary" id="form-save">${n.id ? '保存修改' : '创建新闻'}</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  function openForm(n = {}) {
    modalRoot.innerHTML = formHtml(n);
    const close = () => { modalRoot.innerHTML = ''; };
    document.getElementById('form-close').onclick = close;
    document.getElementById('form-cancel').onclick = close;
    document.getElementById('form-backdrop').addEventListener('click', (e) => { if (e.target.id === 'form-backdrop') close(); });
    document.getElementById('news-form').onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);
      const body = {
        title_en: fd.get('title_en').trim(),
        title_zh: fd.get('title_zh').trim(),
        summary_zh: fd.get('summary_zh').trim(),
        summary_en: fd.get('summary_en').trim(),
        section: fd.get('section'),
        published_at: fd.get('published_at') ? fd.get('published_at') + 'T00:00:00+00:00' : '',
        author: fd.get('author').trim(),
        url: fd.get('url').trim(),
        paragraphs_zh: fd.get('content_zh').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
        paragraphs_en: fd.get('content_en').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
        tags: fd.get('tags').split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        entities: {
          ...(n.entities || {}),
          countries: fd.get('countries').split(/[,，]/).map((s) => s.trim()).filter(Boolean),
          regions: n.entities?.regions || [],
          organizations: n.entities?.organizations || [],
          usar_teams: n.entities?.usar_teams || [],
          themes: n.entities?.themes || []
        }
      };
      const btn = document.getElementById('form-save');
      btn.classList.add('loading');
      try {
        if (n.id) await U.fetchJson('/api/news/' + encodeURIComponent(n.id), {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        else await U.fetchJson('/api/news', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        close();
        U.toast(n.id ? '已保存，并标记为待重新向量化' : '新闻已创建，请到数据资产页执行向量化');
        load();
      } catch (err) {
        U.toast('保存失败：' + err.message, 'err');
      } finally {
        btn.classList.remove('loading');
      }
    };
  }

  async function editNews(id) {
    try {
      const n = await U.fetchJson('/api/news/' + encodeURIComponent(id));
      openForm(n);
    } catch (e) {
      U.toast('读取失败：' + e.message, 'err');
    }
  }

  function confirmDelete(id) {
    modalRoot.innerHTML = `
      <div class="modal-backdrop open" id="del-backdrop">
        <div class="modal" style="max-width:460px">
          <div class="modal-head"><h3>确认删除</h3><button class="icon-btn" id="del-close">${U.icon('close')}</button></div>
          <div class="modal-body">
            <p style="color:var(--text-2);font-size:14px">将同时删除数据库记录、对应的 JSON 文件与全部向量切片。此操作不可撤销。</p>
            <p class="mono" style="margin-top:10px;color:#ffb3bf">${U.escapeHtml(id)}</p>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" id="del-cancel">取消</button>
            <button class="btn btn-danger" id="del-ok">删除</button>
          </div>
        </div>
      </div>`;
    const close = () => { modalRoot.innerHTML = ''; };
    document.getElementById('del-close').onclick = close;
    document.getElementById('del-cancel').onclick = close;
    document.getElementById('del-backdrop').addEventListener('click', (e) => { if (e.target.id === 'del-backdrop') close(); });
    document.getElementById('del-ok').onclick = async () => {
      const btn = document.getElementById('del-ok');
      btn.classList.add('loading');
      try {
        await U.fetchJson('/api/news/' + encodeURIComponent(id), { method: 'DELETE' });
        close();
        U.toast('已删除');
        load();
      } catch (e) {
        U.toast('删除失败：' + e.message, 'err');
      }
    };
  }

  document.getElementById('btn-create').onclick = () => openForm({});
  document.getElementById('btn-refresh').onclick = () => load();
  document.getElementById('cms-search').addEventListener('input', U.debounce((e) => {
    state.q = e.target.value.trim(); state.page = 1; load();
  }, 300));
  document.getElementById('cms-section').onchange = (e) => {
    state.section = e.target.value; state.page = 1; load();
  };
  document.getElementById('page-prev').onclick = () => { if (state.page > 1) { state.page--; load(); } };
  document.getElementById('page-next').onclick = () => { state.page++; load(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modalRoot.innerHTML = ''; });

  load();
})();
