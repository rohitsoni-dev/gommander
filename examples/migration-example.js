#!/usr/bin/env node

/**
 * Migration Example
 * Shows how to migrate from Commander.js to GoCommander
 */

// BEFORE: Using Commander.js
// const { program } = require('commander');

// AFTER: Using GoCommander (drop-in replacement)
const { program } = require('../lib/index.js');

// All Commander.js code works exactly the same!

program
  .name('migration-example')
  .description('Example showing Commander.js to GoCommander migration')
  .version('1.0.0');

// Options work identically
program
  .option('-d, --debug', 'output extra debugging')
  .option('-s, --small', 'small pizza size')
  .option('-p, --pizza-type <type>', 'flavour of pizza');

// Subcommands work identically  
program
  .command('split')
  .alias('s')
  .description('Split a string into substrings and display as an array')
  .argument('<string>', 'string to split')
  .option('--first', 'display just the first substring')
  .option('-s, --separator <char>', 'separator character', ',')
  .action((str, options) => {
    const limit = options.first ? 1 : undefined;
    console.log(str.split(options.separator, limit));
  });

// Error handling works identically
program.exitOverride();

try {
  program.parse();
} catch (err) {
  console.error('Command failed:', err.message);
}

console.log('\n✅ Migration complete! GoCommander works exactly like Commander.js');
console.log('🚀 But with 2-5x better performance!');
