#!/usr/bin/env node

/**
 * Advanced CLI Example
 * Demonstrates subcommands, option groups, and advanced features
 */

const { program } = require('../lib/index.js');

// Database subcommand
const dbCommand = program
  .command('db')
  .description('Database operations');

dbCommand
  .command('migrate')
  .description('Run database migrations')
  .option('--dry-run', 'show what would be done without executing')
  .option('--target <version>', 'migrate to specific version')
  .action((options) => {
    console.log('Running database migration...');
    if (options.dryRun) {
      console.log('DRY RUN: Would migrate database');
    }
    if (options.target) {
      console.log('Target version:', options.target);
    }
  });

dbCommand
  .command('seed')
  .description('Seed database with test data')
  .option('--env <environment>', 'environment to seed', 'development')
  .action((options) => {
    console.log(`Seeding database for ${options.env} environment`);
  });

// Server subcommand
const serverCommand = program
  .command('server')
  .alias('serve')
  .description('Start the server');

serverCommand
  .command('start')
  .description('Start the server')
  .option('-p, --port <number>', 'port number', parseInt, 3000)
  .option('-h, --host <host>', 'hostname', 'localhost')
  .option('--ssl', 'enable SSL')
  .option('--cert <path>', 'SSL certificate path')
  .option('--key <path>', 'SSL key path')
  .action((options) => {
    console.log(`Starting server on ${options.host}:${options.port}`);
    if (options.ssl) {
      console.log('SSL enabled');
      console.log('Certificate:', options.cert);
      console.log('Key:', options.key);
    }
  });

serverCommand
  .command('stop')
  .description('Stop the server')
  .option('--force', 'force stop without graceful shutdown')
  .action((options) => {
    console.log('Stopping server...');
    if (options.force) {
      console.log('Force stopping');
    }
  });

// Build subcommand
program
  .command('build')
  .description('Build the application')
  .option('--env <environment>', 'build environment', 'production')
  .option('--watch', 'watch for changes')
  .option('--minify', 'minify output')
  .option('--source-maps', 'generate source maps')
  .action((options) => {
    console.log(`Building for ${options.env} environment`);
    if (options.watch) {
      console.log('Watch mode enabled');
    }
    if (options.minify) {
      console.log('Minification enabled');
    }
    if (options.sourceMaps) {
      console.log('Source maps enabled');
    }
  });

// Global options
program
  .option('-v, --verbose', 'verbose output')
  .option('--config <path>', 'config file path', './config.json')
  .option('--log-level <level>', 'log level', 'info');

// Global error handling
program.exitOverride((err) => {
  if (err.code === 'commander.unknownOption') {
    console.error('Unknown option:', err.message);
    process.exit(1);
  }
  if (err.code === 'commander.missingArgument') {
    console.error('Missing argument:', err.message);
    process.exit(1);
  }
});

program.parse();
