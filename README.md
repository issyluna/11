# INSARAG Hub — 东盟多语翻译与应急知识平台

> 北京语言大学 · 人工智能辅助翻译 · 2026 年秋季学期期末作业

一个基于 Node.js 零依赖栈构建的 INSARAG（国际搜索与救援咨询团）知识库与东盟多语翻译平台，涵盖**新闻采集、CMS 增删改查、Deepseek 流式 RAG 智能问答、东盟 10 语种互译、数据库可视化**等完整功能。

---

## 技术栈

| 层级 | 选型 |
|---|---|
| 运行时 | Node.js ≥ 22.5.0（利用内置 `node:sqlite` 与全局 `fetch`） |
| 后端 | `node:http` 原生 HTTP 服务器，零第三方依赖 |
| 数据库 | SQLite（WAL 模式，`node:sqlite.DatabaseSync`） |
| 向量嵌入 | 智谱 BigModel `embedding-3`（1024 维） |
| 大语言模型 | Deepseek `deepseek-chat`（流式 SSE） |
| 前端 | 原生 HTML / CSS / JavaScript，无构建工具 |
| 进程托管 | PM2（可选） |

## 目录结构

```
insarag-hub/
├── server.js                 # HTTP 入口（端口 6005）
├── package.json              # 脚本定义
├── ecosystem.config.cjs      # PM2 配置
├── lib/
│   ├── config.js             # API 配置加载
│   ├── db.js                 # SQLite 数据层
│   ├── embed.js              # BigModel 向量嵌入
│   ├── deepseek.js           # Deepseek 流式 / 非流式调用
│   └── rag.js                # RAG 检索与问答 / 翻译流水线
├── scripts/
│   ├── crawl.cjs             # INSARAG 官网新闻抓取
│   ├── translate-news.cjs    # Deepseek 新闻翻译 + 平行语料生成
│   ├── parse-terms.cjs       # 术语库 XLSX 零依赖解析
│   ├── build-index.cjs       # 全量向量化
│   └── screenshot.cjs        # Edge headless 截图工具（可选）
├── public/                   # 前端静态页面（7 个模块）
│   ├── index.html            # 统一前端首页
│   ├── news.html             # 新闻库
│   ├── cms.html              # CMS 增删改查
│   ├── qa.html               # RAG 智能问答
│   ├── translate.html        # 东盟多语翻译
│   ├── assets.html           # 数据资产（JSON 预览）
│   ├── database.html         # 数据库结构可视化
│   ├── css/app.css
│   └── js/*.js
└── data/
    ├── config.json           # API 密钥（需自行填写）
    ├── config.example.json   # 密钥模板
    ├── insarag.db            # SQLite 数据库（新闻 / 语料 / 术语 / 向量）
    ├── news/                 # 新闻 JSON 文件（10 篇）
    ├── news_schema.json      # 元数据 Schema
    ├── parallel_corpus_1to1.json   # 1:1 英中平行语料（76 组）
    ├── terms.json            # INSARAG 术语库（74 条）
    ├── media/                # 新闻配图
    └── raw/                  # WordPress REST 原始响应快照
```

## 快速启动

### 环境准备

```bash
# 确认 Node.js 版本 ≥ 22.5.0
node -v
```

### 配置 API 密钥

编辑 `data/config.json`，填入 BigModel 与 Deepseek 的真实 API Key：

```json
{
  "bigmodel_key": "你的 BigModel API Key",
  "embedding_model": "embedding-3",
  "embedding_dim": 1024,
  "deepseek_key": "你的 Deepseek API Key",
  "deepseek_model": "deepseek-chat",
  "deepseek_base": "https://api.deepseek.com"
}
```

> 如果没有密钥，平台仍可运行，但 RAG 问答、翻译、向量化功能将返回错误。可先用 `data/insarag.db` 中已嵌入的 179 个切片数据进行测试。

### 启动服务

```bash
# 开发模式
node --no-warnings server.js

# 或使用 PM2 托管（推荐）
pm2 start ecosystem.config.cjs
pm2 save
```

启动后访问 <http://localhost:6005>。

### 重新向量化（可选）

数据库已包含预嵌入向量。如果修改了新闻 / 术语 / 语料数据，重新运行：

```bash
node --no-warnings scripts/build-index.cjs
```

该脚本会自动检测哪些数据需要重新切片和嵌入，支持断点续跑。

## 功能导航

| 页面 | 路由 | 对应任务 | 说明 |
|---|---|---|---|
| 统一首页 | `/` | 任务 12 | Hero + 模块导航 + 最新新闻 + 统计 |
| 新闻库 | `/news` | — | 搜索、栏目筛选、详情弹窗、中英对照 |
| CMS | `/cms` | 任务 10 | 完整 CRUD，保存自动写 DB + JSON |
| 智能问答 | `/qa` | 任务 11 | 流式 RAG 问答，可追溯来源 |
| 多语翻译 | `/translate` | 任务 12 | 10 种语言互译，术语/语料/新闻三重 RAG |
| 数据资产 | `/assets` | 任务 09 | JSON 文件列表 + 元数据 + 预览 |
| 数据库 | `/database` | 任务 12 | 表结构、字段、索引、向量状态可视化 |

## API 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/stats` | 全局统计 |
| GET | `/api/news` | 新闻列表（支持 q / section / page / pageSize） |
| GET | `/api/news/:id` | 新闻详情 |
| POST | `/api/news` | 新建新闻（CMS） |
| PUT | `/api/news/:id` | 更新新闻（CMS） |
| DELETE | `/api/news/:id` | 删除新闻（CMS） |
| GET | `/api/corpus` | 平行语料列表 |
| GET | `/api/terms` | 术语库列表 |
| POST | `/api/qa` | RAG 问答（SSE 流式） |
| POST | `/api/translate` | 多语翻译（SSE 流式） |
| POST | `/api/vectorize` | 手动触发全量向量化 |
| GET | `/api/vector/status` | 向量化进度 |
| GET | `/api/database` | 数据库元信息（表结构、索引、关系） |
| GET | `/api/schema` | 新闻元数据 JSON Schema |

## 数据统计

| 资产 | 数量 |
|---|---|
| INSARAG 新闻 | 10 篇（Global / Asia-Pacific / AEME / IEC-R） |
| 英中平行语料 | 76 组 1:1 句对 |
| INSARAG 术语 | 74 条（缩写 / 英文全称 / 中文名 / 备注） |
| 向量切片 | 179 个（新闻 26 + 语料 76 + 术语 77） |
| 嵌入模型 | embedding-3（1024 维） |
| RAG 检索 | 余弦相似度 Top-K，类型配额 news:5 / corpus:3 / term:3 |

## RAG 检索流程

```
用户问题
  ↓ embedding-3 向量化（1024 维）
  ↓ 与 179 个切片逐一计算余弦相似度
  ↓ 类型配额过滤 + Top-K 排序
  ↓ 拼装上下文（带 [1][2] 引用标记）
  ↓ Deepseek deepseek-chat 流式回答
  ↓ 前端 SSE 渲染 + 可追溯来源面板
```

## 翻译 RAG 增强

```
源文本
  ↓ 强制术语匹配（缩写 / 全称 / 中文名，最长匹配优先，最多 16 条）
  ↓ 语义向量召回（与问答共用 embedding-3）
  ↓ 平行语料召回（最多 5 条）
  ↓ 新闻背景召回（最多 3 条）
  ↓ 系统提示注入术语表 + 平行语料 + 新闻片段
  ↓ Deepseek 流式翻译
  ↓ 前端展示译文 + 来源追溯（术语 / 语料 / 新闻 Tab）
```

## 常见问题

**Q: 启动报 `Error: cannot find module node:sqlite`**
A: 需要 Node.js ≥ 22.5.0。检查：`node -v`

**Q: RAG 问答返回 NO_VECTORS**
A: 说明 `data/insarag.db` 中没有向量切片。运行 `node --no-warnings scripts/build-index.cjs` 重新向量化。注意需要配置有效的 BigModel API Key。

**Q: 翻译功能报错**
A: 检查 `data/config.json` 中 Deepseek API Key 是否正确。翻译需要 BigModel（向量）和 Deepseek（生成）两个 Key。

**Q: SQLite WAL 文件（*.db-shm / *.db-wal）**
A: 这是 SQLite WAL 模式的临时文件，启动时自动创建、关闭时自动清理。不影响部署，可忽略。

## 版权说明

新闻内容与术语库版权归 INSARAG / 联合国人道主义事务协调办公室（OCHA）所有，本项目仅用于教学与研究目的。
