'use strict';

/**
 * 任务 12-功能一：用 Deepseek 生成中文译文，并构建 1:1 句级平行语料库
 * 输入：data/news/*.json（英文原文）
 * 输出：回填 title_zh / summary_zh / paragraphs_zh，生成 data/parallel_corpus_1to1.json
 * 用法：node scripts/translate-news.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const NEWS_DIR = path.join(ROOT, 'data', 'news');
const CORPUS_FILE = path.join(ROOT, 'data', 'parallel_corpus_1to1.json');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));

const SYSTEM_PROMPT = `You are a senior English-to-Chinese translator for humanitarian search-and-rescue documentation (INSARAG / USAR domain).
Rules:
1. Translate into Simplified Chinese, faithful and professional; do not add or omit information.
2. Use standard INSARAG terminology, e.g. USAR = 城市搜索与救援, USAR team = USAR 救援队, AoO = 行动区域, BoO = 行动基地, IEC = 国际外部评估, IER = 国际演练与复评, AAR = 行动后报告, CRT = 社区响应者培训, ToT = 培训师培训, ISG = 指导小组.
3. Translate each English sentence into exactly ONE Chinese sentence, keeping the same order and count. Never merge or split sentences.
4. Keep abbreviations, team codes (e.g. GER-01), numbers, dates and proper names accurate.
5. Return STRICT JSON only, no markdown fences, no explanation.`;

function splitSentences(text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  // 保护常见缩写中的点号，避免误切
  const protectedText = normalized
    .replace(/\b(e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|No|St|Prof)\./gi, (m) => m.replace('.', '§'))
    .replace(/\b([A-Z])\./g, '$1§');
  const raw = protectedText
    .split(/(?<=[.!?])\s+(?=[“"'(]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/§/g, '.'));
  // 过长的“句子”按分号 / 逗号再切，保证语料粒度适中
  const out = [];
  for (const s of raw) {
    if (s.length <= 320) { out.push(s); continue; }
    let buf = '';
    for (const part of s.split(/(?<=[;:])\s+/)) {
      if ((buf + ' ' + part).trim().length > 260 && buf) { out.push(buf.trim()); buf = part; }
      else buf = (buf + ' ' + part).trim();
    }
    if (buf) out.push(buf.trim());
  }
  return out;
}

async function callDeepseek(payload, attempt = 0) {
  const res = await fetch(CONFIG.deepseek_base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CONFIG.deepseek_key },
    body: JSON.stringify({
      model: CONFIG.deepseek_model,
      temperature: 0.15,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) }
      ]
    })
  });
  const text = await res.text();
  if (!res.ok) {
    if (attempt < 2 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
      return callDeepseek(payload, attempt + 1);
    }
    throw new Error(`Deepseek HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const j = JSON.parse(text);
  let content = j.choices?.[0]?.message?.content || '';
  content = content.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(content);
  return { parsed, usage: j.usage };
}

async function translateArticle(rec) {
  const paragraphs = rec.body.paragraphs_en;
  const payload = {
    task: 'translate_en_to_zh_sentence_by_sentence',
    title: rec.title_en,
    summary: rec.summary_en,
    paragraphs: paragraphs.map((p, i) => ({ index: i, sentences: splitSentences(p) })),
    output_format: {
      title_zh: 'string',
      summary_zh: 'string',
      paragraphs: [{ index: 0, zh_sentences: ['one Chinese sentence per English sentence, same order and count'] }]
    }
  };
  const { parsed } = await callDeepseek(payload);
  if (!parsed || !Array.isArray(parsed.paragraphs)) throw new Error('译文 JSON 结构缺失 paragraphs');

  const zhByIndex = new Map();
  for (const p of parsed.paragraphs) zhByIndex.set(Number(p.index), p.zh_sentences || []);
  const paragraphsZh = [];
  const pairs = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const sents = splitSentences(paragraphs[i]);
    const zh = zhByIndex.get(i) || [];
    if (zh.length !== sents.length) {
      throw new Error(`第 ${i + 1} 段句数不匹配：EN ${sents.length} / ZH ${zh.length}`);
    }
    paragraphsZh.push(zh.join(''));
    sents.forEach((en, k) => {
      pairs.push({
        en,
        zh: zh[k],
        paragraph_index: i,
        sentence_index: k
      });
    });
  }
  rec.title_zh = parsed.title_zh || '';
  rec.summary_zh = parsed.summary_zh || '';
  rec.body.paragraphs_zh = paragraphsZh;
  rec.body.plain_text_zh = paragraphsZh.join('\n\n');
  rec.body.char_count_zh = rec.body.plain_text_zh.length;
  rec.provenance.translation_status = 'done';
  rec.translation.translated_at = new Date().toISOString();
  rec.knowledge.chunks = paragraphsZh.length;
  return pairs;
}

async function main() {
  const files = fs.readdirSync(NEWS_DIR).filter((f) => f.endsWith('.json')).sort();
  const allPairs = [];
  let done = 0;
  for (const f of files) {
    const file = path.join(NEWS_DIR, f);
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (rec.provenance?.translation_status === 'done' && rec.body.paragraphs_zh?.length) {
      // 已有译文：仅重建语料对
      const pairs = [];
      rec.body.paragraphs_en.forEach((p, i) => {
        const sents = splitSentences(p);
        const zhSents = splitSentences(rec.body.paragraphs_zh[i] || '');
        sents.forEach((en, k) => pairs.push({ en, zh: zhSents[k] || '', paragraph_index: i, sentence_index: k }));
      });
      allPairs.push(...pairs.map((p) => ({ ...p, rec })));
      console.log(`[skip] 已有译文 ${rec.doc_id}`);
      continue;
    }
    let pairs = null;
    for (let attempt = 1; attempt <= 3 && !pairs; attempt++) {
      try {
        pairs = await translateArticle(rec);
      } catch (e) {
        console.warn(`[retry ${attempt}] ${rec.doc_id}: ${e.message}`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    if (!pairs) {
      console.error(`[fail] ${rec.doc_id} 翻译失败，稍后重跑本脚本即可续传`);
      continue;
    }
    fs.writeFileSync(file, JSON.stringify(rec, null, 2), 'utf8');
    allPairs.push(...pairs.map((p) => ({ ...p, rec })));
    done++;
    console.log(`[ok] ${rec.doc_id} | 中文 ${rec.body.char_count_zh} 字符 | 句对 ${pairs.length}`);
    await new Promise((r) => setTimeout(r, 600));
  }

  const pairs = allPairs
    .filter((p) => p.en && p.zh)
    .map((p, i) => ({
      pair_id: `PC-${String(i + 1).padStart(4, '0')}`,
      en: p.en,
      zh: p.zh,
      doc_id: p.rec.doc_id,
      title_en: p.rec.title_en,
      title_zh: p.rec.title_zh,
      source_url: p.rec.source.canonical_url,
      published_at: p.rec.published_at,
      section: p.rec.source.section,
      paragraph_index: p.paragraph_index,
      sentence_index: p.sentence_index,
      char_count_en: p.en.length,
      char_count_zh: p.zh.length,
      quality: 'machine-translated (deepseek-chat), 1:1 sentence alignment'
    }));

  const corpus = {
    schema_version: '1.0.0',
    record_type: 'parallel_corpus',
    corpus_name: 'INSARAG USAR 英中平行语料库',
    source_language: 'en',
    target_language: 'zh',
    alignment: '1:1 sentence',
    domain: 'urban search and rescue / humanitarian coordination (INSARAG)',
    translation_engine: 'deepseek-chat',
    generated_at: new Date().toISOString(),
    documents: files.length,
    count: pairs.length,
    pairs
  };
  fs.writeFileSync(CORPUS_FILE, JSON.stringify(corpus, null, 2), 'utf8');
  console.log(`\n完成：${done} 篇新译文，平行语料 ${pairs.length} 对 → ${CORPUS_FILE}`);
}

main().catch((e) => {
  console.error('处理失败：', e.message);
  process.exit(1);
});
