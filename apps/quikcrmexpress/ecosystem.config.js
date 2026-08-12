// PM2 process config for the CrmExpress automation worker.
//
// WHY THIS SHAPE (Windows): `pm2 start npm -- run worker` fails on Windows
// because PM2 tries to execute npm.cmd as a JS module ("SyntaxError:
// Unexpected token ':'" from the batch-file header). Instead we run tsx's CLI
// entry directly under node, replicating exactly what `npm run worker` does:
//   tsx --env-file=.env.local lib/queue/worker.ts
//
// This is the FULL worker (LeadSquared sync ENABLED) — matching `npm run
// worker`. If UAT should suppress LSQ sync, set WORKER_AUTOMATION_ONLY=1 in
// .env.local (the worker reads it there) rather than changing this file.
module.exports = {
  apps: [
    {
      name: "crmexpress-worker",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "--env-file=.env.local lib/queue/worker.ts",
      cwd: "C:\\inetpub\\wwwroot\\crmexpress",
      interpreter: "node",
      autorestart: true,
      // Give a crash-looping worker a breather instead of hammering restarts.
      restart_delay: 3000,
      max_restarts: 10,
      time: true, // timestamp log lines
    },
  ],
};
