'use strict';

/**
 * 全量构建：新闻 / 平行语料 / 术语 → SQLite → embedding-3 向量索引
 * 用法：node --no-warnings scripts/build-index.cjs
 */

const path = require('node:path');
const { Store } = require('../lib/db');
const { Config } = require('../lib/config');
const { vectorizePending } = require('../lib/rag');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

(async () => {
  const store = new Store(DATA);
  const cfg = new Config(DATA).value;
  console.log('数据库统计：', JSON.stringify(store.stats(), null, 2));
  console.log('向量化前：', JSON.stringify(store.vectorStatus()));
  const result = await vectorizePending(store, cfg, (p) => {
    if (p.phase === 'staged') console.log(`已切片暂存：${p.staged} 个（新闻 ${p.sources.news.length} / 语料 ${p.sources.corpus.length} / 术语 ${p.sources.terms.length}）`);
    if (p.phase === 'batch') console.log(`已向量化批次 ${p.embedded} 条（ids: ${p.ids.join(',')}）`);
  });
  console.log('\n向量化完成：', JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error('构建失败：', e.message);
  process.exit(1);
});
