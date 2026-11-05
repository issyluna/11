'use strict';

/**
 * 任务 12-功能二：解析 INSARAG 中文指南术语表（xlsx）为结构化术语库
 * 零依赖实现：内置 ZIP 中央目录解析 + SpreadsheetML 解析
 * 用法：node scripts/parse-terms.cjs "<xlsx路径>"
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'terms.json');
const DEFAULT_XLSX = 'C:/Users/LEGION/Desktop/10.19 人工智能/INSARAG中文指南术语表.xlsx';

function readZip(buf) {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP/XLSX 文件');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
    if (!entries.has(name)) entries.set(name, { method, compSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return {
    has: (n) => entries.has(n),
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const lNameLen = buf.readUInt16LE(e.localOff + 26);
      const lExtraLen = buf.readUInt16LE(e.localOff + 28);
      const start = e.localOff + 30 + lNameLen + lExtraLen;
      const data = buf.slice(start, start + e.compSize);
      return e.method === 0 ? data : zlib.inflateRawSync(data);
    }
  };
}

const unescapeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

const textOf = (xml) => unescapeXml(
  [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')
).trim();

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
}

function colIndex(ref) {
  const letters = ref.replace(/[^A-Z]/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cm of rm[1].matchAll(/<c\s([^>]*?)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1];
      const body = cm[2];
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] || '';
      const type = /t="([^"]+)"/.exec(attrs)?.[1] || '';
      let value = '';
      if (type === 's') {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        value = v !== undefined ? (shared[Number(v)] || '') : '';
      } else if (type === 'inlineStr') {
        value = textOf(body);
      } else {
        value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || '');
      }
      cells[colIndex(ref)] = value;
    }
    rows.push(cells);
  }
  return rows;
}

function main() {
  const xlsxPath = process.argv[2] || DEFAULT_XLSX;
  if (!fs.existsSync(xlsxPath)) throw new Error(`找不到术语表文件：${xlsxPath}`);
  const zip = readZip(fs.readFileSync(xlsxPath));
  const shared = parseSharedStrings(zip.read('xl/sharedStrings.xml')?.toString('utf8'));
  const sheetXml = zip.read('xl/worksheets/sheet2.xml')?.toString('utf8')
    || zip.read('xl/worksheets/sheet1.xml')?.toString('utf8');
  if (!sheetXml) throw new Error('工作簿中没有找到工作表');
  const rows = parseSheet(sheetXml, shared);

  // 定位表头行（包含“缩写 / 英文全称 / 中文名称”）
  let headerIdx = rows.findIndex((r) => r.some((c) => c === '缩写') && r.some((c) => c === '英文全称'));
  if (headerIdx < 0) headerIdx = rows.findIndex((r) => r.some((c) => /英文/.test(c || '')));
  if (headerIdx < 0) throw new Error('无法识别术语表表头');
  const header = rows[headerIdx].map((c) => (c || '').trim());
  const idx = {
    abbr: header.findIndex((h) => h === '缩写'),
    en: header.findIndex((h) => h === '英文全称'),
    zh: header.findIndex((h) => h === '中文名称'),
    note: header.findIndex((h) => h === '备注'),
    seq: header.findIndex((h) => h === '序号')
  };

  const meta = {};
  for (let i = 0; i < headerIdx; i++) {
    const line = rows[i].filter(Boolean).join(' ');
    if (/来源/.test(line)) meta.sourceLine = line;
    else if (line && !meta.title) meta.title = line;
  }

  const terms = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const abbr = (r[idx.abbr] || '').trim();
    const en = (r[idx.en] || '').trim();
    const zh = (r[idx.zh] || '').trim();
    if (!abbr && !en && !zh) continue;
    if (/^序号$/.test(abbr) || /^缩写$/.test(abbr)) continue;
    const note = idx.note >= 0 ? (r[idx.note] || '').trim() : '';
    const seq = idx.seq >= 0 ? (r[idx.seq] || '').trim() : '';
    terms.push({
      term_id: `TERM-${String(terms.length + 1).padStart(3, '0')}`,
      seq: seq || String(terms.length + 1),
      abbr,
      en_full: en,
      zh_name: zh,
      note,
      category: '缩略词 / Abbreviation',
      source_ref: `${path.basename(xlsxPath)} · 工作表「术语表」· 第 ${i + 1} 行`,
      search_text: [abbr, en, zh, note].filter(Boolean).join(' | ')
    });
  }

  const out = {
    schema_version: '1.0.0',
    record_type: 'term_base',
    source: {
      file: path.basename(xlsxPath),
      sheet: '术语表',
      title: meta.title || 'INSARAG 中文指南术语表（缩略词）',
      provenance: meta.sourceLine || '《INSARAG 国际搜索与救援指南》第一卷《政策》· 缩略词表',
      publisher: '联合国人道主义事务协调办公室（OCHA）/ 中国地震应急搜救中心 译',
      official_site: 'https://www.insarag.org'
    },
    count: terms.length,
    generated_at: new Date().toISOString(),
    terms
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(`术语解析完成：${terms.length} 条 → ${OUT}`);
  console.log(terms.slice(0, 5).map((t) => `${t.abbr} = ${t.zh_name}（${t.en_full}）`).join('\n'));
}

main();
