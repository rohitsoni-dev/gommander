#!/usr/bin/env node

/**
 * Script to run and test all examples
 */

const { execSync } = require('child_process');
const path = require('path');

const examples = [
  {
    name: 'Basic CLI',
    file: 'basic-cli.js',
    args: ['--verbose', '--port', '8080', 'test-input.txt']
  },
  {
    name: 'Advanced CLI - DB Migration',
    file: 'advanced-cli.js', 
    args: ['db', 'migrate', '--dry-run']
  },
  {
    name: 'Advanced CLI - Server Start',
    file: 'advanced-cli.js',
    args: ['server', 'start', '--port', '3000']
  },
  {
    name: 'Migration Example',
    file: 'migration-example.js',
    args: ['split', 'a,b,c,d', '--separator', ',']
  },
  {
    name: 'Performance Benchmark',
    file: 'performance-benchmark.js',
    args: []
  }
];

console.log('Running GoCommander Examples\n');

for (const example of examples) {
  console.log(`\n📋 Running: ${example.name}`);
  console.log(`Command: node ${example.file} ${example.args.join(' ')}`);
  console.log('─'.repeat(50));
  
  try {
    const result = execSync(
      `node ${example.file} ${example.args.join(' ')}`,
      { 
        cwd: __dirname,
        encoding: 'utf8',
        stdio: 'pipe'
      }
    );
    console.log(result);
  } catch (error) {
    console.log('Output:', error.stdout);
    if (error.stderr) {
      console.log('Error:', error.stderr);
    }
  }
}

console.log('\n✅ All examples completed!');
