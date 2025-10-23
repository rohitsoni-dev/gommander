/**
 * Cross-Platform Testing Suite
 * Tests GoCommander compatibility across Windows, macOS, and Linux
 */

const os = require('os');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { Command } = require('../../lib/index.js');

describe('Cross-Platform Compatibility Tests', () => {
  const platform = os.platform();
  const arch = os.arch();
  const nodeVersion = process.version;
  let platformResults = {};

  beforeAll(() => {
    console.log(`\n=== Cross-Platform Test Environment ===`);
    console.log(`Platform: ${platform} ${arch}`);
    console.log(`Node.js: ${nodeVersion}`);
    console.log(`OS Release: ${os.release()}`);
    console.log(`Hostname: ${os.hostname()}`);
    console.log(`Uptime: ${Math.round(os.uptime() / 3600)}h`);
    console.log(`Load Average: ${os.loadavg().map(l => l.toFixed(2)).join(', ')}`);
    console.log(`=======================================\n`);
  });

  afterAll(() => {
    console.log(`\n=== Cross-Platform Test Results ===`);
    Object.entries(platformResults).forEach(([test, result]) => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${test}: ${result.duration}ms`);
      if (result.error) console.log(`  Error: ${result.error}`);
    });
    console.log(`===================================\n`);
  });

  describe('Platform Detection and Adaptation', () => {
    test('should detect current platform correctly', () => {
      expect(['win32', 'darwin', 'linux', 'freebsd', 'openbsd']).toContain(platform);
      expect(['x64', 'arm64', 'ia32', 'arm']).toContain(arch);
    });

    test('should work with platform-specific Node.js features', () => {
      const command = new Command('platform-test');
      
      // Test process.platform access
      command.option('--platform', 'show platform', platform);
      const result = command.parse(['node', 'test', '--platform']);
      
      expect(result.options.platform).toBe(platform);
    });

    test('should handle platform-specific environment variables', () => {
      const command = new Command('env-test');
      
      // Set platform-specific test environment variable
      const envVar = platform === 'win32' ? 'USERPROFILE' : 'HOME';
      const envValue = process.env[envVar];
      
      command.option('--home <path>', 'home directory', envValue);
      const result = command.parse(['node', 'test']);
      
      expect(result.options.home).toBe(envValue);
    });
  });

  describe('File Path Handling', () => {
    test('should handle platform-specific path separators', () => {
      const command = new Command('path-test');
      
      const testPaths = [
        // Unix-style paths
        '/usr/local/bin',
        './relative/path',
        '../parent/directory',
        '~/user/home',
        
        // Windows-style paths (should work on all platforms)
        'C:\\Program Files\\App',
        '.\\relative\\path',
        '..\\parent\\directory',
        
        // Mixed separators (Node.js should normalize)
        '/mixed\\path/separators\\here',
        
        // UNC paths (Windows)
        '\\\\server\\share\\file',
        
        // Long paths
        '/very/long/path/that/goes/deep/into/many/subdirectories/and/keeps/going/file.txt'
      ];

      for (const testPath of testPaths) {
        command
          .option('-f, --file <path>', 'file path')
          .parse(['node', 'test', '--file', testPath]);
        
        expect(command.getOptionValue('file')).toBe(testPath);
        
        // Reset for next iteration
        command.setOptionValue('file', undefined);
      }
    });

    test('should resolve relative paths correctly on all platforms', () => {
      const command = new Command('resolve-test');
      
      const relativePaths = [
        '.',
        '..',
        './current',
        '../parent',
        './sub/directory',
        '../sibling/directory'
      ];

      for (const relativePath of relativePaths) {
        const resolved = path.resolve(relativePath);
        
        command
          .option('-p, --path <path>', 'path to resolve')
          .parse(['node', 'test', '--path', relativePath]);
        
        const inputPath = command.getOptionValue('path');
        expect(inputPath).toBe(relativePath);
        
        // Verify we can resolve it
        expect(() => path.resolve(inputPath)).not.toThrow();
        
        command.setOptionValue('path', undefined);
      }
    });

    test('should handle path normalization across platforms', () => {
      const command = new Command('normalize-test');
      
      const pathsToNormalize = [
        'path//with//double//slashes',
        'path/./with/./dots',
        'path/../with/../dotdots',
        'path\\mixed/separators\\here',
        '/absolute/path/./with/../mixed/elements'
      ];

      for (const testPath of pathsToNormalize) {
        const normalized = path.normalize(testPath);
        
        command
          .option('-p, --path <path>', 'path to normalize')
          .parse(['node', 'test', '--path', testPath]);
        
        expect(command.getOptionValue('path')).toBe(testPath);
        expect(() => path.normalize(testPath)).not.toThrow();
        
        command.setOptionValue('path', undefined);
      }
    });
  });

  describe('Line Ending Handling', () => {
    test('should handle different line ending styles', () => {
      const command = new Command('line-ending-test');
      
      const textWithDifferentEndings = [
        'unix\nline\nendings',
        'windows\r\nline\r\nendings',
        'old\rmac\rendings',
        'mixed\n\r\nline\rendings\r\nhere',
        'no\nending',
        'trailing\nending\n'
      ];

      for (const text of textWithDifferentEndings) {
        command.description(text);
        expect(command.description()).toBe(text);
      }
    });

    test('should preserve line endings in multi-line descriptions', () => {
      const command = new Command('multiline-test');
      
      const multilineTexts = [
        'Line 1\nLine 2\nLine 3',
        'Line 1\r\nLine 2\r\nLine 3',
        'Line 1\rLine 2\rLine 3',
        'Mixed\nLine\r\nEndings\rHere'
      ];

      for (const text of multilineTexts) {
        command.description(text);
        expect(command.description()).toBe(text);
        
        // Verify help generation preserves line endings
        const help = command.helpInformation();
        expect(help).toContain(text);
      }
    });
  });

  describe('Character Encoding Support', () => {
    test('should handle UTF-8 characters correctly', () => {
      const command = new Command('utf8-test');
      
      const utf8Strings = [
        'English text',
        'Español con acentos: ñáéíóú',
        '中文字符测试',
        'العربية النص',
        'Русский текст',
        'Emoji test: 🚀 🎉 ✨ 🌍 💻',
        'Mixed: Hello 世界 🌍 Español',
        'Special chars: ©®™€£¥§¶†‡•…‰‹›""\'\'–—',
        'Math symbols: ∑∏∆∇∂∫∞≠≤≥±×÷√∝∈∉∪∩⊂⊃'
      ];

      for (const text of utf8Strings) {
        command.description(text);
        expect(command.description()).toBe(text);
        
        // Test in option descriptions
        command.option('--test', text);
        const option = command.options[command.options.length - 1];
        expect(option.description).toBe(text);
        
        // Reset for next iteration
        command._options = command._options.slice(0, -1);
      }
    });

    test('should handle Unicode normalization', () => {
      const command = new Command('unicode-test');
      
      // Test different Unicode normalization forms
      const testStrings = [
        'café', // NFC
        'cafe\u0301', // NFD (e + combining acute accent)
        'naïve',
        'naı̈ve', // Different composition
        'Zürich',
        'Zu\u0308rich' // Different composition
      ];

      for (const text of testStrings) {
        command.description(text);
        expect(command.description()).toBe(text);
      }
    });
  });

  describe('Process and Environment Integration', () => {
    test('should handle process.argv correctly on all platforms', () => {
      const command = new Command('argv-test');
      
      // Mock different argv scenarios
      const originalArgv = process.argv;
      
      const testArgvs = [
        ['node', 'script.js', '--option', 'value'],
        ['C:\\Program Files\\nodejs\\node.exe', 'C:\\app\\script.js', '--option', 'value'],
        ['/usr/local/bin/node', '/home/user/app/script.js', '--option', 'value'],
        ['node.exe', 'script.js', '--flag'],
        ['/opt/node/bin/node', './script.js', 'arg1', 'arg2']
      ];

      for (const testArgv of testArgvs) {
        process.argv = testArgv;
        
        command
          .option('--option <value>', 'test option')
          .argument('[args...]', 'test arguments');
        
        // Should parse without errors
        expect(() => {
          command.parse();
        }).not.toThrow();
        
        // Reset
        command.setOptionValue('option', undefined);
        command.args = [];
      }
      
      process.argv = originalArgv;
    });

    test('should handle environment variables across platforms', () => {
      const command = new Command('env-test');
      
      // Test common environment variables
      const commonEnvVars = [
        'NODE_ENV',
        'PATH',
        platform === 'win32' ? 'USERPROFILE' : 'HOME',
        platform === 'win32' ? 'APPDATA' : 'XDG_CONFIG_HOME'
      ];

      for (const envVar of commonEnvVars) {
        const envValue = process.env[envVar];
        if (envValue) {
          command.option(`--${envVar.toLowerCase()}`, `${envVar} value`, envValue);
          expect(command.getOptionValue(envVar.toLowerCase())).toBe(envValue);
        }
      }
    });

    test('should handle process exit codes correctly', () => {
      const command = new Command('exit-test');
      
      // Mock process.exit to capture exit codes
      const originalExit = process.exit;
      let capturedExitCode;
      
      process.exit = jest.fn((code) => {
        capturedExitCode = code;
      });

      command.argument('<required>', 'required argument');
      
      try {
        command.parse(['node', 'test']);
      } catch (error) {
        // Should handle missing argument
        expect(error.exitCode).toBeDefined();
      }
      
      process.exit = originalExit;
    });
  });

  describe('File System Operations', () => {
    test('should handle file system case sensitivity differences', () => {
      const command = new Command('case-test');
      
      // Test case variations (important for case-sensitive vs case-insensitive filesystems)
      const fileNames = [
        'file.txt',
        'File.txt',
        'FILE.TXT',
        'file.TXT',
        'MyFile.js',
        'myfile.js',
        'MYFILE.JS'
      ];

      for (const fileName of fileNames) {
        command
          .option('-f, --file <name>', 'file name')
          .parse(['node', 'test', '--file', fileName]);
        
        expect(command.getOptionValue('file')).toBe(fileName);
        command.setOptionValue('file', undefined);
      }
    });

    test('should handle different file extensions', () => {
      const command = new Command('extension-test');
      
      const fileExtensions = [
        '.js',
        '.ts',
        '.json',
        '.txt',
        '.md',
        '.exe', // Windows
        '.app', // macOS
        '.deb', // Linux
        '.tar.gz',
        '.config.js',
        '.test.spec.js'
      ];

      for (const ext of fileExtensions) {
        const fileName = `testfile${ext}`;
        command
          .option('-f, --file <name>', 'file name')
          .parse(['node', 'test', '--file', fileName]);
        
        expect(command.getOptionValue('file')).toBe(fileName);
        command.setOptionValue('file', undefined);
      }
    });
  });

  describe('Shell Integration', () => {
    test('should handle different shell environments', () => {
      const command = new Command('shell-test');
      
      // Test shell-specific environment variables
      const shellVars = [
        'SHELL', // Unix shells
        'COMSPEC', // Windows Command Prompt
        'PSModulePath', // PowerShell
        'TERM', // Terminal type
        'COLORTERM' // Color terminal support
      ];

      for (const shellVar of shellVars) {
        const value = process.env[shellVar];
        if (value) {
          command.option(`--${shellVar.toLowerCase()}`, `${shellVar} value`, value);
          expect(command.getOptionValue(shellVar.toLowerCase())).toBe(value);
        }
      }
    });

    test('should handle command line length limits', () => {
      const command = new Command('cmdline-test');
      
      // Test with very long command lines (different limits on different platforms)
      const maxLength = platform === 'win32' ? 8191 : 131072; // Windows vs Unix limits
      
      // Create a long option value (but not too long to cause issues)
      const longValue = 'x'.repeat(Math.min(1000, maxLength / 10));
      
      command
        .option('-l, --long <value>', 'long value')
        .parse(['node', 'test', '--long', longValue]);
      
      expect(command.getOptionValue('long')).toBe(longValue);
    });
  });

  describe('Performance Across Platforms', () => {
    test('should maintain consistent performance across platforms', () => {
      const iterations = 1000;
      const command = new Command('perf-test');
      
      command
        .option('-v, --verbose', 'verbose output')
        .option('-p, --port <number>', 'port number', parseInt)
        .argument('<file>', 'input file');

      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        command.parse(['node', 'test', '-v', '--port', '3000', 'file.txt']);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const avgTime = duration / iterations;
      
      console.log(`Platform ${platform} performance: ${avgTime.toFixed(2)}ms per parse`);
      
      // Performance should be reasonable on all platforms
      expect(avgTime).toBeLessThan(20); // Less than 20ms per parse
    });

    test('should handle memory usage consistently', () => {
      const initialMemory = process.memoryUsage();
      const commands = [];
      
      // Create many commands to test memory usage
      for (let i = 0; i < 1000; i++) {
        const cmd = new Command(`test-${i}`);
        cmd
          .option('-v, --verbose', 'verbose output')
          .option('-p, --port <number>', 'port number')
          .argument('<file>', 'input file');
        
        commands.push(cmd);
      }
      
      const afterCreation = process.memoryUsage();
      
      // Parse with all commands
      for (const cmd of commands) {
        cmd.parse(['node', 'test', '-v', '--port', '3000', 'file.txt']);
      }
      
      const afterParsing = process.memoryUsage();
      
      // Memory usage should be reasonable
      const creationIncrease = afterCreation.heapUsed - initialMemory.heapUsed;
      const parsingIncrease = afterParsing.heapUsed - afterCreation.heapUsed;
      
      console.log(`Memory usage on ${platform}:`);
      console.log(`  Creation: ${(creationIncrease / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Parsing: ${(parsingIncrease / 1024 / 1024).toFixed(2)}MB`);
      
      // Should not use excessive memory
      expect(creationIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB
      expect(parsingIncrease).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
    });
  });

  describe('Platform-Specific Features', () => {
    test('should handle Windows-specific features', () => {
      if (platform !== 'win32') {
        return; // Skip on non-Windows platforms
      }

      const command = new Command('windows-test');
      
      // Test Windows-specific paths
      command
        .option('-p, --path <path>', 'Windows path')
        .parse(['node', 'test', '--path', 'C:\\Program Files\\App']);
      
      expect(command.getOptionValue('path')).toBe('C:\\Program Files\\App');
      
      // Test UNC paths
      command
        .option('-u, --unc <path>', 'UNC path')
        .parse(['node', 'test', '--unc', '\\\\server\\share']);
      
      expect(command.getOptionValue('unc')).toBe('\\\\server\\share');
    });

    test('should handle Unix-specific features', () => {
      if (platform === 'win32') {
        return; // Skip on Windows
      }

      const command = new Command('unix-test');
      
      // Test Unix-specific paths
      command
        .option('-p, --path <path>', 'Unix path')
        .parse(['node', 'test', '--path', '/usr/local/bin']);
      
      expect(command.getOptionValue('path')).toBe('/usr/local/bin');
      
      // Test home directory expansion
      const homeDir = process.env.HOME;
      if (homeDir) {
        command
          .option('-h, --home <path>', 'Home path')
          .parse(['node', 'test', '--home', '~/documents']);
        
        expect(command.getOptionValue('home')).toBe('~/documents');
      }
    });

    test('should handle macOS-specific features', () => {
      if (platform !== 'darwin') {
        return; // Skip on non-macOS platforms
      }

      const command = new Command('macos-test');
      
      // Test macOS-specific paths
      command
        .option('-a, --app <path>', 'App path')
        .parse(['node', 'test', '--app', '/Applications/MyApp.app']);
      
      expect(command.getOptionValue('app')).toBe('/Applications/MyApp.app');
    });
  });

  describe('Regression Tests for Platform Issues', () => {
    test('should handle path separators in help text', () => {
      const command = new Command('help-path-test');
      
      command
        .description('Test command with path examples')
        .option('-f, --file <path>', 'File path (e.g., /path/to/file or C:\\path\\to\\file)')
        .argument('<input>', 'Input file path');

      const help = command.helpInformation();
      
      // Help should contain the description without breaking
      expect(help).toContain('Test command with path examples');
      expect(help).toContain('File path');
    });

    test('should handle special characters in command names', () => {
      // Test various characters that might cause issues
      const specialChars = ['-', '_', '.'];
      
      for (const char of specialChars) {
        const cmdName = `test${char}command`;
        const command = new Command(cmdName);
        
        expect(command.name()).toBe(cmdName);
        
        // Should parse correctly
        const result = command.parse(['node', cmdName]);
        expect(result).toBeDefined();
      }
    });

    test('should handle locale-specific number formatting', () => {
      const command = new Command('locale-test');
      
      // Test number parsing with different locale formats
      const numberStrings = [
        '1234',
        '1,234', // US format
        '1.234', // European format
        '1234.56',
        '1,234.56',
        '1.234,56' // European decimal
      ];

      for (const numStr of numberStrings) {
        command
          .option('-n, --number <num>', 'number value', parseFloat)
          .parse(['node', 'test', '--number', numStr]);
        
        const parsed = command.getOptionValue('number');
        expect(typeof parsed).toBe('number');
        
        command.setOptionValue('number', undefined);
      }
    });
  });
});