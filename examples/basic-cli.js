#!/usr/bin/env node

/**
 * Basic CLI Example
 * Demonstrates basic option and argument handling
 */

const { program } = require('../lib/index.js');

program
  .name('basic-cli')
  .description('Basic CLI example using GoCommander')
  .version('1.0.0')
  .option('-v, --verbose', 'verbose output')
  .option('-p, --port <number>', 'port number', parseInt, 3000)
  .option('-h, --host <host>', 'hostname', 'localhost')
  .argument('<file>', 'input file to process')
  .argument('[output]', 'output file (optional)')
  .action((file, output, options) => {
    console.log('Processing file:', file);
    if (output) {
      console.log('Output file:', output);
    }
    console.log('Options:', options);
    
    if (options.verbose) {
      console.log('Verbose mode enabled');
      console.log('Host:', options.host);
      console.log('Port:', options.port);
    }
  });

program.parse();
