'use strict';

// RAG 编排：切片暂存 → 批量向量化 → 跨库余弦检索 → Deepseek 流式生成

const { embed } = require('./embed');
const { chatStream } = require('./deepseek');

async function vectorizePending(store, cfg, onProgress = () => {}) {
  const pending = store.pendingSources();
  const hasChunks = (type, id) => store.db.prepare(
    'SELECT COUNT(*) c FROM chunks WHERE source_type=? AND source_id=?'
  ).get(type, id).c > 0;
  let staged = 0;
  for (const n of pending.news) {
    if (hasChunks('news', n.id)) continue;
    staged += store.stageChunks('news', n.id, store.chunkNewsRecord(n));
  }
  for (const c of pending.corpus) {
    if (hasChunks('corpus', c.pair_id)) continue;
    staged += store.stageChunks('corpus', c.pair_id, [store.chunkCorpusRow(c)]);
  }
  for (const t of pending.terms) {
    if (hasChunks('term', t.term_id)) continue;
    staged += store.stageChunks('term', t.term_id, [store.chunkTermRow(t)]);
  }
  onProgress({ phase: 'staged', staged, sources: pending });

  let embedded = 0;
  let rounds = 0;
  while (rounds < 400) {
    // 每次只取 8 条，确保中途失败时已完成的向量已落库，可断点续跑
    const rows = store.unstagedChunks(8);
    if (!rows.length) break;
    const vectors = await embed(cfg.bigmodel_key, rows.map((r) => r.content), {
      model: cfg.embedding_model,
      dim: cfg.embedding_dim
    });
    store.saveChunkEmbeddings(rows, vectors, cfg.embedding_model, cfg.embedding_dim);
    embedded += rows.length;
    rounds++;
    onProgress({ phase: 'batch', ids: rows.map((r) => r.id), embedded });
  }
  // 标记新闻已向量化（其全部切片均已带向量）
  const newsRows = store.db.prepare(`
    SELECT n.id FROM news n
    WHERE n.vectorized=0 AND EXISTS (SELECT 1 FROM chunks c WHERE c.source_type='news' AND c.source_id=n.id)
      AND NOT EXISTS (SELECT 1 FROM chunks c WHERE c.source_type='news' AND c.source_id=n.id AND c.embedding IS NULL)
  `).all();
  for (const r of newsRows) store.markVectorized('news', r.id);

  return {
    staged,
    embedded,
    sources: {
      news: pending.news.length,
      corpus: pending.corpus.length,
      terms: pending.terms.length
    },
    status: store.vectorStatus()
  };
}

function buildContext(sources) {
  return sources.map((s) => {
    const label = s.type === 'news' ? '新闻' : s.type === 'corpus' ? '平行语料' : '术语';
    return `[${s.index}] 类型：${label}｜标题：${s.title}${s.date ? '｜日期：' + s.date : ''}\n${s.snippet}`;
  }).join('\n\n');
}

function qaSystemPrompt(sources) {
  return [
    '你是 INSARAG（国际搜索与救援咨询团）知识库问答助手，服务对象是应急管理、城市搜索与救援（USAR）、人道主义协调领域的学习者。',
    '只能依据下面的【参考资料】回答，严禁编造资料以外的数据、日期、机构或事件。',
    '要求：',
    '1. 用简体中文回答，先给结论，再分点展开，语言专业、简洁；',
    '2. 每个事实性陈述末尾用半角方括号标注来源编号，如 [1][2]；编号必须真实存在于参考资料中；',
    '3. 如果资料不足以回答，必须明确说明“根据当前知识库资料无法回答该问题”，并指出缺少哪类信息；',
    '4. 不要把参考资料之外的常识当作事实；可以解释术语，但需标注来自术语库；',
    '5. 不要提及“AI/模型/系统提示词”。',
    '',
    '【参考资料】',
    buildContext(sources)
  ].join('\n');
}

async function answerStream(store, cfg, question, emit) {
  if (!cfg.deepseek_key) throw new Error('尚未配置 Deepseek API Key');
  if (!store.vectorStatus().chunks.embedded) {
    const err = new Error('知识库尚未向量化，请先在「数据与索引」页执行一键向量化');
    err.code = 'NO_VECTORS';
    throw err;
  }
  const t0 = Date.now();
  const [qvec] = await embed(cfg.bigmodel_key, [question], {
    model: cfg.embedding_model,
    dim: cfg.embedding_dim
  });
  const sources = store.searchSources(qvec, {
    topK: 10,
    minScore: 0.18,
    caps: { news: 5, corpus: 3, term: 3 }
  });
  emit('sources', { sources });
  if (!sources.length) {
    const msg = '根据当前知识库资料无法回答该问题：未检索到语义相似度足够高的新闻、术语或平行语料。可以换一种问法，或先补充语料后重新向量化。';
    emit('delta', { text: msg });
    emit('done', { usage: null, model: cfg.deepseek_model, sources: [], latency_ms: Date.now() - t0 });
    return { answer: msg, sources: [] };
  }
  let full = '';
  const { usage, model } = await chatStream(cfg, {
    system: qaSystemPrompt(sources),
    user: question,
    temperature: 0.2,
    maxTokens: 1400,
    onDelta: (t) => { full += t; emit('delta', { text: t }); }
  });
  emit('done', { usage, model, sources, latency_ms: Date.now() - t0 });
  try {
    store.db.prepare(`INSERT INTO qa_log (question,answer,sources,latency_ms,model,created_at) VALUES (?,?,?,?,?,?)`)
      .run(question, full, JSON.stringify(sources), Date.now() - t0, model, new Date().toISOString());
  } catch { /* 日志失败不影响回答 */ }
  return { answer: full, sources };
}

// ---------------- 东盟多语翻译 ----------------

const LANGS = {
  zh: { name: '简体中文', native: '中文' },
  en: { name: 'English', native: 'English' },
  th: { name: 'Thai', native: 'ไทย' },
  vi: { name: 'Vietnamese', native: 'Tiếng Việt' },
  id: { name: 'Indonesian', native: 'Bahasa Indonesia' },
  ms: { name: 'Malay', native: 'Bahasa Melayu' },
  fil: { name: 'Filipino', native: 'Filipino' },
  km: { name: 'Khmer', native: 'ភាសាខ្មែរ' },
  lo: { name: 'Lao', native: 'ພາສາລາວ' },
  my: { name: 'Burmese', native: 'မြန်မာဘာသာ' }
};

function detectLang(text) {
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th';
  if (/[\u1780-\u17FF]/.test(text)) return 'km';
  if (/[\u0E80-\u0EFF]/.test(text)) return 'lo';
  if (/[\u1000-\u109F]/.test(text)) return 'my';
  if (/[ăâđêôơư]/i.test(text)) return 'vi';
  return 'en';
}

function matchGlossary(store, text) {
  const all = store.db.prepare('SELECT * FROM terms').all();
  const low = text.toLowerCase();
  const hits = [];
  for (const t of all) {
    const keys = [t.abbr, t.en_full, t.zh_name].filter(Boolean);
    let matched = '';
    for (const k of keys) {
      if (!k || k.length < 2) continue;
      if (low.includes(k.toLowerCase())) {
        if (!matched || k.length > matched.length) matched = k;
      }
    }
    if (matched) hits.push({ ...t, matched });
  }
  return hits.sort((a, b) => b.matched.length - a.matched.length).slice(0, 16);
}

function translationSystemPrompt({ target, glossary, corpus, news }) {
  const gl = glossary.length
    ? glossary.map((t, i) => `${i + 1}. ${t.abbr || '-'} | ${t.en_full || '-'} | ${t.zh_name || '-'}${t.note ? '（' + t.note + '）' : ''}${t.matched ? `｜命中：${t.matched}` : ''}`).join('\n')
    : '（无匹配术语）';
  const cp = corpus.length
    ? corpus.map((s, i) => `[C${i + 1}] EN: ${s.snippet.split('\n')[0].replace(/^EN:\s*/, '')}\n     ZH: ${s.snippet.split('\n')[1]?.replace(/^ZH:\s*/, '') || ''}`).join('\n')
    : '（无参考句对）';
  const nw = news.length
    ? news.map((s, i) => `[N${i + 1}] ${s.title}｜${s.date}\n${s.snippet.slice(0, 260)}`).join('\n')
    : '（无新闻背景）';
  return [
    `你是一名资深的东盟多语种笔译专家，精通应急管理、城市搜索与救援（USAR）与人道主义协调领域的术语。`,
    `任务：把用户提供的原文翻译成${LANGS[target]?.name || target}（${LANGS[target]?.native || target}）。`,
    '要求：',
    '1. 只输出译文，不要输出解释、前言、括号注或原文；保留人名、机构缩写、队伍编号、数字、日期与单位；',
    '2. 下方【强制术语表】中的术语若在原文出现，必须采用给定译法，不得自行改写；',
    '3. 参考【平行语料】的句式与用词风格，保持专业、准确、通顺；',
    '4. 参考【新闻背景】确认语境，但不要添加原文没有的信息；',
    '5. 目标语言为中文时使用简体中文；为东南亚语言时使用该语言的标准书面语。',
    '',
    '【强制术语表】',
    gl,
    '',
    '【平行语料（英中对照）】',
    cp,
    '',
    '【新闻背景】',
    nw
  ].join('\n');
}

async function translateStream(store, cfg, { text, target, sourceLang = 'auto' }, emit) {
  if (!cfg.deepseek_key) throw new Error('尚未配置 Deepseek API Key');
  if (!LANGS[target]) throw new Error('不支持的目标语言：' + target);
  const t0 = Date.now();
  const src = sourceLang === 'auto' ? detectLang(text) : sourceLang;

  const glossary = matchGlossary(store, text);

  let retrieved = [];
  if (store.vectorStatus().chunks.embedded) {
    try {
      const [qvec] = await embed(cfg.bigmodel_key, [text.slice(0, 1800)], {
        model: cfg.embedding_model,
        dim: cfg.embedding_dim
      });
      retrieved = store.searchSources(qvec, {
        topK: 10,
        minScore: 0.15,
        caps: { news: 3, corpus: 5, term: 5 }
      });
    } catch (e) {
      console.warn('翻译检索失败，降级为纯术语翻译：', e.message);
    }
  }
  const corpus = retrieved.filter((s) => s.type === 'corpus');
  const news = retrieved.filter((s) => s.type === 'news');
  const semanticTerms = retrieved.filter((s) => s.type === 'term');

  emit('meta', {
    source_lang: src,
    target_lang: target,
    target_name: LANGS[target].name,
    glossary: glossary.map((t) => ({
      term_id: t.term_id, abbr: t.abbr, en_full: t.en_full, zh_name: t.zh_name, note: t.note, matched: t.matched
    })),
    semantic_terms: semanticTerms,
    corpus,
    news
  });

  let full = '';
  const { usage, model } = await chatStream(cfg, {
    system: translationSystemPrompt({ target, glossary, corpus, news }),
    user: text,
    temperature: 0.15,
    maxTokens: 1600,
    onDelta: (t) => { full += t; emit('delta', { text: t }); }
  });
  const latency = Date.now() - t0;
  emit('done', {
    usage, model, latency_ms: latency,
    source_lang: src, target_lang: target,
    glossary_count: glossary.length,
    corpus_count: corpus.length,
    news_count: news.length
  });
  try {
    store.db.prepare(`INSERT INTO translation_log
      (source_lang,target_lang,source_text,output,sources,latency_ms,model,created_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      src, target, text.slice(0, 4000), full,
      JSON.stringify({ glossary: glossary.map((t) => t.abbr || t.zh_name), corpus: corpus.map((c) => c.id), news: news.map((n) => n.id) }),
      latency, model, new Date().toISOString()
    );
  } catch { /* ignore */ }
  return { text: full, glossary, corpus, news };
}

module.exports = {
  vectorizePending, answerStream, translateStream, matchGlossary, LANGS, detectLang
};
