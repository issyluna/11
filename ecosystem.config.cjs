module.exports = {
  apps: [
    {
      name: 'insarag-hub',
      script: 'server.js',
      node_args: '--no-warnings',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 6005
      },
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      time: true,
      merge_logs: true
    }
  ]
};
