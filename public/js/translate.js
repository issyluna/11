'use strict';

(function () {
  const U = window.UI;
  U.renderShell('translate');

  const source = document.getElementById('source');
  const output = document.getElementById('output');
  const targetSel = document.getElementById('target');
  const btn = document.getElementById('btn-translate');
  const detect = document.getElementById('detect');
  const charCount = document.getElementById('char-count');
  let busy = false;
  let lastOutput = '';

  const SAMPLE = 'INSARAG 城市搜索与救援队伍应在地震发生后 48 小时内完成部署，并与受灾国救援协调中心建立对接。行动基地的选址需评估余震、次生灾害与后勤补给条件。';

  function detectLang(text) {
    if (/[\u4e00-\u9fff]/.test(text)) return '中文';
    if (/[\u0E00-\u0E7F]/.test(text)) return '泰语';
    if (/[\u1780-\u17FF]/.test(text)) return '高棉语';
    if (/[\u0E80-\u0EFF]/.test(text)) return '老挝语';
    if (/[\u1000-\u109F]/.test(text)) return '缅甸语';
    if (/[ăâđêôơư]/i.test(text)) return '越南语';
    if (/[a-zA-Z]/.test(text)) return '英语';
    return '自动检测';
  }

  source.addEventListener('input', () => {
    const t = source.value.trim();
    charCount.textContent = `${source.value.length} 字符`;
    detect.textContent = t ? `检测：${detectLang(t)}` : '等待输入';
  });

  document.getElementById('btn-sample').onclick = () => {
    source.value = SAMPLE;
    source.dispatchEvent(new Event('input'));
    source.focus();
  };
  document.getElementById('btn-clear').onclick = () => {
    source.value = '';
    source.dispatchEvent(new Event('input'));
    output.innerHTML = '<span class="muted" style="font-size:13.5px">译文将在这里流式生成，并自动附上术语、语料与新闻来源。</span>';
    lastOutput = '';
    resetSources();
  };

  function resetSources() {
    document.getElementById('n-gloss').textContent = '0';
    document.getElementById('n-corpus').textContent = '0';
    document.getElementById('n-news').textContent = '0';
    document.getElementById('foot-gloss').textContent = '0';
    document.getElementById('foot-corpus').textContent = '0';
    document.getElementById('foot-news').textContent = '0';
    document.getElementById('glossary-list').innerHTML = '<div class="empty" style="grid-column:1/-1;padding:30px">翻译后显示命中的标准术语</div>';
    document.getElementById('corpus-list').innerHTML = '<div class="empty" style="grid-column:1/-1;padding:30px">翻译后显示语义相近的英中平行语料</div>';
    document.getElementById('news-list').innerHTML = '<div class="empty" style="grid-column:1/-1;padding:30px">翻译后显示相关新闻背景</div>';
  }

  function renderMeta(data) {
    const glossary = data.glossary || [];
    const semantic = (data.semantic_terms || []).filter((t) => !glossary.some((g) => g.term_id === t.id));
    const corpus = data.corpus || [];
    const news = data.news || [];

    document.getElementById('n-gloss').textContent = glossary.length;
    document.getElementById('n-corpus').textContent = corpus.length;
    document.getElementById('n-news').textContent = news.length;
    document.getElementById('foot-gloss').textContent = glossary.length;
    document.getElementById('foot-corpus').textContent = corpus.length;
    document.getElementById('foot-news').textContent = news.length;
    detect.textContent = `检测：${detectLang(source.value.trim())} → ${data.target_name || targetSel.options[targetSel.selectedIndex].text}`;

    document.getElementById('glossary-list').innerHTML = (glossary.length || semantic.length)
      ? [
        ...glossary.map((t) => `<div class="gloss-item"><b>${U.escapeHtml(t.abbr || t.term_id)}</b><span>${U.escapeHtml(t.zh_name || t.en_full)}</span><small>${U.escapeHtml(t.en_full || '')}${t.note ? ' · ' + U.escapeHtml(t.note) : ''}</small><small style="color:#f3b64a">命中：${U.escapeHtml(t.matched || '')}</small></div>`),
        ...semantic.map((t) => `<div class="gloss-item" style="opacity:.78"><b>${U.escapeHtml(t.title)}</b><span>语义召回</span><small>${U.escapeHtml(t.snippet)}</small></div>`)
      ].join('')
      : '<div class="empty" style="grid-column:1/-1;padding:30px">原文未命中术语库中的标准术语</div>';

    document.getElementById('corpus-list').innerHTML = corpus.length
      ? corpus.map((s) => `
          <div class="mini-source">
            <div class="top">${U.typeBadge('corpus')}<span class="mono" style="margin-left:auto;color:var(--green)">${Math.round(s.score * 100)}%</span></div>
            <b>${U.escapeHtml(s.title)}</b>
            <p style="white-space:pre-wrap">${U.escapeHtml(s.snippet)}</p>
            ${s.url ? `<a class="link" href="${U.escapeHtml(s.url)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;margin-top:6px;font-size:10.5px;color:#8fdcff">${U.icon('external')} 来源新闻</a>` : ''}
          </div>`).join('')
      : '<div class="empty" style="grid-column:1/-1;padding:30px">未召回相似度达标的平行语料</div>';

    document.getElementById('news-list').innerHTML = news.length
      ? news.map((s) => `
          <div class="mini-source">
            <div class="top">${U.typeBadge('news')}<span class="mono" style="margin-left:auto;color:var(--green)">${Math.round(s.score * 100)}%</span></div>
            <b>${U.escapeHtml(s.title)}</b>
            <p>${U.escapeHtml(s.snippet)}</p>
            ${s.url ? `<a class="link" href="${U.escapeHtml(s.url)}" target="_blank" rel="noopener">${U.icon('external')} 打开原文 · ${U.fmtDate(s.date)}</a>` : ''}
          </div>`).join('')
      : '<div class="empty" style="grid-column:1/-1;padding:30px">未召回相关新闻背景</div>';
  }

  async function translate() {
    const text = source.value.trim();
    if (!text) { U.toast('请先输入原文', 'err'); return; }
    if (busy) return;
    busy = true;
    btn.classList.add('loading');
    btn.disabled = true;
    resetSources();
    lastOutput = '';
    output.innerHTML = '<span class="typing" style="color:#8fdcff">正在检索术语、语料与新闻……</span>';
    document.getElementById('trans-meta').textContent = '检索增强中…';
    const t0 = Date.now();

    try {
      await U.sse('/api/translate', { text, target: targetSel.value, sourceLang: 'auto' }, (event, data) => {
        if (event === 'meta') {
          renderMeta(data);
          output.innerHTML = '<span class="typing" style="color:#8fdcff">正在生成译文……</span>';
        }
        if (event === 'delta') {
          lastOutput += data.text || '';
          output.innerHTML = `<span class="typing">${U.escapeHtml(lastOutput)}</span>`;
        }
        if (event === 'done') {
          output.innerHTML = U.escapeHtml(lastOutput);
          document.getElementById('trans-meta').textContent = `${data.target_lang?.toUpperCase() || ''} · ${data.model || 'deepseek'} · ${((data.latency_ms || (Date.now() - t0)) / 1000).toFixed(1)}s · 术语 ${data.glossary_count || 0} / 语料 ${data.corpus_count || 0} / 新闻 ${data.news_count || 0}`;
        }
        if (event === 'error') {
          throw new Error(data.message || '翻译失败');
        }
      });
    } catch (e) {
      output.innerHTML = `<span style="color:#ffb3bf">翻译失败：${U.escapeHtml(e.message)}</span>`;
      U.toast('翻译失败：' + e.message, 'err');
      document.getElementById('trans-meta').textContent = '翻译失败';
    } finally {
      busy = false;
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  btn.onclick = translate;

  document.getElementById('btn-copy').onclick = async () => {
    if (!lastOutput) { U.toast('暂无译文可复制', 'err'); return; }
    try {
      await navigator.clipboard.writeText(lastOutput);
      U.toast('译文已复制');
    } catch {
      U.toast('复制失败，请手动选择文本', 'err');
    }
  };

  document.querySelectorAll('#rag-tabs .tab').forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll('#rag-tabs .tab').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelector(`.tab-panel[data-panel="${t.dataset.tab}"]`).classList.add('active');
    };
  });

  // 默认填入示例，便于直接演示
  const params = new URLSearchParams(location.search);
  source.value = params.get('text') || SAMPLE;
  if (params.get('target') && [...targetSel.options].some((o) => o.value === params.get('target'))) {
    targetSel.value = params.get('target');
  }
  source.dispatchEvent(new Event('input'));
  if (params.get('auto') === '1') setTimeout(translate, 600);
})();
