'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const NEWS_FIELDS = [
  { name: 'id', type: 'TEXT', constraint: '主键 PRIMARY KEY', desc: '新闻唯一标识（INSARAG-NEWS-<WordPress ID>）' },
  { name: 'seq', type: 'INTEGER', constraint: '', desc: '本批次顺序号' },
  { name: 'title_en', type: 'TEXT', constraint: 'NOT NULL', desc: '英文标题' },
  { name: 'title_zh', type: 'TEXT', constraint: '', desc: '中文标题（Deepseek 译文）' },
  { name: 'summary_en', type: 'TEXT', constraint: '', desc: '英文摘要' },
  { name: 'summary_zh', type: 'TEXT', constraint: '', desc: '中文摘要' },
  { name: 'content_en', type: 'TEXT', constraint: '', desc: '英文正文（段落以空行分隔）' },
  { name: 'content_zh', type: 'TEXT', constraint: '', desc: '中文正文（段落以空行分隔）' },
  { name: 'url', type: 'TEXT', constraint: '索引 idx_news_url', desc: '官网原文链接，来源可追溯' },
  { name: 'published_at', type: 'TEXT', constraint: '索引 idx_news_date', desc: '发布时间（ISO 8601）' },
  { name: 'section', type: 'TEXT', constraint: '索引 idx_news_section', desc: '栏目：Global / Asia-Pacific / AEME / IEC-R' },
  { name: 'author', type: 'TEXT', constraint: '', desc: '发布机构' },
  { name: 'categories', type: 'TEXT', constraint: '', desc: '分类（JSON 数组）' },
  { name: 'tags', type: 'TEXT', constraint: '', desc: '标签（JSON 数组）' },
  { name: 'entities', type: 'TEXT', constraint: '', desc: '实体：国家/区域/组织/队伍/主题（JSON）' },
  { name: 'media', type: 'TEXT', constraint: '', desc: '配图（JSON，含本地路径）' },
  { name: 'attachments', type: 'TEXT', constraint: '', desc: 'PDF 等附件（JSON）' },
  { name: 'checksum', type: 'TEXT', constraint: '', desc: '英文正文 SHA-256 指纹' },
  { name: 'raw_json', type: 'TEXT', constraint: '', desc: '完整 JSON 留档' },
  { name: 'vectorized', type: 'INTEGER', constraint: 'DEFAULT 0', desc: '是否已切片向量化：1 是 / 0 否' },
  { name: 'updated_at', type: 'TEXT', constraint: '', desc: '本地最后修改时间' }
];

const CORPUS_FIELDS = [
  { name: 'pair_id', type: 'TEXT', constraint: '主键 PRIMARY KEY', desc: '句对编号 PC-0001' },
  { name: 'en', type: 'TEXT', constraint: 'NOT NULL', desc: '英文句子' },
  { name: 'zh', type: 'TEXT', constraint: 'NOT NULL', desc: '中文句子' },
  { name: 'doc_id', type: 'TEXT', constraint: '索引 idx_corpus_doc', desc: '来源新闻 ID' },
  { name: 'source_url', type: 'TEXT', constraint: '', desc: '来源链接' },
  { name: 'paragraph_index', type: 'INTEGER', constraint: '', desc: '在原段落中的位置（1:1 对齐依据）' },
  { name: 'sentence_index', type: 'INTEGER', constraint: '', desc: '在段落内的句序（1:1 对齐依据）' }
];

const TERM_FIELDS = [
  { name: 'term_id', type: 'TEXT', constraint: '主键 PRIMARY KEY', desc: '术语编号 TERM-001' },
  { name: 'abbr', type: 'TEXT', constraint: '索引 idx_term_abbr', desc: '缩写，如 AAR / AoO' },
  { name: 'en_full', type: 'TEXT', constraint: '', desc: '英文全称' },
  { name: 'zh_name', type: 'TEXT', constraint: '', desc: '标准中文名称' },
  { name: 'note', type: 'TEXT', constraint: '', desc: '备注 / 来源章节' },
  { name: 'search_text', type: 'TEXT', constraint: '', desc: '检索文本（缩写+英文+中文）' }
];

const CHUNK_FIELDS = [
  { name: 'id', type: 'INTEGER', constraint: '主键 PRIMARY KEY AUTOINCREMENT', desc: '切片自增编号' },
  { name: 'source_type', type: 'TEXT', constraint: 'UNIQUE(source_type,source_id,chunk_index)', desc: '来源类型：news / corpus / term' },
  { name: 'source_id', type: 'TEXT', constraint: '', desc: '来源主键' },
  { name: 'chunk_index', type: 'INTEGER', constraint: '', desc: '切片序号' },
  { name: 'content', type: 'TEXT', constraint: '', desc: '切片文本（写入向量）' },
  { name: 'embedding', type: 'TEXT', constraint: '', desc: 'embedding-3 向量（1024 维 JSON 数组）' },
  { name: 'embed_model', type: 'TEXT', constraint: '', desc: '向量模型' },
  { name: 'embed_dim', type: 'INTEGER', constraint: '', desc: '向量维度' },
  { name: 'created_at', type: 'TEXT', constraint: '', desc: '向量化时间' }
];

const INDEXES = [
  { name: 'idx_news_url', field: 'url', unique: false },
  { name: 'idx_news_date', field: 'published_at', unique: false },
  { name: 'idx_news_section', field: 'section', unique: false },
  { name: 'idx_corpus_doc', field: 'doc_id', unique: false },
  { name: 'idx_term_abbr', field: 'abbr', unique: false },
  { name: 'idx_chunks_source', field: 'source_type+source_id', unique: false }
];

const nowIso = () => new Date().toISOString();

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.newsDir = path.join(dataDir, 'news');
    fs.mkdirSync(this.newsDir, { recursive: true });
    this.file = path.join(dataDir, 'insarag.db');
    this.db = new DatabaseSync(this.file);
    this.db.exec('PRAGMA journal_mode=WAL;');
    this.db.exec('PRAGMA foreign_keys=ON;');
    this.migrate();
    this.seedIfEmpty();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS news (
        id TEXT PRIMARY KEY,
        seq INTEGER,
        title_en TEXT NOT NULL,
        title_zh TEXT DEFAULT '',
        summary_en TEXT DEFAULT '',
        summary_zh TEXT DEFAULT '',
        content_en TEXT DEFAULT '',
        content_zh TEXT DEFAULT '',
        paragraphs_en TEXT DEFAULT '[]',
        paragraphs_zh TEXT DEFAULT '[]',
        url TEXT,
        published_at TEXT,
        modified_at TEXT,
        author TEXT DEFAULT 'INSARAG Secretariat',
        section TEXT DEFAULT '',
        categories TEXT DEFAULT '[]',
        tags TEXT DEFAULT '[]',
        entities TEXT DEFAULT '{}',
        media TEXT DEFAULT '[]',
        attachments TEXT DEFAULT '[]',
        char_count_en INTEGER DEFAULT 0,
        char_count_zh INTEGER DEFAULT 0,
        checksum TEXT DEFAULT '',
        crawled_at TEXT,
        raw_json TEXT DEFAULT '{}',
        file_name TEXT DEFAULT '',
        vectorized INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS corpus (
        pair_id TEXT PRIMARY KEY,
        en TEXT NOT NULL,
        zh TEXT NOT NULL,
        doc_id TEXT,
        title_en TEXT DEFAULT '',
        title_zh TEXT DEFAULT '',
        source_url TEXT,
        published_at TEXT,
        section TEXT DEFAULT '',
        paragraph_index INTEGER,
        sentence_index INTEGER,
        char_count_en INTEGER DEFAULT 0,
        char_count_zh INTEGER DEFAULT 0,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS terms (
        term_id TEXT PRIMARY KEY,
        seq TEXT,
        abbr TEXT,
        en_full TEXT DEFAULT '',
        zh_name TEXT DEFAULT '',
        note TEXT DEFAULT '',
        category TEXT DEFAULT '',
        source_ref TEXT DEFAULT '',
        search_text TEXT DEFAULT '',
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        lang TEXT DEFAULT 'zh',
        embedding TEXT,
        embed_model TEXT,
        embed_dim INTEGER,
        created_at TEXT,
        UNIQUE(source_type, source_id, chunk_index)
      );
      CREATE TABLE IF NOT EXISTS qa_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT,
        answer TEXT,
        sources TEXT,
        latency_ms INTEGER,
        model TEXT,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS translation_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_lang TEXT,
        target_lang TEXT,
        source_text TEXT,
        output TEXT,
        sources TEXT,
        latency_ms INTEGER,
        model TEXT,
        created_at TEXT
      );
    `);
    for (const ix of INDEXES) {
      const field = ix.field.includes('+') ? ix.field.split('+').join(',') : ix.field;
      this.db.exec(`CREATE INDEX IF NOT EXISTS ${ix.name} ON ${
        ix.name.includes('corpus') ? 'corpus' : ix.name.includes('term') ? 'terms' : ix.name.includes('chunks') ? 'chunks' : 'news'
      }(${field});`);
    }
    this.db.exec('PRAGMA user_version = 1;');
  }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    }
  }

  // ---------------- 导入 / 种子 ----------------

  seedIfEmpty() {
    const newsCount = this.db.prepare('SELECT COUNT(*) c FROM news').get().c;
    if (!newsCount) this.importNewsFiles();
    const corpusCount = this.db.prepare('SELECT COUNT(*) c FROM corpus').get().c;
    if (!corpusCount) this.importCorpusFile();
    const termCount = this.db.prepare('SELECT COUNT(*) c FROM terms').get().c;
    if (!termCount) this.importTermsFile();
  }

  importNewsFiles() {
    const files = fs.readdirSync(this.newsDir).filter((f) => f.endsWith('.json'));
    let n = 0;
    for (const f of files) {
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(this.newsDir, f), 'utf8'));
        this.upsertFromRecord(rec, f);
        n++;
      } catch (e) {
        console.error('导入新闻失败：', f, e.message);
      }
    }
    console.log(`[seed] 已导入 ${n} 条新闻 JSON`);
  }

  importCorpusFile() {
    const file = path.join(this.dataDir, 'parallel_corpus_1to1.json');
    if (!fs.existsSync(file)) return;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ins = this.db.prepare(`
      INSERT OR REPLACE INTO corpus
      (pair_id,en,zh,doc_id,title_en,title_zh,source_url,published_at,section,paragraph_index,sentence_index,char_count_en,char_count_zh,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const ts = nowIso();
    this.tx(() => {
      for (const p of data.pairs || []) {
        ins.run(p.pair_id, p.en, p.zh, p.doc_id || '', p.title_en || '', p.title_zh || '',
          p.source_url || '', p.published_at || '', p.section || '', p.paragraph_index ?? null,
          p.sentence_index ?? null, p.char_count_en || p.en.length, p.char_count_zh || p.zh.length, ts);
      }
    });
    console.log(`[seed] 已导入 ${(data.pairs || []).length} 组平行语料`);
  }

  importTermsFile() {
    const file = path.join(this.dataDir, 'terms.json');
    if (!fs.existsSync(file)) return;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ins = this.db.prepare(`
      INSERT OR REPLACE INTO terms
      (term_id,seq,abbr,en_full,zh_name,note,category,source_ref,search_text,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    const ts = nowIso();
    this.tx(() => {
      for (const t of data.terms || []) {
        ins.run(t.term_id, t.seq || '', t.abbr || '', t.en_full || '', t.zh_name || '',
          t.note || '', t.category || '', t.source_ref || '', t.search_text || '', ts);
      }
    });
    console.log(`[seed] 已导入 ${(data.terms || []).length} 条术语`);
  }

  /** 从一条新闻 JSON 记录 upsert 到数据库，并回写文件 */
  upsertFromRecord(rec, fileName = '') {
    const body = rec.body || {};
    const paragraphsEn = body.paragraphs_en || [];
    const paragraphsZh = body.paragraphs_zh || [];
    const contentEn = body.plain_text_en || paragraphsEn.join('\n\n');
    const contentZh = body.plain_text_zh || paragraphsZh.join('\n\n');
    const fname = fileName || `${rec.doc_id}.json`;
    const ts = nowIso();
    this.db.prepare(`
      INSERT INTO news (id,seq,title_en,title_zh,summary_en,summary_zh,content_en,content_zh,
        paragraphs_en,paragraphs_zh,url,published_at,modified_at,author,section,categories,tags,
        entities,media,attachments,char_count_en,char_count_zh,checksum,crawled_at,raw_json,file_name,
        vectorized,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)
      ON CONFLICT(id) DO UPDATE SET
        seq=excluded.seq,title_en=excluded.title_en,title_zh=excluded.title_zh,
        summary_en=excluded.summary_en,summary_zh=excluded.summary_zh,
        content_en=excluded.content_en,content_zh=excluded.content_zh,
        paragraphs_en=excluded.paragraphs_en,paragraphs_zh=excluded.paragraphs_zh,
        url=excluded.url,published_at=excluded.published_at,modified_at=excluded.modified_at,
        author=excluded.author,section=excluded.section,categories=excluded.categories,
        tags=excluded.tags,entities=excluded.entities,media=excluded.media,attachments=excluded.attachments,
        char_count_en=excluded.char_count_en,char_count_zh=excluded.char_count_zh,checksum=excluded.checksum,
        crawled_at=excluded.crawled_at,raw_json=excluded.raw_json,file_name=excluded.file_name,
        vectorized=0,updated_at=excluded.updated_at
    `).run(
      rec.doc_id, rec.seq ?? null, rec.title_en || '', rec.title_zh || '',
      rec.summary_en || '', rec.summary_zh || '', contentEn, contentZh,
      JSON.stringify(paragraphsEn), JSON.stringify(paragraphsZh),
      rec.source?.canonical_url || '', rec.published_at || '', rec.modified_at || '',
      (rec.authors || []).join('、') || 'INSARAG Secretariat', rec.source?.section || '',
      JSON.stringify(rec.categories || []), JSON.stringify(rec.tags || []),
      JSON.stringify(rec.entities || {}), JSON.stringify(rec.media || []),
      JSON.stringify(rec.attachments || []), contentEn.length, contentZh.length,
      rec.provenance?.content_sha256 || '', rec.provenance?.crawled_at || '', JSON.stringify(rec),
      fname, ts, ts
    );
    this.db.prepare('DELETE FROM chunks WHERE source_type=? AND source_id=?').run('news', rec.doc_id);
  }

  // ---------------- 新闻 CRUD ----------------

  countNews() { return this.db.prepare('SELECT COUNT(*) c FROM news').get().c; }

  listNews({ q = '', section = '', page = 1, pageSize = 20, sort = 'date' } = {}) {
    const where = [];
    const params = [];
    if (q) {
      where.push('(title_en LIKE ? OR title_zh LIKE ? OR content_en LIKE ? OR content_zh LIKE ? OR tags LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    if (section) { where.push('section = ?'); params.push(section); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const order = sort === 'title' ? 'title_en ASC' : 'published_at DESC, seq ASC';
    const total = this.db.prepare(`SELECT COUNT(*) c FROM news ${whereSql}`).get(...params).c;
    const rows = this.db.prepare(`SELECT * FROM news ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);
    return { total, page, pageSize, rows: rows.map(toNewsListItem) };
  }

  getNews(id) {
    const r = this.db.prepare('SELECT * FROM news WHERE id=?').get(id);
    return r ? toNewsDetail(r) : null;
  }

  getNewsRecord(id) {
    const r = this.db.prepare('SELECT * FROM news WHERE id=?').get(id);
    if (!r) return null;
    return safeJson(r.raw_json, null) || toNewsDetail(r);
  }

  createNews(data) {
    const id = data.doc_id || `INSARAG-NEWS-MANUAL-${Date.now()}`;
    const rec = this.buildRecordFromForm(id, data);
    this.upsertFromRecord(rec, `${id}.json`);
    this.writeNewsFile(rec);
    return rec;
  }

  updateNews(id, data) {
    const old = this.getNewsRecord(id);
    if (!old) return null;
    const mergingIds = { ...old, ...data };
    const rec = this.buildRecordFromForm(id, mergingIds, old);
    this.upsertFromRecord(rec, `${id}.json`);
    this.writeNewsFile(rec);
    return rec;
  }

  buildRecordFromForm(id, data, old = {}) {
    const paragraphsEn = normalizeParagraphs(data.paragraphs_en ?? data.content_en ?? old.body?.paragraphs_en ?? []);
    const paragraphsZh = normalizeParagraphs(data.paragraphs_zh ?? data.content_zh ?? old.body?.paragraphs_zh ?? []);
    const contentEn = paragraphsEn.join('\n\n');
    const contentZh = paragraphsZh.join('\n\n');
    const crypto = require('node:crypto');
    const now = nowIso();
    return {
      $schema: '../news_schema.json',
      schema_version: '1.0.0',
      doc_id: id,
      record_type: 'news',
      seq: data.seq ?? old.seq ?? null,
      source: {
        publisher: 'INSARAG',
        publisher_full: 'International Search and Rescue Advisory Group (INSARAG), UN OCHA',
        site: 'https://insarag.org',
        section: data.section || old.source?.section || 'Manual Entry',
        canonical_url: data.url || old.source?.canonical_url || '',
        wp_post_id: old.source?.wp_post_id || null,
        language: 'en',
        license_note: old.source?.license_note || '版权归 INSARAG / 联合国人道主义事务协调办公室（OCHA）所有，此处仅用于教学与研究。'
      },
      title_en: data.title_en || old.title_en || '',
      title_zh: data.title_zh ?? old.title_zh ?? '',
      slug: data.slug || old.slug || id.toLowerCase(),
      summary_en: data.summary_en ?? old.summary_en ?? '',
      summary_zh: data.summary_zh ?? old.summary_zh ?? '',
      body: {
        paragraphs_en: paragraphsEn,
        paragraphs_zh: paragraphsZh,
        plain_text_en: contentEn,
        plain_text_zh: contentZh,
        char_count_en: contentEn.length,
        char_count_zh: contentZh.length
      },
      published_at: data.published_at || old.published_at || now,
      modified_at: now,
      authors: data.author ? [data.author] : (old.authors || ['INSARAG Secretariat']),
      categories: toArray(data.categories ?? old.categories),
      tags: toArray(data.tags ?? old.tags),
      entities: data.entities ?? old.entities ?? { countries: [], regions: [], organizations: [], usar_teams: [], themes: [] },
      media: old.media || [],
      attachments: old.attachments || [],
      knowledge: {
        chunk_strategy: 'bilingual-paragraph-400',
        chunks: 0,
        embedding_model: 'embedding-3',
        embedding_dim: 1024,
        indexed: false
      },
      provenance: {
        crawled_at: old.provenance?.crawled_at || now,
        crawler: old.provenance?.crawler || 'cms/manual',
        http_status: old.provenance?.http_status || 200,
        parser: 'cms-form',
        content_sha256: crypto.createHash('sha256').update(contentEn).digest('hex'),
        source_snapshot: old.provenance?.source_snapshot || '',
        translation_status: paragraphsZh.length ? 'done' : 'pending'
      },
      translation: {
        method: old.translation?.method || 'deepseek-chat',
        alignment: 'sentence-1to1',
        translated_at: old.translation?.translated_at || (paragraphsZh.length ? now : '')
      }
    };
  }

  writeNewsFile(rec) {
    fs.mkdirSync(this.newsDir, { recursive: true });
    fs.writeFileSync(path.join(this.newsDir, `${rec.doc_id}.json`), JSON.stringify(rec, null, 2), 'utf8');
  }

  deleteNews(id) {
    const r = this.getNews(id);
    if (!r) return false;
    this.tx(() => {
      this.db.prepare('DELETE FROM chunks WHERE source_type=? AND source_id=?').run('news', id);
      this.db.prepare('DELETE FROM news WHERE id=?').run(id);
    });
    const f = path.join(this.newsDir, `${id}.json`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    return true;
  }

  // ---------------- 术语 / 语料 ----------------

  listTerms({ q = '', page = 1, pageSize = 100 } = {}) {
    const where = q ? 'WHERE abbr LIKE ? OR en_full LIKE ? OR zh_name LIKE ? OR note LIKE ?' : '';
    const params = q ? Array(4).fill(`%${q}%`) : [];
    const total = this.db.prepare(`SELECT COUNT(*) c FROM terms ${where}`).get(...params).c;
    const rows = this.db.prepare(`SELECT * FROM terms ${where} ORDER BY term_id LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);
    return { total, page, pageSize, rows };
  }

  listCorpus({ q = '', docId = '', page = 1, pageSize = 50 } = {}) {
    const where = [];
    const params = [];
    if (q) { where.push('(en LIKE ? OR zh LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    if (docId) { where.push('doc_id = ?'); params.push(docId); }
    const sql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = this.db.prepare(`SELECT COUNT(*) c FROM corpus ${sql}`).get(...params).c;
    const rows = this.db.prepare(`SELECT * FROM corpus ${sql} ORDER BY pair_id LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);
    return { total, page, pageSize, rows };
  }

  // ---------------- 切片与向量 ----------------

  chunkNewsRecord(n) {
    const pEn = safeJson(n.paragraphs_en, []);
    const pZh = safeJson(n.paragraphs_zh, []);
    const title = n.title_zh ? `${n.title_zh}${n.title_en ? ' / ' + n.title_en : ''}` : n.title_en;
    const head = `【标题】${title}\n【栏目】${n.section || 'INSARAG'}｜【发布日期】${(n.published_at || '').slice(0, 10)}\n`;
    const chunks = [];
    const max = Math.max(pEn.length, pZh.length);
    for (let i = 0; i < max; i++) {
      const zh = (pZh[i] || '').trim();
      const en = (pEn[i] || '').trim();
      let body = '';
      if (zh) body += `【中文】${zh.slice(0, 900)}\n`;
      if (en) body += `【英文】${en.slice(0, 700)}\n`;
      if (!body) continue;
      chunks.push(head + body.trim());
    }
    if (!chunks.length) {
      chunks.push(`${head}【正文】${(n.content_zh || n.content_en || '').slice(0, 900)}`);
    }
    return chunks;
  }

  chunkCorpusRow(c) {
    return `【英中平行语料｜USAR 领域】\n【英文】${c.en}\n【中文】${c.zh}\n【来源】${c.title_zh || c.title_en || c.doc_id}`;
  }

  chunkTermRow(t) {
    return `【术语】${t.abbr || ''}\n【英文全称】${t.en_full || ''}\n【中文名称】${t.zh_name || ''}\n【备注】${t.note || ''}\n【类别】${t.category || ''}`;
  }

  markSourcesDirty(type, id) {
    const table = type === 'news' ? 'news' : type === 'term' ? 'terms' : 'corpus';
    const key = type === 'news' ? 'id' : type === 'term' ? 'term_id' : 'pair_id';
    if (type === 'news') this.db.prepare(`UPDATE ${table} SET vectorized=0 WHERE ${key}=?`).run(id);
    this.db.prepare('DELETE FROM chunks WHERE source_type=? AND source_id=?').run(type, id);
  }

  pendingSources() {
    const news = this.db.prepare('SELECT * FROM news WHERE vectorized=0 ORDER BY seq').all();
    const corpus = this.db.prepare('SELECT * FROM corpus WHERE NOT EXISTS (SELECT 1 FROM chunks c WHERE c.source_type=\'corpus\' AND c.source_id=pair_id AND c.embedding IS NOT NULL)').all();
    const terms = this.db.prepare('SELECT * FROM terms WHERE NOT EXISTS (SELECT 1 FROM chunks c WHERE c.source_type=\'term\' AND c.source_id=term_id AND c.embedding IS NOT NULL)').all();
    return { news, corpus, terms };
  }

  stageChunks(type, id, chunks) {
    const del = this.db.prepare('DELETE FROM chunks WHERE source_type=? AND source_id=?');
    const ins = this.db.prepare(`
      INSERT INTO chunks (source_type,source_id,chunk_index,content,lang,embedding,embed_model,embed_dim,created_at)
      VALUES (?,?,?,?,?,NULL,?,?,?)
    `);
    this.tx(() => {
      del.run(type, id);
      chunks.forEach((content, i) => ins.run(type, id, i, content, 'zh', 'embedding-3', 1024, nowIso()));
    });
    return chunks.length;
  }

  unstagedChunks(limit = 32) {
    return this.db.prepare(`
      SELECT * FROM chunks WHERE embedding IS NULL ORDER BY id LIMIT ?
    `).all(limit);
  }

  saveChunkEmbeddings(rows, vectors, model, dim) {
    const upd = this.db.prepare('UPDATE chunks SET embedding=?,embed_model=?,embed_dim=?,created_at=? WHERE id=?');
    const ts = nowIso();
    this.tx(() => {
      rows.forEach((r, i) => upd.run(JSON.stringify(vectors[i]), model, dim, ts, r.id));
    });
  }

  markVectorized(type, id) {
    if (type === 'news') this.db.prepare('UPDATE news SET vectorized=1 WHERE id=?').run(id);
  }

  vectorStatus() {
    const news = this.db.prepare('SELECT COUNT(*) total, SUM(vectorized) done FROM news').get();
    const corpus = this.db.prepare('SELECT COUNT(*) total FROM corpus').get();
    const terms = this.db.prepare('SELECT COUNT(*) total FROM terms').get();
    const ch = this.db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) embedded FROM chunks`).get();
    const byType = this.db.prepare(`
      SELECT source_type, COUNT(*) total, SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) embedded
      FROM chunks GROUP BY source_type
    `).all();
    return {
      news: { total: news.total, vectorized: news.done || 0 },
      corpus: { total: corpus.total },
      terms: { total: terms.total },
      chunks: { total: ch.total || 0, embedded: ch.embedded || 0 },
      byType,
      model: 'embedding-3',
      dim: 1024
    };
  }

  searchSources(qvec, { topK = 10, minScore = 0.2, caps = { news: 5, corpus: 3, term: 3 } } = {}) {
    const { cosine } = require('./embed');
    const rows = this.db.prepare(`
      SELECT c.source_type,c.source_id,c.chunk_index,c.content,c.embedding,
             n.title_en,n.title_zh,n.url,n.published_at,n.section,
             t.abbr,t.en_full,t.zh_name,t.note,
             p.en,p.zh,p.source_url,p.doc_id
      FROM chunks c
      LEFT JOIN news n ON c.source_type='news' AND n.id=c.source_id
      LEFT JOIN terms t ON c.source_type='term' AND t.term_id=c.source_id
      LEFT JOIN corpus p ON c.source_type='corpus' AND p.pair_id=c.source_id
      WHERE c.embedding IS NOT NULL
    `).all();
    const best = new Map();
    for (const r of rows) {
      const score = cosine(qvec, JSON.parse(r.embedding));
      if (score < minScore) continue;
      const key = `${r.source_type}:${r.source_id}`;
      if (!best.has(key) || best.get(key).score < score) {
        best.set(key, buildSource(r, score));
      }
    }
    const all = [...best.values()].sort((a, b) => b.score - a.score);
    const picked = [];
    const used = { news: 0, corpus: 0, term: 0 };
    for (const s of all) {
      if (used[s.type] >= (caps[s.type] ?? 3)) continue;
      used[s.type]++;
      picked.push(s);
      if (picked.length >= topK) break;
    }
    return picked.map((s, i) => ({ index: i + 1, ...s, score: Number(s.score.toFixed(4)) }));
  }

  stats() {
    const n = this.db.prepare(`SELECT COUNT(*) total, MIN(published_at) earliest, MAX(published_at) latest FROM news`).get();
    const sections = this.db.prepare(`SELECT section, COUNT(*) n FROM news GROUP BY section ORDER BY n DESC`).all();
    const terms = this.db.prepare('SELECT COUNT(*) c FROM terms').get().c;
    const corpus = this.db.prepare('SELECT COUNT(*) c FROM corpus').get().c;
    const chunks = this.db.prepare('SELECT COUNT(*) c FROM chunks').get().c;
    const embedded = this.db.prepare('SELECT COUNT(*) c FROM chunks WHERE embedding IS NOT NULL').get().c;
    const qa = this.db.prepare('SELECT COUNT(*) c FROM qa_log').get().c;
    const tr = this.db.prepare('SELECT COUNT(*) c FROM translation_log').get().c;
    const fileSize = ['', '-wal', '-shm'].reduce((sum, suf) => {
      const f = this.file + suf;
      return sum + (fs.existsSync(f) ? fs.statSync(f).size : 0);
    }, 0);
    return {
      news: n.total,
      terms,
      corpus,
      chunks,
      embedded,
      qa,
      translations: tr,
      earliest: n.earliest || '',
      latest: n.latest || '',
      sections,
      fileSize,
      newsVectorized: this.db.prepare('SELECT COUNT(*) c FROM news WHERE vectorized=1').get().c
    };
  }

  allNewsForExport() {
    return this.db.prepare(`SELECT id,title_en,title_zh,published_at,section,url,summary_zh,vectorized FROM news ORDER BY published_at DESC`).all();
  }
}

function normalizeParagraphs(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function toArray(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === 'string') return v.split(/[,，;；]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function buildSource(r, score) {
  if (r.source_type === 'news') {
    return {
      type: 'news',
      id: r.source_id,
      title: r.title_zh || r.title_en || r.source_id,
      title_en: r.title_en,
      snippet: r.content.replace(/^【标题】.*\n/m, '').slice(0, 420),
      score,
      url: r.url,
      date: (r.published_at || '').slice(0, 10),
      section: r.section,
      link: `https://insarag.org/`
    };
  }
  if (r.source_type === 'term') {
    return {
      type: 'term',
      id: r.source_id,
      title: `${r.abbr || ''}｜${r.zh_name || ''}`,
      snippet: `${r.en_full || ''}${r.note ? '（' + r.note + '）' : ''}`,
      score,
      url: 'https://www.insarag.org',
      date: '',
      link: '术语库'
    };
  }
  return {
    type: 'corpus',
    id: r.source_id,
    title: r.title_zh || r.title_en || (r.doc_id ? `平行语料 · ${r.doc_id}` : r.source_id),
    snippet: `EN: ${r.en || ''}\nZH: ${r.zh || ''}`.slice(0, 420),
    score,
    url: r.source_url,
    date: '',
    link: '平行语料库'
  };
}

function toNewsListItem(r) {
  return {
    id: r.id,
    seq: r.seq,
    title_en: r.title_en,
    title_zh: r.title_zh,
    summary_en: r.summary_en,
    summary_zh: r.summary_zh,
    section: r.section,
    published_at: r.published_at,
    url: r.url,
    author: r.author,
    tags: safeJson(r.tags, []),
    entities: safeJson(r.entities, {}),
    media: safeJson(r.media, []),
    attachments: safeJson(r.attachments, []),
    char_count_en: r.char_count_en,
    char_count_zh: r.char_count_zh,
    vectorized: !!r.vectorized,
    updated_at: r.updated_at
  };
}

function toNewsDetail(r) {
  return {
    ...toNewsListItem(r),
    content_en: r.content_en,
    content_zh: r.content_zh,
    paragraphs_en: safeJson(r.paragraphs_en, []),
    paragraphs_zh: safeJson(r.paragraphs_zh, []),
    categories: safeJson(r.categories, []),
    checksum: r.checksum,
    crawled_at: r.crawled_at,
    file_name: r.file_name,
    raw_json: safeJson(r.raw_json, {})
  };
}

module.exports = {
  Store, toNewsListItem, NEWS_FIELDS, CORPUS_FIELDS, TERM_FIELDS, CHUNK_FIELDS, INDEXES
};
