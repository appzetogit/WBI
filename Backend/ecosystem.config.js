module.exports = {
  apps: [
    {
      name: 'wbi-backend',
      script: 'server.js',
      instances: 'max', // Uses all available CPU cores (e.g., 4 instances on a 4-core machine)
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
