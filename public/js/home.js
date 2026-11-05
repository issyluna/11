'use strict';

(function () {
  const U = window.UI;
  U.renderShell('home');

  const thumb = (n) => {
    const m = (n.media || [])[0];
    if (m && m.local_path) return '/media/' + m.local_path.split('/').pop();
    if (m && m.url) return m.url;
    return '';
  };

  async function load() {
    try {
      const stats = await U.fetchJson('/api/stats');
      const news = stats.news;
      const terms = stats.terms;
      const corpus = stats.corpus;
      const vectors = stats.vectors?.chunks?.embedded || 0;

      U.countUp(document.getElementById('stat-news'), news);
      U.countUp(document.getElementById('stat-terms'), terms);
      U.countUp(document.getElementById('stat-corpus'), corpus);
      U.countUp(document.getElementById('stat-vectors'), vectors);
      document.getElementById('cap-news').textContent = news;
      document.getElementById('cap-terms').textContent = terms;
      document.getElementById('cap-corpus').textContent = corpus;

      const latest = await U.fetchJson('/api/news?pageSize=6');
      const grid = document.getElementById('latest-news');
      if (!latest.rows.length) {
        grid.innerHTML = '<div class="empty">暂无新闻</div>';
        return;
      }
      grid.innerHTML = latest.rows.map((n) => {
        const img = thumb(n);
        return `
          <a class="card card-hover news-card" href="/news?doc=${encodeURIComponent(n.id)}">
            <div class="news-thumb">
              ${img ? `<img src="${img}" alt="" loading="lazy">` : '<div style="height:100%;background:linear-gradient(135deg,#0d1e3a,#0a1424)"></div>'}
              ${U.sectionBadge(n.section)}
            </div>
            <div class="news-body">
              <div class="news-date">${U.fmtDate(n.published_at)} · ${n.char_count_zh > 0 ? '中英双语' : '英文'}</div>
              <h3>${U.escapeHtml(n.title_zh || n.title_en)}</h3>
              <p>${U.escapeHtml(n.summary_zh || n.summary_en || '')}</p>
              <div class="news-meta">
                ${(n.tags || []).slice(0, 2).map((t) => `<span class="tag">${U.escapeHtml(t)}</span>`).join('')}
                ${n.vectorized ? '<span class="tag" style="color:#8df0c8">已向量化</span>' : ''}
              </div>
              <span class="news-link">阅读双语全文 ${U.icon('arrow')}</span>
            </div>
          </a>`;
      }).join('');
    } catch (e) {
      U.toast('加载首页数据失败：' + e.message, 'err');
    }
  }

  load();
})();
