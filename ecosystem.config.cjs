module.exports = {
  apps: [{
    name: 'gemas',
    script: 'server/index.ts',
    interpreter: 'node',
    interpreter_args: '--import tsx/esm',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '900M',
    restart_delay: 3000,
    max_restarts: 10,
    env_production: {
      NODE_ENV: 'production',
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
