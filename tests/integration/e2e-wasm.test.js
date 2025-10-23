/**
 * End-to-End Integration Tests with Real WASM Compilation
 * Tests the complete GoCommander pipeline from Go source to JavaScript execution
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync, spawn } = require('child_process');
const { Command } = require('../../lib/index.js');

describe('End-to-End WASM Integration Tests', () => {
  let wasmPath;
  let originalWasm;

  beforeAll(async () => {
    // Ensure WASM binary exists
    wasmPath = path.join(__dirname, '../../wasm/gocommander.wasm');
    try {
      await fs.access(wasmPath);
      originalWasm = await fs.readFile(wasmPath);
    } catch (error) {
      // Build WASM if it doesn't exist
      console.log('Building WASM binary for integration tests...');
      execSync('npm run build:wasm', { 
        cwd: path.join(__dirname, '../..'),
        stdio: 'inherit'
      });
      originalWasm = await fs.readFile(wasmPath);
    }
  });

  afterAll(async () => {
    // Restore original WASM if modified during tests
    if (originalWasm) {
      await fs.writeFile(wasmPath, originalWasm);
    }
  });

  describe('WASM Loading and Initialization', () => {
    test('should load WASM binary successfully', async () => {
      const wasmBuffer = await fs.readFile(wasmPath);
      expect(wasmBuffer).toBeInstanceOf(Buffer);
      expect(wasmBuffer.length).toBeGreaterThan(0);
      
      // Verify it's a valid WASM binary
      const magicNumber = wasmBuffer.slice(0, 4);
      expect(magicNumber).toEqual(Buffer.from([0x00, 0x61, 0x73, 0x6d])); // WASM magic number
    });

    test('should instantiate WASM module with Go runtime', async () => {
      const { WASMLoader } = require('../../src/wasm-loader');
      
      const wasmInstance = await WASMLoader.loadWASM();
      expect(wasmInstance).toBeDefined();
      expect(wasmInstance.exports).toBeDefined();
    });

    test('should initialize Go runtime and exports', async () => {
      const command = new Command('test-wasm');
      
      // Wait for WASM initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(command._wasmInstance).toBeDefined();
      expect(command._commandId).toBeDefined();
    });
  });

  describe('Real WASM Command Processing', () => {
    let command;

    beforeEach(async () => {
      command = new Command('integration-test');
      // Ensure WASM is loaded
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    test('should process basic command through WASM', async () => {
      command
        .description('Integration test command')
        .option('-v, --verbose', 'verbose output')
        .option('-p, --port <number>', 'port number', parseInt, 3000)
        .argument('<file>', 'input file');

      const result = command.parse(['node', 'test', '-v', '--port', '8080', 'input.txt']);
      
      expect(result.options.verbose).toBe(true);
      expect(result.options.port).toBe(8080);
      expect(result.args).toContain('input.txt');
    });

    test('should handle complex nested subcommands through WASM', async () => {
      const buildCmd = command
        .command('build')
        .description('Build the project')
        .option('--target <platform>', 'target platform', 'linux')
        .action(() => {});

      const deployCmd = buildCmd
        .command('deploy')
        .description('Deploy after build')
        .option('--env <environment>', 'deployment environment', 'staging')
        .action(() => {});

      const result = command.parse(['node', 'test', 'build', 'deploy', '--env', 'production']);
      
      expect(result.command).toBe('deploy');
      expect(result.options.env).toBe('production');
    });

    test('should handle variadic arguments through WASM', async () => {
      command
        .argument('<files...>', 'input files')
        .action(() => {});

      const result = command.parse(['node', 'test', 'file1.txt', 'file2.txt', 'file3.txt']);
      
      expect(result.args).toEqual(['file1.txt', 'file2.txt', 'file3.txt']);
    });

    test('should process custom option parsers through WASM', async () => {
      const parseList = (value, previous = []) => {
        return previous.concat([value]);
      };

      command
        .option('-i, --include <item>', 'include item', parseList, [])
        .action(() => {});

      const result = command.parse(['node', 'test', '-i', 'item1', '-i', 'item2', '-i', 'item3']);
      
      expect(result.options.include).toEqual(['item1', 'item2', 'item3']);
    });
  });

  describe('Error Handling Through WASM', () => {
    let command;

    beforeEach(async () => {
      command = new Command('error-test');
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    test('should handle missing required arguments through WASM', () => {
      command
        .argument('<required>', 'required argument')
        .exitOverride();

      expect(() => {
        command.parse(['node', 'test']);
      }).toThrow(/missing required argument/);
    });

    test('should handle unknown options through WASM', () => {
      command.exitOverride();

      expect(() => {
        command.parse(['node', 'test', '--unknown-option']);
      }).toThrow(/unknown option/);
    });

    test('should handle invalid option values through WASM', () => {
      command
        .option('-p, --port <number>', 'port number', parseInt)
        .exitOverride();

      expect(() => {
        command.parse(['node', 'test', '--port', 'invalid']);
      }).toThrow(/invalid value/);
    });
  });

  describe('Memory Management Integration', () => {
    test('should handle memory allocation and cleanup', async () => {
      const commands = [];
      
      // Create multiple commands to test memory management
      for (let i = 0; i < 100; i++) {
        const cmd = new Command(`test-${i}`);
        cmd.option(`-o${i}, --option${i}`, `option ${i}`);
        commands.push(cmd);
      }

      // Parse with each command
      for (const cmd of commands) {
        cmd.parse(['node', 'test', `--option${commands.indexOf(cmd)}`]);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Verify commands still work after potential cleanup
      const lastCmd = commands[commands.length - 1];
      const result = lastCmd.parse(['node', 'test', `--option${commands.length - 1}`]);
      expect(result).toBeDefined();
    });

    test('should handle string marshaling between Go and JS', async () => {
      const command = new Command('string-test');
      
      // Test with various string types
      const testStrings = [
        'simple',
        'with spaces',
        'with-dashes',
        'with_underscores',
        'with.dots',
        'with/slashes',
        'with\\backslashes',
        'with"quotes',
        "with'apostrophes",
        'with\nnewlines',
        'with\ttabs',
        'unicode: 你好世界 🌍',
        'emoji: 🚀 🎉 ✨',
        'special: !@#$%^&*()[]{}|;:,.<>?'
      ];

      for (const testString of testStrings) {
        command.description(testString);
        expect(command.description()).toBe(testString);
      }
    });
  });

  describe('Performance Under Load', () => {
    test('should handle rapid command creation and parsing', async () => {
      const startTime = Date.now();
      const iterations = 1000;
      
      for (let i = 0; i < iterations; i++) {
        const cmd = new Command(`perf-test-${i}`);
        cmd
          .option('-v, --verbose', 'verbose output')
          .option('-p, --port <number>', 'port number', parseInt)
          .argument('<file>', 'input file');
        
        cmd.parse(['node', 'test', '-v', '--port', '3000', 'file.txt']);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const avgTime = duration / iterations;
      
      console.log(`Performance test: ${iterations} iterations in ${duration}ms (avg: ${avgTime.toFixed(2)}ms per iteration)`);
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(avgTime).toBeLessThan(10); // Less than 10ms per iteration
    });

    test('should handle large command trees efficiently', async () => {
      const rootCmd = new Command('large-tree');
      
      // Create a large command tree
      for (let i = 0; i < 50; i++) {
        const subCmd = rootCmd.command(`sub${i}`, `Subcommand ${i}`);
        
        for (let j = 0; j < 10; j++) {
          subCmd.option(`--opt${j} <value>`, `Option ${j}`);
        }
        
        for (let k = 0; k < 5; k++) {
          subCmd.command(`nested${k}`, `Nested command ${k}`);
        }
      }
      
      const startTime = Date.now();
      const result = rootCmd.parse(['node', 'test', 'sub25', 'nested2', '--opt3', 'value']);
      const endTime = Date.now();
      
      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(100); // Should parse quickly
    });
  });

  describe('Cross-Platform Compatibility', () => {
    test('should handle platform-specific path separators', async () => {
      const command = new Command('path-test');
      
      const testPaths = [
        '/unix/style/path',
        'C:\\Windows\\Style\\Path',
        './relative/path',
        '../parent/path',
        '~/home/path'
      ];

      for (const testPath of testPaths) {
        command
          .option('-f, --file <path>', 'file path')
          .parse(['node', 'test', '--file', testPath]);
        
        expect(command.getOptionValue('file')).toBe(testPath);
      }
    });

    test('should handle different line ending styles', async () => {
      const command = new Command('line-ending-test');
      
      const testTexts = [
        'unix\nline\nendings',
        'windows\r\nline\r\nendings',
        'old\rmac\rendings',
        'mixed\n\r\nline\rendings'
      ];

      for (const testText of testTexts) {
        command.description(testText);
        expect(command.description()).toBe(testText);
      }
    });

    test('should work with different Node.js versions', () => {
      const nodeVersion = process.version;
      console.log(`Testing with Node.js version: ${nodeVersion}`);
      
      // Test basic functionality works regardless of Node version
      const command = new Command('version-test');
      command.option('-v, --version', 'show version');
      
      const result = command.parse(['node', 'test', '--version']);
      expect(result.options.version).toBe(true);
    });
  });

  describe('Real-World Usage Scenarios', () => {
    test('should handle CLI application with file processing', async () => {
      const command = new Command('file-processor');
      
      command
        .description('Process files with various options')
        .option('-i, --input <file>', 'input file')
        .option('-o, --output <file>', 'output file')
        .option('-f, --format <type>', 'output format', 'json')
        .option('--verbose', 'verbose output')
        .option('--dry-run', 'dry run mode')
        .argument('[files...]', 'additional files to process')
        .action((files, options) => {
          return { files, options };
        });

      const result = command.parse([
        'node', 'file-processor',
        '--input', 'input.txt',
        '--output', 'output.json',
        '--format', 'xml',
        '--verbose',
        '--dry-run',
        'extra1.txt', 'extra2.txt'
      ]);

      expect(result.options.input).toBe('input.txt');
      expect(result.options.output).toBe('output.json');
      expect(result.options.format).toBe('xml');
      expect(result.options.verbose).toBe(true);
      expect(result.options.dryRun).toBe(true);
      expect(result.args).toEqual(['extra1.txt', 'extra2.txt']);
    });

    test('should handle build tool with subcommands', async () => {
      const program = new Command('build-tool');
      
      program
        .description('A build tool with multiple commands')
        .option('-c, --config <file>', 'config file', 'build.json')
        .option('--verbose', 'verbose output');

      const buildCmd = program
        .command('build')
        .description('Build the project')
        .option('--target <platform>', 'target platform', 'all')
        .option('--minify', 'minify output')
        .action(() => 'build executed');

      const testCmd = program
        .command('test')
        .description('Run tests')
        .option('--coverage', 'generate coverage report')
        .option('--watch', 'watch mode')
        .action(() => 'test executed');

      const deployCmd = program
        .command('deploy')
        .description('Deploy the application')
        .option('--env <environment>', 'deployment environment', 'staging')
        .option('--force', 'force deployment')
        .action(() => 'deploy executed');

      // Test build command
      const buildResult = program.parse([
        'node', 'build-tool',
        '--config', 'custom.json',
        '--verbose',
        'build',
        '--target', 'linux',
        '--minify'
      ]);

      expect(buildResult.command).toBe('build');
      expect(buildResult.options.config).toBe('custom.json');
      expect(buildResult.options.verbose).toBe(true);
      expect(buildResult.options.target).toBe('linux');
      expect(buildResult.options.minify).toBe(true);
    });

    test('should handle interactive CLI with prompts simulation', async () => {
      const command = new Command('interactive-cli');
      
      command
        .description('Interactive CLI application')
        .option('-y, --yes', 'answer yes to all prompts')
        .option('--name <name>', 'project name')
        .option('--template <template>', 'project template', 'basic')
        .argument('[directory]', 'project directory', '.')
        .action((directory, options) => {
          // Simulate interactive behavior
          const config = {
            directory,
            name: options.name || 'my-project',
            template: options.template,
            autoConfirm: options.yes
          };
          return config;
        });

      const result = command.parse([
        'node', 'interactive-cli',
        '--yes',
        '--name', 'awesome-project',
        '--template', 'advanced',
        'my-app-dir'
      ]);

      expect(result.directory).toBe('my-app-dir');
      expect(result.name).toBe('awesome-project');
      expect(result.template).toBe('advanced');
      expect(result.autoConfirm).toBe(true);
    });
  });
});