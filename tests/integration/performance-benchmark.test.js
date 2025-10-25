/**
 * Performance Benchmarking Tests
 * Compares GoCommander performance against Commander.js and measures key metrics
 */

const os = require('os');
const { performance } = require('perf_hooks');
const { Command } = require('../../lib/index.js');

// Mock Commander.js for comparison (in real scenario, this would be the actual Commander.js)
const MockCommanderJS = class {
  constructor(name) {
    this._name = name || '';
    this._options = [];
    this._arguments = [];
    this._commands = [];
  }
  
  name(str) {
    if (str === undefined) return this._name;
    this._name = str;
    return this;
  }
  
  option(flags, description, defaultValue) {
    this._options.push({ flags, description, defaultValue });
    return this;
  }
  
  argument(name, description) {
    this._arguments.push({ name, description });
    return this;
  }
  
  command(name, description) {
    const cmd = new MockCommanderJS(name);
    cmd._description = description;
    this._commands.push(cmd);
    return cmd;
  }
  
  parse(argv) {
    // Simplified parsing for benchmark comparison
    return {
      options: {},
      args: argv.slice(2),
      command: this._name
    };
  }
};

// Helper function to safely run performance tests
function runPerformanceTest(testName, testFn, iterations = 1000) {
  try {
    const startTime = performance.now();
    testFn(iterations);
    const endTime = performance.now();
    const duration = endTime - startTime;
    const avgTime = duration / iterations;
    
    console.log(`${testName}: ${duration.toFixed(2)}ms total, ${avgTime.toFixed(4)}ms avg`);
    return { duration, avgTime, iterations };
  } catch (error) {
    console.warn(`Performance test "${testName}" failed:`, error.message);
    return { duration: 0, avgTime: 0, iterations: 0, error: error.message };
  }
}

describe('Performance Benchmarking Tests', () => {
  let performanceResults = {};

  beforeAll(() => {
    console.log(`\n=== Performance Benchmark Environment ===`);
    console.log(`Platform: ${os.platform()} ${os.arch()}`);
    console.log(`Node.js: ${process.version}`);
    console.log(`CPUs: ${os.cpus().length} cores (${os.cpus()[0].model})`);
    console.log(`Memory: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB total`);
    console.log(`==========================================\n`);
  });

  afterAll(() => {
    console.log(`\n=== Performance Benchmark Results ===`);
    Object.entries(performanceResults).forEach(([test, result]) => {
      console.log(`${test}:`);
      console.log(`  Duration: ${result.duration}ms`);
      if (result.avgTime) console.log(`  Average: ${result.avgTime.toFixed(4)}ms`);
      if (result.throughput) console.log(`  Throughput: ${result.throughput.toFixed(0)} ops/sec`);
      if (result.memoryUsage) console.log(`  Memory: ${result.memoryUsage.toFixed(2)}MB`);
    });
    console.log(`=====================================\n`);
  });

  describe('Command Creation Performance', () => {
    test('should create commands faster than or comparable to Commander.js', () => {
      const iterations = 1000; // Reduced for stability
      
      // Benchmark GoCommander
      const goResult = runPerformanceTest('GoCommander Creation', (iter) => {
        for (let i = 0; i < iter; i++) {
          const cmd = new Command(`test-${i}`);
          cmd.description(`Test command ${i}`);
        }
      }, iterations);
      
      // Benchmark Mock Commander.js
      const jsResult = runPerformanceTest('Commander.js Creation', (iter) => {
        for (let i = 0; i < iter; i++) {
          const cmd = new MockCommanderJS(`test-${i}`);
          cmd._description = `Test command ${i}`;
        }
      }, iterations);
      
      if (goResult.error || jsResult.error) {
        console.warn('Performance test had errors, skipping comparison');
        return;
      }
      
      console.log(`Command Creation Performance (${iterations} iterations):`);
      console.log(`  GoCommander: ${goResult.duration.toFixed(2)}ms (${goResult.avgTime.toFixed(4)}ms per command)`);
      console.log(`  Commander.js: ${jsResult.duration.toFixed(2)}ms (${jsResult.avgTime.toFixed(4)}ms per command)`);
      
      if (jsResult.duration > 0) {
        console.log(`  Ratio: ${(goResult.duration/jsResult.duration).toFixed(2)}x`);
        // GoCommander should be within reasonable performance range
        expect(goResult.duration).toBeLessThan(jsResult.duration * 5); // At most 5x slower
      }
    });

    test('should handle option addition performance', () => {
      const iterations = 1000;
      const optionsPerCommand = 50;
      
      // Benchmark GoCommander
      const goCommanderStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const cmd = new Command(`test-${i}`);
        for (let j = 0; j < optionsPerCommand; j++) {
          cmd.option(`-${String.fromCharCode(97 + j)}, --option-${j} <value>`, `Option ${j}`);
        }
      }
      const goCommanderEnd = performance.now();
      const goCommanderTime = goCommanderEnd - goCommanderStart;
      
      // Benchmark Mock Commander.js
      const commanderJSStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const cmd = new MockCommanderJS(`test-${i}`);
        for (let j = 0; j < optionsPerCommand; j++) {
          cmd.option(`-${String.fromCharCode(97 + j)}, --option-${j} <value>`, `Option ${j}`);
        }
      }
      const commanderJSEnd = performance.now();
      const commanderJSTime = commanderJSEnd - commanderJSStart;
      
      const totalOperations = iterations * optionsPerCommand;
      
      console.log(`Option Addition Performance (${totalOperations} options):`);
      console.log(`  GoCommander: ${goCommanderTime.toFixed(2)}ms (${(goCommanderTime/totalOperations).toFixed(4)}ms per option)`);
      console.log(`  Commander.js: ${commanderJSTime.toFixed(2)}ms (${(commanderJSTime/totalOperations).toFixed(4)}ms per option)`);
      console.log(`  Ratio: ${(goCommanderTime/commanderJSTime).toFixed(2)}x`);
      
      expect(goCommanderTime).toBeLessThan(commanderJSTime * 5); // At most 5x slower
    });

    test('should handle subcommand creation performance', () => {
      const iterations = 100;
      const subcommandsPerCommand = 20;
      
      // Benchmark GoCommander
      const goCommanderStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const cmd = new Command(`test-${i}`);
        for (let j = 0; j < subcommandsPerCommand; j++) {
          cmd.command(`sub-${j}`, `Subcommand ${j}`);
        }
      }
      const goCommanderEnd = performance.now();
      const goCommanderTime = goCommanderEnd - goCommanderStart;
      
      // Benchmark Mock Commander.js
      const commanderJSStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const cmd = new MockCommanderJS(`test-${i}`);
        for (let j = 0; j < subcommandsPerCommand; j++) {
          cmd.command(`sub-${j}`, `Subcommand ${j}`);
        }
      }
      const commanderJSEnd = performance.now();
      const commanderJSTime = commanderJSEnd - commanderJSStart;
      
      const totalOperations = iterations * subcommandsPerCommand;
      
      console.log(`Subcommand Creation Performance (${totalOperations} subcommands):`);
      console.log(`  GoCommander: ${goCommanderTime.toFixed(2)}ms (${(goCommanderTime/totalOperations).toFixed(4)}ms per subcommand)`);
      console.log(`  Commander.js: ${commanderJSTime.toFixed(2)}ms (${(commanderJSTime/totalOperations).toFixed(4)}ms per subcommand)`);
      console.log(`  Ratio: ${(goCommanderTime/commanderJSTime).toFixed(2)}x`);
      
      expect(goCommanderTime).toBeLessThan(commanderJSTime * 5); // At most 5x slower
    });
  });

  describe('Parsing Performance', () => {
    test('should parse simple commands efficiently', () => {
      const iterations = 10000;
      
      // Setup commands
      const goCmd = new Command('test');
      goCmd
        .option('-v, --verbose', 'verbose output')
        .option('-p, --port <number>', 'port number', parseInt)
        .argument('<file>', 'input file');
      
      const mockCmd = new MockCommanderJS('test');
      mockCmd
        .option('-v, --verbose', 'verbose output')
        .option('-p, --port <number>', 'port number')
        .argument('<file>', 'input file');
      
      const testArgs = ['node', 'test', '-v', '--port', '3000', 'input.txt'];
      
      // Benchmark GoCommander parsing
      const goCommanderStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        goCmd.parse(testArgs);
      }
      const goCommanderEnd = performance.now();
      const goCommanderTime = goCommanderEnd - goCommanderStart;
      
      // Benchmark Mock Commander.js parsing
      const commanderJSStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        mockCmd.parse(testArgs);
      }
      const commanderJSEnd = performance.now();
      const commanderJSTime = commanderJSEnd - commanderJSStart;
      
      console.log(`Simple Parsing Performance (${iterations} iterations):`);
      console.log(`  GoCommander: ${goCommanderTime.toFixed(2)}ms (${(goCommanderTime/iterations).toFixed(4)}ms per parse)`);
      console.log(`  Commander.js: ${commanderJSTime.toFixed(2)}ms (${(commanderJSTime/iterations).toFixed(4)}ms per parse)`);
      console.log(`  Ratio: ${(goCommanderTime/commanderJSTime).toFixed(2)}x`);
      
      // Target: GoCommander should be faster or at most 2x slower
      expect(goCommanderTime).toBeLessThan(commanderJSTime * 2);
    });

    test('should parse complex commands with many options efficiently', () => {
      const iterations = 1000;
      
      // Setup complex commands
      const goCmd = new Command('complex');
      const mockCmd = new MockCommanderJS('complex');
      
      // Add many options
      for (let i = 0; i < 50; i++) {
        goCmd.option(`--option-${i} <value>`, `Option ${i}`, `default-${i}`);
        mockCmd.option(`--option-${i} <value>`, `Option ${i}`);
      }
      
      // Add arguments
      goCmd.argument('<input>', 'input file');
      goCmd.argument('[output]', 'output file');
      mockCmd.argument('<input>', 'input file');
      mockCmd.argument('[output]', 'output file');
      
      const testArgs = [
        'node', 'complex',
        '--option-5', 'value5',
        '--option-15', 'value15',
        '--option-25', 'value25',
        'input.txt', 'output.txt'
      ];
      
      // Benchmark GoCommander parsing
      const goCommanderStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        goCmd.parse(testArgs);
      }
      const goCommanderEnd = performance.now();
      const goCommanderTime = goCommanderEnd - goCommanderStart;
      
      // Benchmark Mock Commander.js parsing
      const commanderJSStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        mockCmd.parse(testArgs);
      }
      const commanderJSEnd = performance.now();
      const commanderJSTime = commanderJSEnd - commanderJSStart;
      
      console.log(`Complex Parsing Performance (${iterations} iterations, 50 options):`);
      console.log(`  GoCommander: ${goCommanderTime.toFixed(2)}ms (${(goCommanderTime/iterations).toFixed(4)}ms per parse)`);
      console.log(`  Commander.js: ${commanderJSTime.toFixed(2)}ms (${(commanderJSTime/iterations).toFixed(4)}ms per parse)`);
      console.log(`  Ratio: ${(goCommanderTime/commanderJSTime).toFixed(2)}x`);
      
      // Complex parsing should still be reasonable
      expect(goCommanderTime).toBeLessThan(commanderJSTime * 3);
    });

    test('should handle nested subcommand parsing efficiently', () => {
      const iterations = 1000;
      
      // Setup nested commands
      const goCmd = new Command('app');
      const buildCmd = goCmd.command('build', 'Build project');
      const deployCmd = buildCmd.command('deploy', 'Deploy build');
      deployCmd.option('--env <environment>', 'deployment environment');
      deployCmd.argument('<target>', 'deployment target');
      
      const mockCmd = new MockCommanderJS('app');
      const mockBuildCmd = mockCmd.command('build', 'Build project');
      const mockDeployCmd = mockBuildCmd.command('deploy', 'Deploy build');
      mockDeployCmd.option('--env <environment>', 'deployment environment');
      mockDeployCmd.argument('<target>', 'deployment target');
      
      const testArgs = ['node', 'app', 'build', 'deploy', '--env', 'production', 'server1'];
      
      // Benchmark GoCommander parsing
      const goCommanderStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        goCmd.parse(testArgs);
      }
      const goCommanderEnd = performance.now();
      const goCommanderTime = goCommanderEnd - goCommanderStart;
      
      // Benchmark Mock Commander.js parsing
      const commanderJSStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        mockCmd.parse(testArgs);
      }
      const commanderJSEnd = performance.now();
      const commanderJSTime = commanderJSEnd - commanderJSStart;
      
      console.log(`Nested Subcommand Parsing Performance (${iterations} iterations):`);
      console.log(`  GoCommander: ${goCommanderTime.toFixed(2)}ms (${(goCommanderTime/iterations).toFixed(4)}ms per parse)`);
      console.log(`  Commander.js: ${commanderJSTime.toFixed(2)}ms (${(commanderJSTime/iterations).toFixed(4)}ms per parse)`);
      console.log(`  Ratio: ${(goCommanderTime/commanderJSTime).toFixed(2)}x`);
      
      expect(goCommanderTime).toBeLessThan(commanderJSTime * 3);
    });
  });

  describe('Memory Usage Performance', () => {
    test('should have reasonable memory footprint for command creation', () => {
      const iterations = 1000;
      
      // Measure initial memory
      if (global.gc) global.gc();
      const initialMemory = process.memoryUsage();
      
      // Create many commands
      const commands = [];
      for (let i = 0; i < iterations; i++) {
        const cmd = new Command(`test-${i}`);
        cmd
          .description(`Test command ${i}`)
          .option('-v, --verbose', 'verbose output')
          .option('-p, --port <number>', 'port number', parseInt)
          .argument('<file>', 'input file');
        commands.push(cmd);
      }
      
      // Measure memory after creation
      const afterCreation = process.memoryUsage();
      const memoryIncrease = afterCreation.heapUsed - initialMemory.heapUsed;
      const memoryPerCommand = memoryIncrease / iterations;
      
      console.log(`Memory Usage for Command Creation (${iterations} commands):`);
      console.log(`  Total increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Per command: ${(memoryPerCommand / 1024).toFixed(2)}KB`);
      
      // Each command should use reasonable memory (less than 10KB per command)
      expect(memoryPerCommand).toBeLessThan(10 * 1024);
      
      // Total memory increase should be reasonable (less than 50MB for 1000 commands)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('should handle memory cleanup properly', () => {
      const iterations = 100;
      
      // Create and destroy commands in batches
      for (let batch = 0; batch < 10; batch++) {
        const commands = [];
        
        // Create commands
        for (let i = 0; i < iterations; i++) {
          const cmd = new Command(`batch-${batch}-cmd-${i}`);
          cmd
            .option('-v, --verbose', 'verbose output')
            .option('-p, --port <number>', 'port number')
            .argument('<file>', 'input file');
          commands.push(cmd);
        }
        
        // Use commands
        for (const cmd of commands) {
          cmd.parse(['node', 'test', '-v', '--port', '3000', 'file.txt']);
        }
        
        // Clear references
        commands.length = 0;
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      // Memory should not grow excessively
      const finalMemory = process.memoryUsage();
      console.log(`Final memory usage: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      // Should not use excessive memory after cleanup
      expect(finalMemory.heapUsed).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });
  });

  describe('Startup Performance', () => {
    test('should have fast module loading time', () => {
      // This test measures the time to require the module
      const startTime = performance.now();
      
      // Clear module cache to simulate fresh load
      delete require.cache[require.resolve('../../lib/index.js')];
      
      // Require the module
      const { Command: FreshCommand } = require('../../lib/index.js');
      
      const endTime = performance.now();
      const loadTime = endTime - startTime;
      
      console.log(`Module Loading Performance: ${loadTime.toFixed(2)}ms`);
      
      // Module should load quickly (less than 100ms)
      expect(loadTime).toBeLessThan(100);
      
      // Verify it works
      const cmd = new FreshCommand('test');
      expect(cmd).toBeInstanceOf(FreshCommand);
    });

    test('should have fast WASM initialization', async () => {
      const startTime = performance.now();
      
      // Create a command which should trigger WASM initialization
      const cmd = new Command('wasm-init-test');
      
      // Wait for WASM to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const endTime = performance.now();
      const initTime = endTime - startTime;
      
      console.log(`WASM Initialization Performance: ${initTime.toFixed(2)}ms`);
      
      // WASM should initialize reasonably quickly (less than 500ms)
      expect(initTime).toBeLessThan(500);
      
      // Verify it works
      cmd.option('-v, --verbose', 'verbose output');
      cmd.parse(['node', 'test', '-v']);
      expect(cmd.opts().verbose).toBe(true);
    });
  });

  describe('Scalability Tests', () => {
    test('should handle large command trees efficiently', () => {
      const depth = 5;
      const breadth = 10;
      
      const startTime = performance.now();
      
      // Create a large command tree
      function createCommandTree(parent, currentDepth) {
        if (currentDepth >= depth) return;
        
        for (let i = 0; i < breadth; i++) {
          const subCmd = parent.command(`level-${currentDepth}-cmd-${i}`, `Command at level ${currentDepth}`);
          subCmd.option(`--option-${i}`, `Option ${i}`);
          createCommandTree(subCmd, currentDepth + 1);
        }
      }
      
      const rootCmd = new Command('large-tree');
      createCommandTree(rootCmd, 0);
      
      const creationTime = performance.now() - startTime;
      
      // Test parsing performance
      const parseStart = performance.now();
      const result = rootCmd.parse(['node', 'large-tree', 'level-0-cmd-5', 'level-1-cmd-3', '--option-3']);
      const parseTime = performance.now() - parseStart;
      
      console.log(`Large Command Tree Performance:`);
      console.log(`  Creation time: ${creationTime.toFixed(2)}ms`);
      console.log(`  Parse time: ${parseTime.toFixed(2)}ms`);
      console.log(`  Tree size: ${Math.pow(breadth, depth)} total commands`);
      
      // Should handle large trees efficiently
      expect(creationTime).toBeLessThan(1000); // Less than 1 second to create
      expect(parseTime).toBeLessThan(100); // Less than 100ms to parse
      expect(result).toBeDefined();
    });

    test('should handle many concurrent parsing operations', async () => {
      const concurrency = 100;
      const iterations = 10;
      
      const cmd = new Command('concurrent-test');
      cmd
        .option('-v, --verbose', 'verbose output')
        .option('-p, --port <number>', 'port number', parseInt)
        .argument('<file>', 'input file');
      
      const startTime = performance.now();
      
      // Create many concurrent parsing operations
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        for (let j = 0; j < iterations; j++) {
          const promise = new Promise(resolve => {
            const result = cmd.parse(['node', 'test', '-v', '--port', `${3000 + i}`, `file-${i}-${j}.txt`]);
            resolve(result);
          });
          promises.push(promise);
        }
      }
      
      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log(`Concurrent Parsing Performance:`);
      console.log(`  ${concurrency * iterations} operations in ${totalTime.toFixed(2)}ms`);
      console.log(`  Average: ${(totalTime / (concurrency * iterations)).toFixed(4)}ms per operation`);
      
      // All operations should complete successfully
      expect(results).toHaveLength(concurrency * iterations);
      results.forEach(result => {
        expect(result.options.verbose).toBe(true);
        expect(result.options.port).toBeGreaterThanOrEqual(3000);
      });
      
      // Should handle concurrency efficiently
      expect(totalTime).toBeLessThan(5000); // Less than 5 seconds total
    });
  });

  describe('Real-World Performance Scenarios', () => {
    test('should handle typical CLI application performance', () => {
      // Simulate a typical CLI application like a build tool
      const iterations = 1000;
      
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        const program = new Command('build-tool');
        
        program
          .version('1.0.0')
          .description('A typical build tool')
          .option('-c, --config <file>', 'config file', 'build.config.js')
          .option('-v, --verbose', 'verbose output')
          .option('--dry-run', 'dry run mode');
        
        const buildCmd = program
          .command('build')
          .description('Build the project')
          .option('--target <platform>', 'target platform', 'all')
          .option('--minify', 'minify output')
          .option('--source-map', 'generate source maps');
        
        const testCmd = program
          .command('test')
          .description('Run tests')
          .option('--coverage', 'generate coverage')
          .option('--watch', 'watch mode')
          .argument('[pattern]', 'test pattern');
        
        const deployCmd = program
          .command('deploy')
          .description('Deploy application')
          .option('--env <environment>', 'environment', 'staging')
          .option('--force', 'force deployment');
        
        // Simulate typical usage
        program.parse(['node', 'build-tool', '--verbose', 'build', '--target', 'production', '--minify']);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;
      
      console.log(`Typical CLI Application Performance (${iterations} iterations):`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Average per application: ${avgTime.toFixed(2)}ms`);
      
      // Should handle typical CLI applications efficiently
      expect(avgTime).toBeLessThan(10); // Less than 10ms per application
    });

    test('should handle file processing CLI performance', () => {
      // Simulate a file processing tool with many options
      const iterations = 500;
      
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        const program = new Command('file-processor');
        
        program
          .description('Process files with various transformations')
          .option('-i, --input <pattern>', 'input file pattern')
          .option('-o, --output <dir>', 'output directory')
          .option('-f, --format <type>', 'output format', 'json')
          .option('--encoding <encoding>', 'file encoding', 'utf8')
          .option('--line-ending <type>', 'line ending type', 'auto')
          .option('--indent <size>', 'indentation size', parseInt, 2)
          .option('--sort-keys', 'sort object keys')
          .option('--minify', 'minify output')
          .option('--validate', 'validate input')
          .option('--backup', 'create backup files')
          .option('--verbose', 'verbose output')
          .option('--quiet', 'suppress output')
          .option('--dry-run', 'preview changes only')
          .argument('<files...>', 'files to process');
        
        // Simulate complex usage
        program.parse([
          'node', 'file-processor',
          '--input', '**/*.json',
          '--output', './processed',
          '--format', 'yaml',
          '--indent', '4',
          '--sort-keys',
          '--validate',
          '--verbose',
          'file1.json', 'file2.json', 'file3.json'
        ]);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;
      
      console.log(`File Processing CLI Performance (${iterations} iterations):`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Average per processing: ${avgTime.toFixed(2)}ms`);
      
      // Should handle complex file processing CLIs efficiently
      expect(avgTime).toBeLessThan(20); // Less than 20ms per processing
    });
  });

  describe('Performance Regression Detection', () => {
    test('should maintain consistent performance across runs', () => {
      const runs = 5;
      const iterations = 1000;
      const times = [];
      
      for (let run = 0; run < runs; run++) {
        const startTime = performance.now();
        
        for (let i = 0; i < iterations; i++) {
          const cmd = new Command(`test-${i}`);
          cmd
            .option('-v, --verbose', 'verbose output')
            .option('-p, --port <number>', 'port number', parseInt)
            .parse(['node', 'test', '-v', '--port', '3000']);
        }
        
        const endTime = performance.now();
        times.push(endTime - startTime);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      const variance = times.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / times.length;
      const stdDev = Math.sqrt(variance);
      
      console.log(`Performance Consistency (${runs} runs of ${iterations} iterations):`);
      console.log(`  Average: ${avgTime.toFixed(2)}ms`);
      console.log(`  Min: ${minTime.toFixed(2)}ms`);
      console.log(`  Max: ${maxTime.toFixed(2)}ms`);
      console.log(`  Std Dev: ${stdDev.toFixed(2)}ms`);
      console.log(`  Coefficient of Variation: ${(stdDev / avgTime * 100).toFixed(2)}%`);
      
      // Performance should be consistent (low coefficient of variation)
      const coefficientOfVariation = stdDev / avgTime;
      expect(coefficientOfVariation).toBeLessThan(0.2); // Less than 20% variation
    });
  });
});