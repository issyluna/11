'use strict';

/**
 * INSARAG 知识与多语翻译平台 · 服务端
 * 零依赖：node:http + node:sqlite + 全局 fetch
 * 启动：node --no-warnings server.js（生产环境由 PM2 托管，端口 6005）
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const { Store, NEWS_FIELDS, CORPUS_FIELDS, TERM_FIELDS, CHUNK_FIELDS, INDEXES } = require('./lib/db');
const { Config } = require('./lib/config');
const { vectorizePending, answerStream, translateStream, LANGS } = require('./lib/rag');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 6005);

const store = new Store(DATA);
const config = new Config(DATA);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf'
};

const PAGE_ROUTES = {
  '/': 'index.html',
  '/news': 'news.html',
  '/cms': 'cms.html',
  '/qa': 'qa.html',
  '/translate': 'translate.html',
  '/assets': 'assets.html',
  '/database': 'database.html'
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendText(res, code, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}

function readBody(req, limit = 3 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('请求体过大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('JSON 格式错误'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function startSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': connected\n\n');
  let closed = false;
  res.on('close', () => { closed = true; });
  return {
    emit(event, data) {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      if (!closed) res.end();
    },
    get closed() { return closed; }
  };
}

function serveFile(res, filePath, { download = false } = {}) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, 'Not Found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
  };
  if (download) headers['Content-Disposition'] = `attachment; filename="${path.basename(filePath)}"`;
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  return p.startsWith(base) ? p : null;
}

async function handleApi(req, res, pathname, searchParams) {
  const method = req.method;

  if (pathname === '/api/health' && method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      service: 'insarag-hub',
      port: PORT,
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
      models: { embedding: config.value.embedding_model, chat: config.value.deepseek_model }
    });
  }

  if (pathname === '/api/stats' && method === 'GET') {
    return sendJson(res, 200, {
      ...store.stats(),
      vectors: store.vectorStatus(),
      config: config.publicValue(),
      languages: LANGS
    });
  }

  if (pathname === '/api/news' && method === 'GET') {
    const q = searchParams.get('q') || '';
    const section = searchParams.get('section') || '';
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 20)));
    return sendJson(res, 200, store.listNews({ q, section, page, pageSize }));
  }

  if (pathname === '/api/news' && method === 'POST') {
    const body = await readBody(req);
    if (!body.title_en) return sendJson(res, 400, { error: 'title_en 为必填项' });
    const rec = store.createNews(body);
    return sendJson(res, 201, { ok: true, doc_id: rec.doc_id, record: rec });
  }

  const newsMatch = /^\/api\/news\/([^/]+)$/.exec(pathname);
  if (newsMatch) {
    const id = decodeURIComponent(newsMatch[1]);
    if (method === 'GET') {
      const n = store.getNews(id);
      if (!n) return sendJson(res, 404, { error: '新闻不存在' });
      n.chunks = store.db.prepare('SELECT id,chunk_index,embedding IS NOT NULL AS embedded FROM chunks WHERE source_type=? AND source_id=? ORDER BY chunk_index').all('news', id);
      return sendJson(res, 200, n);
    }
    if (method === 'PUT') {
      const body = await readBody(req);
      const rec = store.updateNews(id, body);
      if (!rec) return sendJson(res, 404, { error: '新闻不存在' });
      return sendJson(res, 200, { ok: true, doc_id: rec.doc_id, record: rec });
    }
    if (method === 'DELETE') {
      const ok = store.deleteNews(id);
      return sendJson(res, ok ? 200 : 404, { ok });
    }
  }

  const exportMatch = /^\/api\/news\/([^/]+)\/export$/.exec(pathname);
  if (exportMatch && method === 'GET') {
    const id = decodeURIComponent(exportMatch[1]);
    const rec = store.getNewsRecord(id);
    if (!rec) return sendJson(res, 404, { error: '新闻不存在' });
    const body = JSON.stringify(rec, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${id}.json"`,
      'Content-Length': Buffer.byteLength(body)
    });
    return res.end(body);
  }

  if (pathname === '/api/files' && method === 'GET') {
    const dir = path.join(DATA, 'news');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
      const fp = path.join(dir, f);
      const st = fs.statSync(fp);
      let rec = {};
      try { rec = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { /* ignore */ }
      return {
        file: f,
        size: st.size,
        modified: st.mtime.toISOString(),
        doc_id: rec.doc_id || f.replace('.json', ''),
        title_en: rec.title_en || '',
        title_zh: rec.title_zh || '',
        schema_version: rec.schema_version || '',
        published_at: rec.published_at || '',
        section: rec.source?.section || '',
        canonical_url: rec.source?.canonical_url || '',
        checksum: rec.provenance?.content_sha256 || '',
        paragraphs: rec.body?.paragraphs_en?.length || 0,
        media: rec.media?.length || 0,
        translation_status: rec.provenance?.translation_status || 'pending',
        raw: rec
      };
    });
    return sendJson(res, 200, {
      count: files.length,
      schema_version: files[0]?.schema_version || '1.0.0',
      total_bytes: files.reduce((s, f) => s + f.size, 0),
      files
    });
  }

  const fileMatch = /^\/api\/files\/([^/]+)$/.exec(pathname);
  if (fileMatch && method === 'GET') {
    const name = decodeURIComponent(fileMatch[1]).replace(/[^A-Za-z0-9._-]/g, '');
    const fp = path.join(DATA, 'news', name.endsWith('.json') ? name : name + '.json');
    if (!fs.existsSync(fp)) return sendJson(res, 404, { error: '文件不存在' });
    return sendJson(res, 200, { file: path.basename(fp), content: JSON.parse(fs.readFileSync(fp, 'utf8')) });
  }

  if (pathname === '/api/terms' && method === 'GET') {
    const q = searchParams.get('q') || '';
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(500, Math.max(1, Number(searchParams.get('pageSize') || 100)));
    return sendJson(res, 200, store.listTerms({ q, page, pageSize }));
  }

  if (pathname === '/api/corpus' && method === 'GET') {
    const q = searchParams.get('q') || '';
    const docId = searchParams.get('doc_id') || '';
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') || 50)));
    return sendJson(res, 200, store.listCorpus({ q, docId, page, pageSize }));
  }

  if (pathname === '/api/vector/status' && method === 'GET') {
    return sendJson(res, 200, store.vectorStatus());
  }

  if (pathname === '/api/vectorize' && method === 'POST') {
    const sse = startSSE(res);
    try {
      sse.emit('status', { message: '开始扫描待向量化数据…', status: store.vectorStatus() });
      const result = await vectorizePending(store, config.value, (p) => {
        if (p.phase === 'staged') {
          sse.emit('progress', { phase: 'staged', staged: p.staged, sources: { news: p.sources.news.length, corpus: p.sources.corpus.length, terms: p.sources.terms.length } });
        } else if (p.phase === 'batch') {
          sse.emit('progress', { phase: 'embedding', embedded: p.embedded, total: store.vectorStatus().chunks.total });
        }
      });
      sse.emit('done', result);
    } catch (e) {
      sse.emit('error', { message: e.message });
    }
    return sse.end();
  }

  if (pathname === '/api/qa' && method === 'POST') {
    const body = await readBody(req);
    const question = String(body.question || '').trim();
    if (!question) return sendJson(res, 400, { error: '问题不能为空' });
    const sse = startSSE(res);
    try {
      sse.emit('start', { question, model: config.value.deepseek_model });
      await answerStream(store, config.value, question, sse.emit);
    } catch (e) {
      sse.emit('error', { message: e.message, code: e.code || 'QA_ERROR' });
    }
    return sse.end();
  }

  if (pathname === '/api/translate' && method === 'POST') {
    const body = await readBody(req);
    const text = String(body.text || '').trim();
    if (!text) return sendJson(res, 400, { error: '原文不能为空' });
    const target = String(body.target || 'en');
    if (!LANGS[target]) return sendJson(res, 400, { error: '不支持的目标语言' });
    const sse = startSSE(res);
    try {
      sse.emit('start', { target, source_lang: body.sourceLang || 'auto' });
      await translateStream(store, config.value, { text, target, sourceLang: body.sourceLang || 'auto' }, sse.emit);
    } catch (e) {
      sse.emit('error', { message: e.message });
    }
    return sse.end();
  }

  if (pathname === '/api/schema' && method === 'GET') {
    const fp = path.join(DATA, 'news_schema.json');
    if (!fs.existsSync(fp)) return sendJson(res, 404, { error: '元数据规范文件不存在' });
    return sendJson(res, 200, JSON.parse(fs.readFileSync(fp, 'utf8')));
  }

  if (pathname === '/api/database' && method === 'GET') {
    const ddl = (name) => store.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name)?.sql || '';
    return sendJson(res, 200, {
      name: 'insarag.db',
      engine: 'SQLite (node:sqlite, WAL)',
      file_size: store.stats().fileSize,
      tables: [
        { name: 'news', label: '新闻主表', count: store.countNews(), ddl: ddl('news'), fields: NEWS_FIELDS },
        { name: 'corpus', label: '平行语料库', count: store.db.prepare('SELECT COUNT(*) c FROM corpus').get().c, ddl: ddl('corpus'), fields: CORPUS_FIELDS },
        { name: 'terms', label: '术语库', count: store.db.prepare('SELECT COUNT(*) c FROM terms').get().c, ddl: ddl('terms'), fields: TERM_FIELDS },
        { name: 'chunks', label: '向量切片表', count: store.db.prepare('SELECT COUNT(*) c FROM chunks').get().c, ddl: ddl('chunks'), fields: CHUNK_FIELDS },
        { name: 'qa_log', label: '问答日志', count: store.db.prepare('SELECT COUNT(*) c FROM qa_log').get().c, ddl: ddl('qa_log'), fields: [{ name: 'question', type: 'TEXT', constraint: '', desc: '用户问题' }, { name: 'answer', type: 'TEXT', constraint: '', desc: '模型回答' }, { name: 'sources', type: 'TEXT', constraint: '', desc: '引用来源 JSON' }, { name: 'latency_ms', type: 'INTEGER', constraint: '', desc: '耗时毫秒' }, { name: 'model', type: 'TEXT', constraint: '', desc: '模型名称' }, { name: 'created_at', type: 'TEXT', constraint: '', desc: '创建时间' }] },
        { name: 'translation_log', label: '翻译日志', count: store.db.prepare('SELECT COUNT(*) c FROM translation_log').get().c, ddl: ddl('translation_log'), fields: [{ name: 'source_lang', type: 'TEXT', constraint: '', desc: '源语言' }, { name: 'target_lang', type: 'TEXT', constraint: '', desc: '目标语言' }, { name: 'source_text', type: 'TEXT', constraint: '', desc: '原文' }, { name: 'output', type: 'TEXT', constraint: '', desc: '译文' }, { name: 'sources', type: 'TEXT', constraint: '', desc: '术语/语料/新闻来源' }, { name: 'latency_ms', type: 'INTEGER', constraint: '', desc: '耗时毫秒' }, { name: 'model', type: 'TEXT', constraint: '', desc: '模型' }, { name: 'created_at', type: 'TEXT', constraint: '', desc: '创建时间' }] }
      ],
      indexes: INDEXES,
      relations: [
        { from: 'chunks.source_id', to: 'news.id', type: 'N:1（source_type=news）' },
        { from: 'chunks.source_id', to: 'corpus.pair_id', type: 'N:1（source_type=corpus）' },
        { from: 'chunks.source_id', to: 'terms.term_id', type: 'N:1（source_type=term）' },
        { from: 'corpus.doc_id', to: 'news.id', type: 'N:1' }
      ],
      vector: store.vectorStatus()
    });
  }

  return sendJson(res, 404, { error: 'API 不存在' });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(parsed.pathname);

  try {
    if (pathname.startsWith('/api/')) {
      return await handleApi(req, res, pathname, parsed.searchParams);
    }

    if (pathname.startsWith('/media/')) {
      const fp = safeJoin(path.join(DATA, 'media'), pathname.slice('/media/'.length));
      return serveFile(res, fp || '');
    }

    if (PAGE_ROUTES[pathname]) {
      return serveFile(res, path.join(PUBLIC, PAGE_ROUTES[pathname]));
    }

    const fp = safeJoin(PUBLIC, pathname.replace(/^\//, ''));
    if (fp) return serveFile(res, fp);
    return sendText(res, 404, 'Not Found');
  } catch (e) {
    console.error('[server]', e);
    if (!res.headersSent) sendJson(res, e.status || 500, { error: e.message });
    else res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const s = store.stats();
  console.log(`INSARAG Hub 已启动：http://localhost:${PORT}`);
  console.log(`数据：新闻 ${s.news} 条｜术语 ${s.terms} 条｜平行语料 ${s.corpus} 对｜向量切片 ${s.embedded}/${s.chunks}`);
});

module.exports = { server, store };
