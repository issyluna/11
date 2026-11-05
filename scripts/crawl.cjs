'use strict';

/**
 * 任务 09：INSARAG 官网新闻采集器
 * 数据源：WordPress REST API（https://insarag.org/wp-json/wp/v2/posts）
 * 输出：data/news/INSARAG-NEWS-<wp_id>.json，每篇新闻一个文件
 * 用法：node scripts/crawl.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const NEWS_DIR = path.join(ROOT, 'data', 'news');
const MEDIA_DIR = path.join(ROOT, 'data', 'media');
const API = 'https://insarag.org/wp-json/wp/v2/posts';

// 精选 10 条正文完整的新闻（覆盖全球新闻、亚太、AEME、IEC/R 四个板块）
const TARGETS = [
  { slug: 'insarag-community-responder-training-enhancing-civil-society-preparedness-in-the-kurdistan-region-iraq', section: 'Global News' },
  { slug: 'tot-ucc-sep25-in-ulm-empowering-trainers-for-effective-usar-coordination', section: 'Global News' },
  { slug: 'asia-pacific-usar-team-coordination-course-in-the-republic-of-korea-23-27-march-2026', section: 'Asia-Pacific News' },
  { slug: 'new-national-usar-doctrine-and-guidelines-integrating-insarag-standards-for-responders-in-france', section: 'AEME News' },
  { slug: 'iec-egy-01', section: 'IEC/R News' },
  { slug: 'isg-2025-chairmans-summary', section: 'Global News' },
  { slug: 'irnap-china', section: 'Asia-Pacific News' },
  { slug: 'flood-response-working-group-reference-notes', section: 'Global News' },
  { slug: 'exercise-hosting-coordination-framework-in-qatar', section: 'Global News' },
  { slug: 'iec-ger-01', section: 'IEC/R News' }
];

const COUNTRY_LEXICON = [
  'Iraq', 'Kurdistan', 'Germany', 'Austria', 'Switzerland', 'Luxembourg', 'France', 'Egypt',
  'China', 'Republic of Korea', 'Korea', 'Qatar', 'Italy', 'Japan', 'Turkey', 'Türkiye',
  'Indonesia', 'Malaysia', 'Thailand', 'Vietnam', 'Philippines', 'Singapore', 'Myanmar',
  'Cambodia', 'Laos', 'Brunei', 'India', 'Pakistan', 'Nepal', 'Bangladesh', 'Sri Lanka',
  'United States', 'Mexico', 'Colombia', 'Chile', 'Argentina', 'Brazil', 'Peru',
  'United Kingdom', 'Netherlands', 'Belgium', 'Spain', 'Portugal', 'Poland', 'Ukraine',
  'Lebanon', 'Jordan', 'Palestine', 'Syria', 'Morocco', 'Algeria', 'Tunisia', 'Libya',
  'South Africa', 'Kenya', 'Ethiopia', 'Australia', 'New Zealand', 'Canada'
];

const ORG_LEXICON = [
  'INSARAG', 'OCHA', 'United Nations', 'UN', 'THW', 'Technisches Hilfswerk', 'Lekhwiya',
  'IEC', 'IER', 'ISG', 'DACHL', 'EU MODEX', 'European Union', 'Red Cross', 'IFRC'
];

const THEME_RULES = [
  ['community responder', ['community responder training', 'civil society preparedness', 'first responder']],
  ['USAR coordination', ['usar coordination', 'coordination course', 'uc course', 'team leaders']],
  ['capacity building', ['capacity building', 'training', 'doctrine', 'guidelines']],
  ['IEC/R classification', ['external classification', 'iec', 'ier', 'reclassification', 'classified']],
  ['flood response', ['flood', 'water rescue']],
  ['governance', ['steering group', 'isg', 'chairman', 'global meeting']],
  ['regional cooperation', ['regional', 'asia-pacific', 'aeme', 'americas', 'exercise']]
];

const decodeEntities = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&apos;|&#039;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&ndash;/g, '–')
  .replace(/&mdash;/g, '—')
  .replace(/&hellip;/g, '…')
  .replace(/&rsquo;/g, '’')
  .replace(/&lsquo;/g, '‘')
  .replace(/&ldquo;/g, '“')
  .replace(/&rdquo;/g, '”');

const stripTags = (html) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function extractParagraphs(html) {
  const out = [];
  const ps = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  for (const m of ps) {
    const t = stripTags(m[1]);
    if (t && !out.includes(t)) out.push(t);
  }
  // 少数正文使用列表项
  if (!out.length) {
    for (const m of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
      const t = stripTags(m[1]);
      if (t) out.push(t);
    }
  }
  return out;
}

function extractImages(html) {
  return [...new Set([...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => decodeEntities(m[1])))]
    .filter((u) => /\.(jpe?g|png|webp|gif)$/i.test(u))
    .map((u) => (u.startsWith('//') ? 'https:' + u : u.startsWith('/') ? 'https://insarag.org' + u : u));
}

function extractPdfs(html) {
  return [...new Set([...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => decodeEntities(m[1])))]
    .map((u) => (u.startsWith('//') ? 'https:' + u : u.startsWith('/') ? 'https://insarag.org' + u : u));
}

function extractEntities(text, title) {
  const hay = `${title}\n${text}`;
  const countries = COUNTRY_LEXICON.filter((c) => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(hay));
  const organizations = ORG_LEXICON.filter((o) => new RegExp(`\\b${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(hay));
  const themes = THEME_RULES.filter(([, kws]) => kws.some((k) => hay.toLowerCase().includes(k))).map(([t]) => t);
  const teams = [...new Set([...hay.matchAll(/\b([A-Z]{3}-\d{2})\b/g)].map((m) => m[1]))];
  const regions = [];
  if (/asia[- ]pacific|korea|china|japan/i.test(hay)) regions.push('Asia-Pacific');
  if (/africa|europe|middle east|france|germany|egypt|qatar|iraq|italy/i.test(hay)) regions.push('Africa-Europe-Middle East');
  if (/america|colombia|mexico|chile|brazil/i.test(hay)) regions.push('Americas');
  return { countries, regions, organizations, usar_teams: teams, themes };
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; INSARAG-course-crawler/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function downloadImage(url, docId, index) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return null;
    const ext = (url.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const name = `${docId}-${index + 1}.${ext}`;
    fs.writeFileSync(path.join(MEDIA_DIR, name), buf);
    return { file: name, bytes: buf.length };
  } catch {
    return null;
  }
}

async function main() {
  fs.mkdirSync(NEWS_DIR, { recursive: true });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const collected = [];

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    const url = `${API}?slug=${encodeURIComponent(t.slug)}&_embed=wp:term,wp:featuredmedia`;
    const arr = await fetchJson(url);
    if (!arr.length) {
      console.warn(`[skip] 未找到：${t.slug}`);
      continue;
    }
    const p = arr[0];
    const title = stripTags(p.title.rendered);
    const paragraphs = extractParagraphs(p.content.rendered);
    const plain = paragraphs.join('\n\n');
    const excerpt = stripTags(p.excerpt.rendered);
    const images = extractImages(p.content.rendered);
    const pdfs = extractPdfs(p.content.rendered);
    const docId = `INSARAG-NEWS-${p.id}`;
    const year = (p.date || '').slice(0, 4);

    const media = [];
    for (let k = 0; k < Math.min(images.length, 3); k++) {
      const dl = await downloadImage(images[k], docId, k);
      media.push({
        type: 'image',
        url: images[k],
        local_path: dl ? `data/media/${dl.file}` : '',
        alt: `${title} - image ${k + 1}`,
        caption: '',
        downloaded_bytes: dl?.bytes || 0
      });
    }

    const record = {
      $schema: '../news_schema.json',
      schema_version: '1.0.0',
      doc_id: docId,
      record_type: 'news',
      seq: i + 1,
      source: {
        publisher: 'INSARAG',
        publisher_full: 'International Search and Rescue Advisory Group (INSARAG), UN OCHA',
        site: 'https://insarag.org',
        section: t.section,
        canonical_url: p.link,
        wp_post_id: p.id,
        language: 'en',
        license_note: '版权归 INSARAG / 联合国人道主义事务协调办公室（OCHA）所有，此处仅用于教学与研究。'
      },
      title_en: title,
      title_zh: '',
      slug: p.slug,
      summary_en: excerpt,
      summary_zh: '',
      body: {
        paragraphs_en: paragraphs,
        paragraphs_zh: [],
        plain_text_en: plain,
        plain_text_zh: '',
        char_count_en: plain.length,
        char_count_zh: 0
      },
      published_at: p.date ? `${p.date}+00:00` : '',
      modified_at: p.modified ? `${p.modified}+00:00` : '',
      authors: ['INSARAG Secretariat'],
      categories: [...new Set((p._embedded?.['wp:term']?.[0] || []).map((x) => x.name))],
      tags: [...new Set((p._embedded?.['wp:term']?.[1] || []).map((x) => x.name))],
      entities: extractEntities(plain, title),
      media,
      attachments: pdfs.map((u) => ({ type: 'pdf', title: decodeURIComponent(u.split('/').pop() || 'attachment.pdf'), url: u })),
      knowledge: {
        chunk_strategy: 'bilingual-paragraph-400',
        chunks: 0,
        embedding_model: 'embedding-3',
        embedding_dim: 1024,
        indexed: false
      },
      provenance: {
        crawled_at: new Date().toISOString(),
        crawler: 'insarag-crawler/1.0',
        http_status: 200,
        parser: 'wp-rest+html-normalize',
        content_sha256: crypto.createHash('sha256').update(plain).digest('hex'),
        source_snapshot: `data/raw/${p.slug}.json`,
        translation_status: 'pending'
      },
      translation: {
        method: 'deepseek-chat',
        alignment: 'sentence-1to1',
        translated_at: ''
      }
    };

    // 保留服务端原始响应，便于溯源与复现
    const rawDir = path.join(ROOT, 'data', 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(path.join(rawDir, `${p.slug}.json`), JSON.stringify(arr[0], null, 2), 'utf8');

    const file = path.join(NEWS_DIR, `${docId}.json`);
    fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf8');
    collected.push({ doc_id: docId, title, chars: plain.length, media: media.length, file });
    console.log(`[ok] ${docId} | ${year} | ${plain.length} chars | ${title}`);
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`\n完成：${collected.length} 条新闻 → ${NEWS_DIR}`);
}

main().catch((e) => {
  console.error('采集失败：', e.message);
  process.exit(1);
});
