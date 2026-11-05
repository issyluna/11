'use strict';

const fs = require('node:fs');
const path = require('node:path');

class Config {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'config.json');
    this.value = {
      bigmodel_key: '',
      embedding_model: 'embedding-3',
      embedding_dim: 1024,
      deepseek_key: '',
      deepseek_model: 'deepseek-chat',
      deepseek_base: 'https://api.deepseek.com'
    };
    this.load();
  }

  load() {
    if (fs.existsSync(this.file)) {
      Object.assign(this.value, JSON.parse(fs.readFileSync(this.file, 'utf8')));
    }
    // 环境变量优先（生产部署用）
    if (process.env.BIGMODEL_KEY) this.value.bigmodel_key = process.env.BIGMODEL_KEY;
    if (process.env.DEEPSEEK_KEY) this.value.deepseek_key = process.env.DEEPSEEK_KEY;
    if (process.env.DEEPSEEK_BASE) this.value.deepseek_base = process.env.DEEPSEEK_BASE;
  }

  publicValue() {
    return {
      embedding_model: this.value.embedding_model,
      embedding_dim: this.value.embedding_dim,
      deepseek_model: this.value.deepseek_model,
      bigmodel_key_set: !!this.value.bigmodel_key,
      deepseek_key_set: !!this.value.deepseek_key
    };
  }
}

module.exports = { Config };
