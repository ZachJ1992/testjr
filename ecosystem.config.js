// PM2 进程管理配置文件
module.exports = {
  apps: [
    {
      name: 'testapp-backend',
      script: 'dist/backend/src/index.js',
      cwd: '/opt/testapp/app/backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      // 如果使用 nginx 反向代理，可以设置以下选项
      // listen_timeout: 10000,
      // kill_timeout: 5000
    }
  ]
};
