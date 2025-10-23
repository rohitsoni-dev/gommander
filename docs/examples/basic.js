#!/usr/bin/env node

/**
 * Example: Basic CLI Application
 * Description: Demonstrates basic GoCommander usage with options and simple commands
 * 
 * Usage:
 *   node basic.js [options]
 *   node basic.js serve [options]
 *   node basic.js build [options]
 * 
 * Features demonstrated:
 *   - Basic program setup
 *   - Global options
 *   - Simple commands
 *   - Option parsing
 *   - Help generation
 */

const { program } = require('gocommander');

// Set up the main program
program
  .name('basic-cli')
  .description('A basic CLI application demonstrating GoCommander features')
  .version('1.0.0');

// Add global options
program
  .option('-v, --verbose', 'enable verbose output')
  .option('-c, --config <path>', 'configuration file path', './config.json')
  .option('-e, --env <environment>', 'environment', 'development');

// Add a serve command
program
  .command('serve')
  .description('start a development server')
  .option('-p, --port <number>', 'port number', '3000')
  .option('-h, --host <address>', 'host address', 'localhost')
  .option('--open', 'open browser automatically')
  .action((options) => {
    const globalOpts = program.opts();
    
    console.log('🚀 Starting development server...');
    console.log(`📍 Server: http://${options.host}:${options.port}`);
    console.log(`🌍 Environment: ${globalOpts.env}`);
    console.log(`⚙️  Config: ${globalOpts.config}`);
    
    if (globalOpts.verbose) {
      console.log('\n📊 Verbose mode enabled');
      console.log('Server options:', options);
      console.log('Global options:', globalOpts);
    }
    
    if (options.open) {
      console.log('🌐 Opening browser...');
    }
    
    // Simulate server startup
    console.log('✅ Server started successfully!');
  });

// Add a build command
program
  .command('build')
  .description('build the application for production')
  .option('-o, --output <directory>', 'output directory', 'dist')
  .option('--minify', 'minify the output')
  .option('--source-map', 'generate source maps')
  .option('-w, --watch', 'watch for changes')
  .action((options) => {
    const globalOpts = program.opts();
    
    console.log('🔨 Building application...');
    console.log(`📁 Output directory: ${options.output}`);
    console.log(`🌍 Environment: ${globalOpts.env}`);
    
    if (globalOpts.verbose) {
      console.log('\n📊 Build configuration:');
      console.log('- Minify:', options.minify ? 'enabled' : 'disabled');
      console.log('- Source maps:', options.sourceMap ? 'enabled' : 'disabled');
      console.log('- Watch mode:', options.watch ? 'enabled' : 'disabled');
    }
    
    // Simulate build process
    console.log('📦 Bundling files...');
    
    if (options.minify) {
      console.log('🗜️  Minifying code...');
    }
    
    if (options.sourceMap) {
      console.log('🗺️  Generating source maps...');
    }
    
    if (options.watch) {
      console.log('👀 Watching for changes...');
      console.log('Press Ctrl+C to stop watching');
    } else {
      console.log('✅ Build completed successfully!');
    }
  });

// Add a status command (no options)
program
  .command('status')
  .description('show application status')
  .action(() => {
    const globalOpts = program.opts();
    
    console.log('📊 Application Status');
    console.log('===================');
    console.log(`Environment: ${globalOpts.env}`);
    console.log(`Config file: ${globalOpts.config}`);
    console.log(`Verbose mode: ${globalOpts.verbose ? 'enabled' : 'disabled'}`);
    console.log(`Node.js version: ${process.version}`);
    console.log(`Platform: ${process.platform}`);
    console.log(`Working directory: ${process.cwd()}`);
  });

// Add help text
program.addHelpText('after', `
Examples:
  $ basic-cli serve --port 8080 --open
  $ basic-cli build --minify --source-map
  $ basic-cli status --verbose
  $ basic-cli --env production build --output ./build
`);

// Handle the case where no command is provided
if (process.argv.length <= 2) {
  console.log('👋 Welcome to Basic CLI!');
  console.log('Run with --help to see available commands.');
  program.help();
}

// Parse command line arguments
program.parse();

// If we get here and no command was executed, show help
if (!process.argv.slice(2).some(arg => ['serve', 'build', 'status'].includes(arg))) {
  const opts = program.opts();
  
  if (Object.keys(opts).length > 0) {
    console.log('📋 Global options parsed:');
    console.log(opts);
    console.log('\nUse a command (serve, build, status) to perform actions.');
  }
}