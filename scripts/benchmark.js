#!/usr/bin/env node

/**
 * Benchmark GoCommander performance
 */

const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

class Benchmark {
  constructor() {
    this.results = [];
  }
  
  async run(name, fn, iterations = 1000) {
    console.log(`\n🏃 Running benchmark: ${name}`);
    console.log(`Iterations: ${iterations}`);
    
    // Warmup
    for (let i = 0; i < Math.min(100, iterations / 10); i++) {
      await fn();
    }
    
    // Actual benchmark
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      await fn();
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    
    const result = {
      name,
      iterations,
      totalTime: totalTime.toFixed(2),
      avgTime: avgTime.toFixed(4),
      opsPerSec: (1000 / avgTime).toFixed(0)
    };
    
    this.results.push(result);
    
    console.log(`Total time: ${result.totalTime}ms`);
    console.log(`Average: ${result.avgTime}ms per operation`);
    console.log(`Throughput: ${result.opsPerSec} ops/sec`);
    
    return result;
  }
  
  printSummary() {
    console.log('\n📊 Benchmark Summary');
    console.log('═'.repeat(80));
    console.log('Test Name'.padEnd(30) + 'Iterations'.padEnd(12) + 'Avg Time'.padEnd(12) + 'Ops/Sec'.padEnd(12) + 'Total Time');
    console.log('─'.repeat(80));
    
    for (const result of this.results) {
      console.log(
        result.name.padEnd(30) +
        result.iterations.toString().padEnd(12) +
        (result.avgTime + 'ms').padEnd(12) +
        result.opsPerSec.padEnd(12) +
        (result.totalTime + 'ms')
      );
    }
    
    console.log('═'.repeat(80));
  }
  
  saveResults(filename = 'benchmark-results.json') {
    const resultsPath = path.join(__dirname, '..', filename);
    const data = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      results: this.results
    };
    
    fs.writeFileSync(resultsPath, JSON.stringify(data, null, 2));
    console.log(`\n💾 Results saved to ${filename}`);
  }
}

async function runBenchmarks() {
  console.log('🚀 GoCommander Performance Benchmark');
  console.log('═'.repeat(50));
  
  const benchmark = new Benchmark();
  
  // Load GoCommander
  const { program, Command } = require('../lib/index.js');
  
  // Test 1: Basic option parsing
  await benchmark.run('Basic Option Parsing', () => {
    const cmd = new Command();
    cmd.option('-v, --verbose', 'verbose output');
    cmd.option('-p, --port <number>', 'port number', parseInt);
    cmd.parse(['node', 'script.js', '--verbose', '--port', '3000'], { from: 'node' });
  }, 10000);
  
  // Test 2: Complex command with many options
  await benchmark.run('Complex Command Parsing', () => {
    const cmd = new Command();
    cmd.option('-v, --verbose', 'verbose output');
    cmd.option('-p, --port <number>', 'port number', parseInt);
    cmd.option('-h, --host <host>', 'hostname');
    cmd.option('--ssl', 'enable SSL');
    cmd.option('--cert <path>', 'certificate path');
    cmd.option('--key <path>', 'key path');
    cmd.option('--env <env>', 'environment');
    cmd.option('--debug', 'debug mode');
    cmd.argument('<input>', 'input file');
    cmd.argument('[output]', 'output file');
    
    cmd.parse([
      'node', 'script.js',
      '--verbose', '--port', '8080', '--host', 'localhost',
      '--ssl', '--cert', '/path/to/cert', '--key', '/path/to/key',
      '--env', 'production', '--debug',
      'input.txt', 'output.txt'
    ], { from: 'node' });
  }, 5000);
  
  // Test 3: Subcommand parsing
  await benchmark.run('Subcommand Parsing', () => {
    const cmd = new Command();
    
    const dbCmd = cmd.command('db');
    dbCmd.command('migrate')
      .option('--dry-run', 'dry run')
      .option('--target <version>', 'target version');
    
    dbCmd.command('seed')
      .option('--env <env>', 'environment');
    
    const serverCmd = cmd.command('server');
    serverCmd.command('start')
      .option('-p, --port <number>', 'port', parseInt)
      .option('--ssl', 'enable SSL');
    
    cmd.parse(['node', 'script.js', 'db', 'migrate', '--dry-run', '--target', '1.0.0'], { from: 'node' });
  }, 3000);
  
  // Test 4: Help generation
  await benchmark.run('Help Generation', () => {
    const cmd = new Command();
    cmd.name('test-cli');
    cmd.description('Test CLI application');
    cmd.option('-v, --verbose', 'verbose output');
    cmd.option('-p, --port <number>', 'port number', parseInt);
    cmd.argument('<input>', 'input file');
    
    const help = cmd.helpInformation();
  }, 2000);
  
  // Test 5: Error handling
  await benchmark.run('Error Handling', () => {
    const cmd = new Command();
    cmd.option('-p, --port <number>', 'port number', parseInt);
    cmd.exitOverride();
    
    try {
      cmd.parse(['node', 'script.js', '--invalid-option'], { from: 'node' });
    } catch (error) {
      // Expected error
    }
  }, 1000);
  
  // Test 6: Memory allocation (command creation)
  await benchmark.run('Command Creation', () => {
    const cmd = new Command('test');
    cmd.description('Test command');
    cmd.option('-v, --verbose', 'verbose');
    cmd.argument('<file>', 'file');
  }, 5000);
  
  benchmark.printSummary();
  benchmark.saveResults();
  
  // Performance targets check
  console.log('\n🎯 Performance Targets');
  console.log('═'.repeat(50));
  
  const basicParsingResult = benchmark.results.find(r => r.name === 'Basic Option Parsing');
  if (basicParsingResult) {
    const avgTimeMs = parseFloat(basicParsingResult.avgTime);
    const target = 0.1; // 0.1ms target for basic parsing
    
    console.log(`Basic parsing average: ${avgTimeMs}ms`);
    console.log(`Target: < ${target}ms`);
    console.log(`Status: ${avgTimeMs < target ? '✅ PASS' : '❌ FAIL'}`);
    
    if (avgTimeMs >= target) {
      console.log('💡 Consider optimizing WASM bridge calls');
    }
  }
  
  console.log('\n✅ Benchmark completed!');
}

if (require.main === module) {
  runBenchmarks().catch(console.error);
}

module.exports = { runBenchmarks };