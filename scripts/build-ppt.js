'use strict';

/**
 * INSARAG Hub 功能汇报 PPT 生成脚本
 * Ocean Gradient 深蓝科技风 + 金色点缀
 * 幻灯片尺寸：LAYOUT_16x9 (10" × 5.625")
 */

const PptxGenJS = require('pptxgenjs');
const fs = require('node:fs');
const path = require('node:path');

// ============================================================
// SLIDE DIMENSIONS
// ============================================================
const SLIDE_W = 10;
const SLIDE_H = 5.625;
const MARGIN = 0.5;
const CONTENT_X = MARGIN;
const CONTENT_Y = MARGIN;
const CONTENT_W = SLIDE_W - 2 * MARGIN;
const CONTENT_H = SLIDE_H - 2 * MARGIN;

// ============================================================
// COLOR PALETTE — Ocean Gradient + Gold Accent
// ============================================================
const C = {
  navy:    '0B1E3A',   // 主背景深海军蓝
  deep:    '065A82',   // 深蓝主色
  teal:    '1C7293',   // 青色次色
  gold:    'E8C547',   // 金色点缀
  ice:     'CADCFC',   // 冰蓝浅色
  bgLight: 'F0F7FA',   // 浅蓝背景
  textDark:'0B1E3A',   // 深色正文
  textLight:'FFFFFF',  // 白色
  muted:   '6B7A8A',   // 灰色辅助文字
  cyan:    '8FDFFF',   // 青蓝高亮
};

// ============================================================
// CONTAINER SYSTEM WITH TEXT OVERFLOW PROTECTION — REQUIRED
// ============================================================
function createVirtualNode(type, data, parentX = 0, parentY = 0) {
  const opts = data.opts || {};
  const node = {
    type, data,
    absX: parentX + (opts.x || 0),
    absY: parentY + (opts.y || 0),
    w: opts.w || 0, h: opts.h || 0,
    children: []
  };
  node.addShape = function(shapeType, opts = {}) {
    const child = createVirtualNode('shape', { shapeType, opts }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  node.addText = function(text, opts = {}) {
    const safeOpts = { fit: "shrink", ...opts };
    const child = createVirtualNode('text', { text, opts: safeOpts }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  node.addImage = function(opts = {}) {
    const child = createVirtualNode('image', { opts }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  return node;
}
function flattenNode(node, realSlide) {
  const absOpts = { ...node.data.opts, x: node.absX, y: node.absY };
  if (node.type === 'shape') realSlide.addShape(node.data.shapeType, absOpts);
  else if (node.type === 'text') realSlide.addText(node.data.text, absOpts);
  else if (node.type === 'image') realSlide.addImage(absOpts);
  node.children.forEach(child => flattenNode(child, realSlide));
}

function setupPres(pres) {
  const orig = pres.addSlide.bind(pres);
  pres.addSlide = function(options) {
    const realSlide = orig(options);
    const virtualSlide = {
      children: [],
      set background(val) { realSlide.background = val; },
      get background() { return realSlide.background; },
      addShape(type, opts = {}) {
        const node = createVirtualNode('shape', { shapeType: type, opts });
        this.children.push(node);
        return node;
      },
      addText(text, opts = {}) {
        const safeOpts = { fit: "shrink", ...opts };
        const node = createVirtualNode('text', { text, opts: safeOpts });
        this.children.push(node);
        return node;
      },
      addImage(opts = {}) {
        const node = createVirtualNode('image', { opts });
        this.children.push(node);
        return node;
      },
      render() {
        this.children.forEach(child => flattenNode(child, realSlide));
      }
    };
    return virtualSlide;
  };
}

// ============================================================
// 辅助函数
// ============================================================
function rect(x, y, w, h, fill) {
  return { x, y, w, h, fill: { color: fill } };
}

function slideTitleBar(slide, title, subtitle = '') {
  // 左侧金色竖条 + 标题 + 右侧分隔线
  slide.addShape('rect', rect(CONTENT_X, CONTENT_Y, 0.08, 0.5, C.gold));
  slide.addText(title, {
    x: CONTENT_X + 0.2, y: CONTENT_Y - 0.05, w: CONTENT_W - 0.5, h: 0.55,
    fontSize: 28, fontFace: 'Cambria', bold: true, color: C.navy, charSpacing: 1.5
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: CONTENT_X + 0.2, y: CONTENT_Y + 0.45, w: CONTENT_W - 0.5, h: 0.28,
      fontSize: 11, fontFace: 'Calibri', color: C.muted, italic: true
    });
  }
  // 底部分隔线
  slide.addShape('rect', rect(CONTENT_X, CONTENT_Y + 0.9, CONTENT_W, 0.012, C.ice));
}

function pageFooter(slide, n, total) {
  slide.addShape('rect', rect(CONTENT_X, SLIDE_H - 0.35, CONTENT_W, 0.01, C.ice));
  slide.addText('北京语言大学 · 人工智能辅助翻译 · 2026 秋季学期', {
    x: CONTENT_X, y: SLIDE_H - 0.3, w: CONTENT_W - 0.6, h: 0.22,
    fontSize: 9, fontFace: 'Calibri', color: C.muted, align: 'left'
  });
  slide.addText(`${n} / ${total}`, {
    x: SLIDE_W - CONTENT_X - 0.5, y: SLIDE_H - 0.3, w: 0.5, h: 0.22,
    fontSize: 9, fontFace: 'Calibri', color: C.muted, align: 'right'
  });
}

// ============================================================
// 开始
// ============================================================
const pres = new PptxGenJS();
pres.layout = 'LAYOUT_16x9';
pres.author = 'Trae AI Agent';
pres.subject = 'INSARAG Hub 功能汇报';
setupPres(pres);

const TOTAL_SLIDES = 11;

// --- 幻灯片 1: 封面 ---
let s1 = pres.addSlide();
s1.background = { color: C.navy };
// 装饰圆环
s1.addShape('ellipse', { x: 6.5, y: -1.5, w: 5, h: 5, fill: { color: C.deep, transparency: 70 }, line: { color: C.teal, width: 1 } });
s1.addShape('ellipse', { x: 7.5, y: 0.5, w: 3.5, h: 3.5, fill: { color: C.gold, transparency: 85 }, line: { color: C.gold, width: 1 } });
// 左侧金色装饰条
s1.addShape('rect', rect(0.5, 1.8, 0.08, 2.2, C.gold));
// 主标题
s1.addText('INSARAG Hub', {
  x: 0.75, y: 1.3, w: 9, h: 0.9,
  fontSize: 44, fontFace: 'Cambria', bold: true, color: C.textLight, charSpacing: 3
});
s1.addText('东盟多语翻译与应急知识平台', {
  x: 0.75, y: 2.25, w: 9, h: 0.65,
  fontSize: 24, fontFace: 'Cambria', color: C.cyan, charSpacing: 1.5
});
// 副标题说明
s1.addText('INSARAG 新闻 · 术语 · 平行语料 三大知识底座', {
  x: 0.75, y: 3.05, w: 9, h: 0.35,
  fontSize: 12, fontFace: 'Calibri', color: C.ice, italic: true
});
s1.addText('RAG 智能问答 · 东盟 10 语种互译 · CMS 内容管理', {
  x: 0.75, y: 3.45, w: 9, h: 0.35,
  fontSize: 12, fontFace: 'Calibri', color: C.ice, italic: true
});
// 底部信息
s1.addText('北京语言大学 · 人工智能辅助翻译 · 2026 年秋季学期', {
  x: 0.5, y: 4.8, w: 9, h: 0.32,
  fontSize: 11, fontFace: 'Calibri', color: C.muted, align: 'center'
});
s1.addText('期末作业汇报 · Trae AI Agent 辅助开发', {
  x: 0.5, y: 5.15, w: 9, h: 0.28,
  fontSize: 10, fontFace: 'Calibri', color: C.muted, align: 'center', italic: true
});
s1.render();

// --- 幻灯片 2: 目录 ---
let s2 = pres.addSlide();
slideTitleBar(s2, '汇报目录', 'Agenda');
pageFooter(s2, 2, TOTAL_SLIDES);

const sections = [
  { num: '01', title: '项目背景与目标', desc: '为什么做这个平台' },
  { num: '02', title: '技术架构', desc: '零依赖 Node.js + SQLite + RAG' },
  { num: '03', title: '新闻采集与 CMS', desc: '任务 09-10：抓取 + 增删改查' },
  { num: '04', title: 'RAG 智能问答', desc: '任务 11：Deepseek 流式回答' },
  { num: '05', title: '东盟多语翻译', desc: '任务 12：术语/语料/新闻 RAG 增强' },
  { num: '06', title: '数据资产与总结', desc: '向量统计 + 汇报总结' },
];

const colW = CONTENT_W / 2 - 0.15;
sections.forEach((sec, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = CONTENT_X + col * (colW + 0.3);
  const y = CONTENT_Y + 1.15 + row * 1.3;

  // 卡片
  s2.addShape('rect', {
    x, y, w: colW, h: 1.1,
    fill: { color: C.bgLight }, line: { color: C.ice, width: 0.75 }
  });
  // 编号（金色大字）
  s2.addText(sec.num, {
    x: x + 0.15, y: y + 0.05, w: 0.7, h: 0.55,
    fontSize: 24, fontFace: 'Cambria', bold: true, color: C.gold, charSpacing: 1
  });
  // 标题
  s2.addText(sec.title, {
    x: x + 0.85, y: y + 0.08, w: colW - 1, h: 0.4,
    fontSize: 15, fontFace: 'Cambria', bold: true, color: C.navy
  });
  // 描述
  s2.addText(sec.desc, {
    x: x + 0.85, y: y + 0.5, w: colW - 1, h: 0.3,
    fontSize: 11, fontFace: 'Calibri', color: C.muted
  });
});
s2.render();

// --- 幻灯片 3: 项目背景 ---
let s3 = pres.addSlide();
slideTitleBar(s3, '项目背景与目标', 'Project Background');
pageFooter(s3, 3, TOTAL_SLIDES);

// 左侧：背景描述
const leftX = CONTENT_X, leftW = CONTENT_W * 0.48;
s3.addShape('rect', rect(leftX, CONTENT_Y + 1.1, leftW, 4.0, C.bgLight));
s3.addText('背景', {
  x: leftX + 0.2, y: CONTENT_Y + 1.2, w: leftW - 0.4, h: 0.3,
  fontSize: 12, fontFace: 'Calibri', bold: true, color: C.teal, letterSpacing: 2
});
s3.addText([
  { text: 'INSARAG（国际搜索与救援咨询团）拥有丰富的标准、术语与最佳实践，但这些知识散布在官网 PDF、指南手册和新闻稿中。', options: { bullet: true } },
  { text: '救援队伍需要快速检索 USAR 术语、查找平行语料、翻译作业指令。', options: { bullet: true } },
  { text: '本项目将这些异构信息统一到一个 RAG 增强的智能平台。', options: { bullet: true } },
], {
  x: leftX + 0.2, y: CONTENT_Y + 1.55, w: leftW - 0.4, h: 1.8,
  fontSize: 13, fontFace: 'Calibri', color: C.textDark, paraSpaceAfter: 8
});

s3.addText('目标', {
  x: leftX + 0.2, y: CONTENT_Y + 3.55, w: leftW - 0.4, h: 0.3,
  fontSize: 12, fontFace: 'Calibri', bold: true, color: C.teal, letterSpacing: 2
});
s3.addText([
  { text: '抓取 10 篇官网新闻并生成标准化 JSON 元数据', options: { bullet: true } },
  { text: '实现 CMS 增删改查，支持新闻入库与向量重建', options: { bullet: true } },
  { text: '构建跨新闻/术语/语料的 RAG 智能问答', options: { bullet: true } },
  { text: '提供东盟 10 语种翻译，三重 RAG 提升质量', options: { bullet: true } },
], {
  x: leftX + 0.2, y: CONTENT_Y + 3.9, w: leftW - 0.4, h: 1.1,
  fontSize: 12, fontFace: 'Calibri', color: C.textDark, paraSpaceAfter: 5
});

// 右侧：四个大数字
const rightX = CONTENT_X + leftW + 0.3, rightW = CONTENT_W - leftW - 0.3;
const stats = [
  { num: '10', label: 'INSARAG 新闻' },
  { num: '74', label: '标准术语' },
  { num: '76', label: '平行语料对' },
  { num: '179', label: '向量切片' },
];
stats.forEach((s, i) => {
  const cardY = CONTENT_Y + 1.15 + i * 0.9;
  s3.addShape('rect', rect(rightX, cardY, rightW, 0.75, C.navy));
  s3.addText(s.num, {
    x: rightX + 0.15, y: cardY + 0.02, w: 1.8, h: 0.7,
    fontSize: 32, fontFace: 'Cambria', bold: true, color: C.gold, align: 'center', charSpacing: 1
  });
  s3.addShape('rect', rect(rightX + 1.95, cardY + 0.2, 0.04, 0.35, C.gold));
  s3.addText(s.label, {
    x: rightX + 2.15, y: cardY + 0.15, w: rightW - 2.3, h: 0.45,
    fontSize: 13, fontFace: 'Calibri', color: C.textLight, bold: true
  });
});
s3.render();

// --- 幻灯片 4: 技术架构 ---
let s4 = pres.addSlide();
slideTitleBar(s4, '技术架构', 'Technology Stack');
pageFooter(s4, 4, TOTAL_SLIDES);

// 四层架构图（原生形状）
const layers = [
  { label: '前端展示层', color: C.navy, items: ['原生 HTML/CSS/JS', '7 个模块页面', 'SSE 流式渲染'] },
  { label: '后端服务层', color: C.deep, items: ['node:http 零依赖', 'REST API + SSE', 'PM2 托管'] },
  { label: '数据存储层', color: C.teal, items: ['SQLite WAL 模式', '179 个向量切片', 'JSON 原始资产'] },
  { label: 'AI 能力层', color: C.gold, items: ['embedding-3 向量化', 'Deepseek 流式生成', '跨库余弦检索'] },
];

layers.forEach((layer, i) => {
  const ly = CONTENT_Y + 1.15 + i * 1.05;
  const lh = 0.9;
  // 背景条
  s4.addShape('rect', {
    x: CONTENT_X, y: ly, w: CONTENT_W, h: lh,
    fill: { color: layer.color }, line: { color: layer.color, width: 0 }
  });
  // 层级标签
  s4.addText(layer.label, {
    x: CONTENT_X + 0.2, y: ly + 0.18, w: 2.0, h: 0.5,
    fontSize: 16, fontFace: 'Cambria', bold: true, color: layer.color === C.gold ? C.navy : C.textLight,
    charSpacing: 1
  });
  // 右侧三个技术项
  layer.items.forEach((item, j) => {
    const ix = CONTENT_X + 2.25 + j * ((CONTENT_W - 2.25) / 3);
    const iw = (CONTENT_W - 2.25) / 3 - 0.1;
    s4.addShape('rect', {
      x: ix, y: ly + 0.18, w: iw, h: 0.55,
      fill: { color: layer.color === C.gold ? C.navy : 'FFFFFF', transparency: layer.color === C.gold ? 0 : 10 },
      line: { color: C.textLight, width: 0.5 }
    });
    s4.addText(item, {
      x: ix, y: ly + 0.22, w: iw, h: 0.45,
      fontSize: 11, fontFace: 'Calibri', color: C.textLight, align: 'center'
    });
  });
});

// 底部技术说明
s4.addText('零依赖设计：全程仅使用 Node.js 内置模块（node:http / node:sqlite / 全局 fetch），无需 npm install 即可启动。', {
  x: CONTENT_X, y: SLIDE_H - 0.8, w: CONTENT_W, h: 0.3,
  fontSize: 11, fontFace: 'Calibri', color: C.muted, italic: true
});
s4.render();

// --- 幻灯片 5: 新闻采集与 CMS ---
let s5 = pres.addSlide();
slideTitleBar(s5, '新闻采集与 CMS', 'Tasks 09-10: Crawling & Content Management');
pageFooter(s5, 5, TOTAL_SLIDES);

// 左侧：采集流程
const lCardX = CONTENT_X, lCardW = CONTENT_W * 0.46;
s5.addShape('rect', rect(lCardX, CONTENT_Y + 1.1, lCardW, 1.85, C.bgLight));
s5.addText('任务 09 · INSARAG 新闻采集', {
  x: lCardX + 0.15, y: CONTENT_Y + 1.15, w: lCardW - 0.3, h: 0.32,
  fontSize: 13, fontFace: 'Cambria', bold: true, color: C.deep
});
s5.addText([
  { text: '数据源：INSARAG WordPress REST API', options: { bullet: true } },
  { text: '10 篇新闻覆盖 Global / Asia-Pacific / AEME / IEC-R', options: { bullet: true } },
  { text: '四层元数据：source / content / semantic / provenance', options: { bullet: true } },
  { text: '配图下载、原文快照、内容 SHA-256 指纹', options: { bullet: true } },
], {
  x: lCardX + 0.2, y: CONTENT_Y + 1.5, w: lCardW - 0.3, h: 1.4,
  fontSize: 11, fontFace: 'Calibri', color: C.textDark, paraSpaceAfter: 4
});

// 中间分隔箭头
s5.addShape('rect', rect(CONTENT_X + lCardW + 0.02, CONTENT_Y + 2.0, 0.1, 0.6, C.gold));

// 右侧：CMS 功能
const rCardX = CONTENT_X + lCardW + 0.3;
const rCardW = CONTENT_W - lCardW - 0.3;
s5.addShape('rect', rect(rCardX, CONTENT_Y + 1.1, rCardW, 1.85, C.bgLight));
s5.addText('任务 10 · CMS 增删改查', {
  x: rCardX + 0.15, y: CONTENT_Y + 1.15, w: rCardW - 0.3, h: 0.32,
  fontSize: 13, fontFace: 'Cambria', bold: true, color: C.deep
});
s5.addText([
  { text: '完整 CRUD：创建 / 编辑 / 删除 / 搜索 / 分页', options: { bullet: true } },
  { text: '保存时双写 SQLite + 对应 JSON 文件', options: { bullet: true } },
  { text: '自动标记为「待重新向量化」，保证知识库一致性', options: { bullet: true } },
  { text: '中英文标题 / 摘要 / 正文 / 标签 / 国家字段', options: { bullet: true } },
], {
  x: rCardX + 0.2, y: CONTENT_Y + 1.5, w: rCardW - 0.3, h: 1.4,
  fontSize: 11, fontFace: 'Calibri', color: C.textDark, paraSpaceAfter: 4
});

// 底部截图区域（用占位框）
const shotY = CONTENT_Y + 3.1;
s5.addText('功能预览', {
  x: CONTENT_X, y: shotY - 0.05, w: CONTENT_W, h: 0.3,
  fontSize: 11, fontFace: 'Calibri', bold: true, color: C.muted, letterSpacing: 2
});
const shotW = (CONTENT_W - 0.2) / 2;
s5.addShape('rect', { x: CONTENT_X, y: shotY + 0.2, w: shotW, h: 1.9, fill: { color: C.bgLight }, line: { color: C.ice } });
s5.addImage({ path: 'screenshots/09-news-json.png', x: CONTENT_X + 0.05, y: shotY + 0.25, w: shotW - 0.1, h: 1.8 });
s5.addShape('rect', { x: CONTENT_X + shotW + 0.2, y: shotY + 0.2, w: shotW, h: 1.9, fill: { color: C.bgLight }, line: { color: C.ice } });
s5.addImage({ path: 'screenshots/10-cms.png', x: CONTENT_X + shotW + 0.25, y: shotY + 0.25, w: shotW - 0.1, h: 1.8 });

s5.render();

// --- 幻灯片 6: RAG 智能问答 ---
let s6 = pres.addSlide();
slideTitleBar(s6, 'RAG 智能问答', 'Task 11: Retrieval Augmented Generation');
pageFooter(s6, 6, TOTAL_SLIDES);

// 左侧：流程（原生形状画一个简化的 RAG 管道）
const flowX = CONTENT_X, flowW = CONTENT_W * 0.48;
const nodes = [
  { label: '用户问题', color: C.ice },
  { label: 'embedding-3\n向量化', color: C.deep },
  { label: '179 切片\n余弦检索', color: C.teal },
  { label: '配额 Top-K\nnews:5 corpus:3 term:3', color: C.gold },
  { label: 'Deepseek 流式回答', color: C.navy },
];
const nodeH = 0.55, nodeGap = 0.15, flowStartY = CONTENT_Y + 1.15;
nodes.forEach((n, i) => {
  const ny = flowStartY + i * (nodeH + nodeGap);
  s6.addShape('rect', {
    x: flowX, y: ny, w: flowW, h: nodeH,
    fill: { color: n.color }, line: { color: n.color }
  });
  s6.addText(n.label, {
    x: flowX, y: ny, w: flowW, h: nodeH,
    fontSize: 11, fontFace: 'Calibri', bold: true,
    color: n.color === C.gold || n.color === C.ice ? C.navy : C.textLight,
    align: 'center', valign: 'middle'
  });
  // 箭头
  if (i < nodes.length - 1) {
    s6.addShape('triangle', {
      x: flowX + flowW / 2 - 0.1, y: ny + nodeH, w: 0.2, h: nodeGap,
      fill: { color: C.gold }, rotate: 180
    });
  }
});

// 右侧：特点说明 + 截图
const rX = CONTENT_X + flowW + 0.3, rW = CONTENT_W - flowW - 0.3;
s6.addText('亮点', {
  x: rX, y: CONTENT_Y + 1.15, w: rW, h: 0.28,
  fontSize: 12, fontFace: 'Calibri', bold: true, color: C.teal, letterSpacing: 2
});
s6.addText([
  { text: '跨三个知识库（新闻 / 语料 / 术语）同时检索', options: { bullet: true } },
  { text: '余弦相似度阈值 0.18 + 类型配额，避免单一数据源偏置', options: { bullet: true } },
  { text: 'Deepseek SSE 流式逐字输出，体验顺滑', options: { bullet: true } },
  { text: '回答自动带 [1][2] 引用角标，点击可跳转原文', options: { bullet: true } },
  { text: '右侧面板实时显示 Top-10 来源卡与相似度', options: { bullet: true } },
], {
  x: rX, y: CONTENT_Y + 1.5, w: rW, h: 1.5,
  fontSize: 11, fontFace: 'Calibri', color: C.textDark, paraSpaceAfter: 4
});

// 截图
s6.addShape('rect', {
  x: rX, y: CONTENT_Y + 3.15, w: rW, h: 1.95,
  fill: { color: C.bgLight }, line: { color: C.ice }
});
s6.addImage({
  path: 'screenshots/11-qa-rag.png',
  x: rX + 0.05, y: CONTENT_Y + 3.2, w: rW - 0.1, h: 1.85
});
s6.render();

// --- 幻灯片 7: 东盟多语翻译 ---
let s7 = pres.addSlide();
slideTitleBar(s7, '东盟多语翻译', 'Task 12: ASEAN Multilingual Translation');
pageFooter(s7, 7, TOTAL_SLIDES);

// 左侧：10 语种列表
const l7X = CONTENT_X, l7W = CONTENT_W * 0.32;
s7.addShape('rect', rect(l7X, CONTENT_Y + 1.1, l7W, 1.5, C.navy));
s7.addText('支持 10 种语言', {
  x: l7X + 0.15, y: CONTENT_Y + 1.15, w: l7W - 0.3, h: 0.32,
  fontSize: 13, fontFace: 'Cambria', bold: true, color: C.gold
});
const langs = ['中文 🇨🇳', 'English 🇬🇧', 'ไทย 🇹🇭', 'Tiếng Việt 🇻🇳', 'Bahasa 🇮🇩', 'Bahasa 🇲🇾', 'Filipino 🇵🇭', 'ខ្មែរ 🇰🇭', 'ລາວ 🇱🇦', 'မြန်မာ 🇲🇲'];
langs.forEach((l, i) => {
  const lx = l7X + 0.15 + (i % 3) * ((l7W - 0.3) / 3);
  const ly = CONTENT_Y + 1.5 + Math.floor(i / 3) * 0.28;
  s7.addText(l, {
    x: lx, y: ly, w: (l7W - 0.3) / 3, h: 0.25,
    fontSize: 9.5, fontFace: 'Calibri', color: C.textLight
  });
});

// 右侧：三重 RAG 增强
const r7X = CONTENT_X + l7W + 0.3, r7W = CONTENT_W - l7W - 0.3;
s7.addText('翻译质量增强 · 三重 RAG', {
  x: r7X, y: CONTENT_Y + 1.1, w: r7W, h: 0.32,
  fontSize: 13, fontFace: 'Cambria', bold: true, color: C.deep
});

const ragSources = [
  { label: '术语库强制约束', desc: '缩写 / 全称 / 中文名最长匹配，最多 16 条', count: '74 条' },
  { label: '平行语料语义召回', desc: 'embedding-3 相似度，最多 5 条参考句对', count: '76 对' },
  { label: '新闻背景召回', desc: '最多 3 条新闻片段提供上下文', count: '10 篇' },
];
ragSources.forEach((src, i) => {
  const sy = CONTENT_Y + 1.55 + i * 0.7;
  s7.addShape('rect', rect(r7X, sy, r7W, 0.6, C.bgLight));
  s7.addShape('rect', rect(r7X, sy, 0.06, 0.6, C.gold));
  s7.addText(src.label, {
    x: r7X + 0.15, y: sy + 0.05, w: r7W - 1.5, h: 0.28,
    fontSize: 12, fontFace: 'Calibri', bold: true, color: C.navy
  });
  s7.addText(src.desc, {
    x: r7X + 0.15, y: sy + 0.32, w: r7W - 0.1, h: 0.25,
    fontSize: 10, fontFace: 'Calibri', color: C.muted
  });
  s7.addText(src.count, {
    x: r7X + r7W - 1.2, y: sy + 0.15, w: 1.1, h: 0.3,
    fontSize: 13, fontFace: 'Cambria', bold: true, color: C.deep, align: 'right'
  });
});

// 翻译页截图
s7.addShape('rect', {
  x: CONTENT_X, y: CONTENT_Y + 3.8, w: CONTENT_W, h: 1.65,
  fill: { color: C.bgLight }, line: { color: C.ice }
});
s7.addImage({
  path: 'screenshots/12-translate.png',
  x: CONTENT_X + 0.05, y: CONTENT_Y + 3.85, w: CONTENT_W - 0.1, h: 1.55
});
s7.render();

// --- 幻灯片 8: 数据资产总览 ---
let s8 = pres.addSlide();
slideTitleBar(s8, '数据资产统计', 'Dataset Overview');
pageFooter(s8, 8, TOTAL_SLIDES);

// 四个大卡片
const stats2 = [
  { num: '10', unit: '篇', label: 'INSARAG 新闻', color: C.deep, detail: '覆盖 Global / Asia-Pacific / AEME / IEC-R 四大栏目' },
  { num: '74', unit: '条', label: '标准术语库', color: C.teal, detail: '来自 INSARAG 指南缩略词表，含缩写/全称/中文名/备注' },
  { num: '76', unit: '对', label: '英中平行语料', color: C.gold, detail: 'Deepseek 1:1 逐句对齐，来自 10 篇新闻的双语段落' },
  { num: '179', unit: '个', label: '向量切片', color: C.navy, detail: 'embedding-3（1024 维），新闻 26 + 语料 76 + 术语 77' },
];
const cardW = (CONTENT_W - 0.3) / 2;
const cardH = 1.85;
stats2.forEach((s, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const cx = CONTENT_X + col * (cardW + 0.3);
  const cy = CONTENT_Y + 1.1 + row * (cardH + 0.3);
  s8.addShape('rect', {
    x: cx, y: cy, w: cardW, h: cardH,
    fill: { color: s.color }, line: { color: s.color }
  });
  s8.addText(s.num, {
    x: cx + 0.15, y: cy + 0.15, w: cardW - 0.15, h: 0.85,
    fontSize: 48, fontFace: 'Cambria', bold: true, color: s.color === C.gold ? C.navy : C.textLight,
    charSpacing: 2
  });
  s8.addText(s.unit, {
    x: cx + 0.15, y: cy + 0.65, w: 1.2, h: 0.35,
    fontSize: 16, fontFace: 'Calibri', color: s.color === C.gold ? C.navy : C.textLight
  });
  s8.addText(s.label, {
    x: cx + 0.15, y: cy + 1.0, w: cardW - 0.15, h: 0.35,
    fontSize: 15, fontFace: 'Cambria', bold: true,
    color: s.color === C.gold ? C.navy : C.textLight
  });
  s8.addText(s.detail, {
    x: cx + 0.15, y: cy + 1.35, w: cardW - 0.3, h: 0.45,
    fontSize: 9.5, fontFace: 'Calibri', color: s.color === C.gold ? C.navy : C.ice, italic: true
  });
});
s8.render();

// --- 幻灯片 9: 统一前端展示 ---
let s9 = pres.addSlide();
slideTitleBar(s9, '统一前端 · 模块概览', 'Unified Frontend');
pageFooter(s9, 9, TOTAL_SLIDES);

// 两张截图并排
const shotY2 = CONTENT_Y + 1.15;
const shotW2 = (CONTENT_W - 0.3) / 2;
s9.addText('统一首页（Hero + 7 模块导航）', {
  x: CONTENT_X, y: shotY2 - 0.05, w: shotW2, h: 0.28,
  fontSize: 12, fontFace: 'Calibri', bold: true, color: C.deep
});
s9.addShape('rect', {
  x: CONTENT_X, y: shotY2 + 0.25, w: shotW2, h: 3.75,
  fill: { color: C.bgLight }, line: { color: C.ice }
});
s9.addImage({
  path: 'screenshots/12-home.png',
  x: CONTENT_X + 0.05, y: shotY2 + 0.3, w: shotW2 - 0.1, h: 3.65
});

const rX2 = CONTENT_X + shotW2 + 0.3;
s9.addText('数据库结构可视化', {
  x: rX2, y: shotY2 - 0.05, w: shotW2, h: 0.28,
  fontSize: 12, fontFace: 'Calibri', bold: true, color: C.deep
});
s9.addShape('rect', {
  x: rX2, y: shotY2 + 0.25, w: shotW2, h: 3.75,
  fill: { color: C.bgLight }, line: { color: C.ice }
});
s9.addImage({
  path: 'screenshots/12-database.png',
  x: rX2 + 0.05, y: shotY2 + 0.3, w: shotW2 - 0.1, h: 3.65
});
s9.render();

// --- 幻灯片 10: RAG 流程图 ---
let s10 = pres.addSlide();
slideTitleBar(s10, 'RAG 检索流水线', 'RAG Pipeline Diagram');
pageFooter(s10, 10, TOTAL_SLIDES);

// 画一个更详细的流程图
const boxH = 0.7;
const startY = CONTENT_Y + 1.15;

// 阶段 1：输入
s10.addShape('rect', rect(CONTENT_X + 0.5, startY, 1.6, boxH, C.ice));
s10.addText('用户问题', { x: CONTENT_X + 0.5, y: startY, w: 1.6, h: boxH, fontSize: 12, bold: true, color: C.navy, align: 'center', valign: 'middle' });

// 箭头
s10.addShape('triangle', { x: CONTENT_X + 2.1, y: startY + boxH / 2 - 0.12, w: 0.24, h: 0.24, fill: { color: C.gold } });

// 阶段 2：向量化
s10.addShape('rect', rect(CONTENT_X + 2.4, startY, 2.0, boxH, C.deep));
s10.addText('embedding-3\n1024 维', { x: CONTENT_X + 2.4, y: startY, w: 2.0, h: boxH, fontSize: 11, bold: true, color: C.textLight, align: 'center', valign: 'middle' });

// 箭头
s10.addShape('triangle', { x: CONTENT_X + 4.4, y: startY + boxH / 2 - 0.12, w: 0.24, h: 0.24, fill: { color: C.gold } });

// 阶段 3：余弦检索
s10.addShape('rect', rect(CONTENT_X + 4.7, startY, 1.8, boxH, C.teal));
s10.addText('179 切片\n余弦相似度', { x: CONTENT_X + 4.7, y: startY, w: 1.8, h: boxH, fontSize: 11, bold: true, color: C.textLight, align: 'center', valign: 'middle' });

// 箭头
s10.addShape('triangle', { x: CONTENT_X + 6.5, y: startY + boxH / 2 - 0.12, w: 0.24, h: 0.24, fill: { color: C.gold } });

// 阶段 4：配额过滤
s10.addShape('rect', rect(CONTENT_X + 6.8, startY, 1.5, boxH, C.gold));
s10.addText('Top-K 配额\n5/3/3', { x: CONTENT_X + 6.8, y: startY, w: 1.5, h: boxH, fontSize: 11, bold: true, color: C.navy, align: 'center', valign: 'middle' });

// 中间注释：三个知识库来源
s10.addText('跨三个知识库同时检索', {
  x: CONTENT_X, y: startY + boxH + 0.3, w: CONTENT_W, h: 0.25,
  fontSize: 10, fontFace: 'Calibri', color: C.muted, italic: true, align: 'center'
});

// 三个知识库来源框
const kbY = startY + boxH + 0.65;
const kbItems = [
  { label: '新闻库', desc: '10 篇 · 26 切片', color: C.deep },
  { label: '平行语料库', desc: '76 对 · 76 切片', color: C.teal },
  { label: '术语库', desc: '74 条 · 77 切片', color: C.navy },
];
kbItems.forEach((kb, i) => {
  const kx = CONTENT_X + i * (CONTENT_W / 3);
  const kw = CONTENT_W / 3 - 0.1;
  s10.addShape('rect', rect(kx, kbY, kw, 0.9, kb.color));
  s10.addText(kb.label, { x: kx, y: kbY, w: kw, h: 0.5, fontSize: 14, bold: true, color: C.textLight, align: 'center' });
  s10.addText(kb.desc, { x: kx, y: kbY + 0.45, w: kw, h: 0.4, fontSize: 10, color: C.ice, align: 'center' });
});

// 底部：Deepseek 生成
const genY = kbY + 1.05;
s10.addShape('rect', rect(CONTENT_X + 1, genY, CONTENT_W - 2, 1.05, C.navy));
s10.addText('Deepseek deepseek-chat 流式生成', {
  x: CONTENT_X + 1, y: genY + 0.05, w: CONTENT_W - 2, h: 0.38,
  fontSize: 14, fontFace: 'Cambria', bold: true, color: C.gold, align: 'center', charSpacing: 1
});
s10.addText('带 [1][2] 引用角标 · SSE 逐字输出 · 右侧展示 Top-10 来源卡', {
  x: CONTENT_X + 1, y: genY + 0.5, w: CONTENT_W - 2, h: 0.45,
  fontSize: 11, fontFace: 'Calibri', color: C.ice, align: 'center'
});

s10.render();

// --- 幻灯片 11: 总结与致谢 ---
let s11 = pres.addSlide();
s11.background = { color: C.navy };

s11.addShape('rect', rect(0.5, 1.2, 0.08, 2.8, C.gold));
s11.addText('总结', {
  x: 0.75, y: 1.2, w: 9, h: 0.9,
  fontSize: 42, fontFace: 'Cambria', bold: true, color: C.textLight, charSpacing: 2
});

s11.addText('INSARAG Hub · 零依赖 Node.js 构建的 RAG 增强智能平台', {
  x: 0.75, y: 2.1, w: 9, h: 0.4,
  fontSize: 16, fontFace: 'Cambria', color: C.cyan, italic: true
});

const summaries = [
  '✅ 完成任务 09-12 全部功能（新闻采集、CMS、RAG 问答、多语翻译）',
  '✅ 10 篇新闻 + 74 条术语 + 76 对语料 + 179 个向量切片，全部入库',
  '✅ Deepseek 流式 SSE 输出，可追溯来源，支持术语强制约束',
  '✅ 7 个统一前端页面 + SQLite 数据库可视化 + PM2 托管',
];
s11.addText(summaries.join('\n'), {
  x: 0.75, y: 2.7, w: 9, h: 2.0,
  fontSize: 13, fontFace: 'Calibri', color: C.textLight, paraSpaceAfter: 10
});

s11.addText('致谢：Trae AI Agent · BigModel · Deepseek · INSARAG', {
  x: 0.5, y: 4.85, w: 9, h: 0.28,
  fontSize: 11, fontFace: 'Calibri', color: C.muted, align: 'center', italic: true
});
s11.render();

// ============================================================
// 写出 + QA
// ============================================================
const outDir = path.join(__dirname, '..', 'deliverables');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, '03-网站功能汇报.pptx');

pres.writeFile({ fileName: outPath }).then(() => {
  console.log('PPT 已生成：' + outPath);
  console.log('运行 QA:');
  console.log('  python3 ' + path.join(__dirname, '..', '..', 'node_modules', '.bin', 'fix_pptx.py').replace(/.*Trae.*/, 'python3') + ' ' + outPath);
}).catch((e) => {
  console.error('生成失败：' + e.message);
  process.exit(1);
});
