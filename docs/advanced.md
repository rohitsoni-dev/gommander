# Advanced Usage

This guide covers advanced GoCommander features and patterns for building sophisticated CLI applications.

## Table of Contents

- [Custom Option and Argument Classes](#custom-option-and-argument-classes)
- [Advanced Parsing Configuration](#advanced-parsing-configuration)
- [Lifecycle Hooks and Events](#lifecycle-hooks-and-events)
- [Custom Help and Output](#custom-help-and-output)
- [Error Handling Strategies](#error-handling-strategies)
- [Performance Optimization](#performance-optimization)
- [Plugin Architecture](#plugin-architecture)
- [Testing CLI Applications](#testing-cli-applications)

## Custom Option and Argument Classes

### Advanced Option Configuration

```javascript
const { program, Option } = require('gocommander');

// Complex option with multiple features
const databaseOption = new Option('-d, --database <url>', 'database connection URL')
  .env('DATABASE_URL')                    // Environment variable fallback
  .argParser((value) => {                 // Custom validation
    if (!value.startsWith('postgresql://')) {
      throw new Error('Database URL must be a PostgreSQL connection string');
    }
    return value;
  })
  .conflicts(['sqlite', 'memory'])        // Conflicting options
  .implies({ 'migrate': true })           // Implied options
  .makeOptionMandatory()                  // Required option
  .hideHelp(process.env.NODE_ENV === 'production'); // Conditional visibility

program.addOption(databaseOption);
```

### Custom Argument Processors

```javascript
const { Argument } = require('gocommander');

// File path argument with validation
const inputFileArg = new Argument('<input>', 'input file path')
  .argParser((value) => {
    const fs = require('fs');
    const path = require('path');
    
    const fullPath = path.resolve(value);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Input file not found: ${value}`);
    }
    
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${value}`);
    }
    
    // Return enhanced file info
    return {
      path: fullPath,
      size: stats.size,
      modified: stats.mtime,
      extension: path.extname(fullPath)
    };
  });

program
  .command('process')
  .addArgument(inputFileArg)
  .action((fileInfo) => {
    console.log(`Processing file: ${fileInfo.path}`);
    console.log(`Size: ${fileInfo.size} bytes`);
    console.log(`Extension: ${fileInfo.extension}`);
  });
```

### Option Groups and Dependencies

```javascript
// Create related option groups
const createServerOptions = () => {
  const portOption = new Option('-p, --port <number>', 'server port')
    .argParser(parseInt)
    .default(3000);
    
  const hostOption = new Option('-h, --host <address>', 'server host')
    .default('localhost');
    
  const sslOption = new Option('--ssl', 'enable SSL')
    .implies({ 'cert': true, 'key': true });
    
  const certOption = new Option('--cert <path>', 'SSL certificate path')
    .argParser((value) => {
      const fs = require('fs');
      if (!fs.existsSync(value)) {
        throw new Error(`Certificate file not found: ${value}`);
      }
      return value;
    });
    
  const keyOption = new Option('--key <path>', 'SSL private key path')
    .argParser((value) => {
      const fs = require('fs');
      if (!fs.existsSync(value)) {
        throw new Error(`Private key file not found: ${value}`);
      }
      return value;
    });
    
  return [portOption, hostOption, sslOption, certOption, keyOption];
};

const serverOptions = createServerOptions();
serverOptions.forEach(option => program.addOption(option));
```

## Advanced Parsing Configuration

### Positional Options

```javascript
program
  .enablePositionalOptions()  // Allow options after arguments
  .passThroughOptions()       // Pass unknown options to subcommands
  .allowUnknownOption()       // Don't error on unknown options
  .storeOptionsAsProperties(false); // Store options in opts() object
```

### Custom Parsing Behavior

```javascript
// Custom argument parsing
program
  .command('flexible <command>')
  .allowUnknownOption()
  .action((command, options, cmd) => {
    const unknownArgs = cmd.args.slice(1); // Get remaining arguments
    const unknownOpts = cmd.parent.rawArgs.filter(arg => 
      arg.startsWith('-') && !cmd.parent.options.some(opt => 
        opt.short === arg || opt.long === arg
      )
    );
    
    console.log('Command:', command);
    console.log('Unknown arguments:', unknownArgs);
    console.log('Unknown options:', unknownOpts);
  });
```

### Environment Variable Integration

```javascript
// Comprehensive environment variable support
const createEnvAwareOptions = () => {
  return [
    new Option('--api-key <key>', 'API key')
      .env('API_KEY')
      .makeOptionMandatory(),
      
    new Option('--log-level <level>', 'logging level')
      .choices(['error', 'warn', 'info', 'debug'])
      .env('LOG_LEVEL')
      .default('info'),
      
    new Option('--timeout <ms>', 'request timeout')
      .env('REQUEST_TIMEOUT')
      .argParser(parseInt)
      .default(5000),
      
    new Option('--config <path>', 'configuration file')
      .env('CONFIG_FILE')
      .argParser((value) => {
        const fs = require('fs');
        const path = require('path');
        
        const configPath = path.resolve(value);
        if (!fs.existsSync(configPath)) {
          throw new Error(`Config file not found: ${value}`);
        }
        
        try {
          return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (error) {
          throw new Error(`Invalid JSON in config file: ${error.message}`);
        }
      })
  ];
};
```

## Lifecycle Hooks and Events

### Command Lifecycle Hooks

```javascript
program
  .hook('preAction', (thisCommand, actionCommand) => {
    console.log(`About to execute: ${actionCommand.name()}`);
    
    // Validate global state
    const options = thisCommand.opts();
    if (options.requiresAuth && !process.env.AUTH_TOKEN) {
      throw new Error('Authentication required. Set AUTH_TOKEN environment variable.');
    }
    
    // Log command execution
    console.log(`[${new Date().toISOString()}] Executing: ${actionCommand.name()}`);
  })
  .hook('postAction', (thisCommand, actionCommand) => {
    console.log(`Completed: ${actionCommand.name()}`);
    
    // Cleanup or logging
    const duration = Date.now() - thisCommand._startTime;
    console.log(`Execution time: ${duration}ms`);
  });

// Set start time in preAction
program.hook('preAction', (thisCommand) => {
  thisCommand._startTime = Date.now();
});
```

### Event-Driven Architecture

```javascript
const { EventEmitter } = require('events');

class CLIEventManager extends EventEmitter {
  constructor() {
    super();
    this.setupGlobalHandlers();
  }
  
  setupGlobalHandlers() {
    // Handle command start
    this.on('command:start', (command, options) => {
      console.log(`🚀 Starting command: ${command}`);
    });
    
    // Handle command completion
    this.on('command:complete', (command, result) => {
      console.log(`✅ Command completed: ${command}`);
    });
    
    // Handle errors
    this.on('command:error', (command, error) => {
      console.error(`❌ Command failed: ${command} - ${error.message}`);
    });
  }
  
  wrapAction(actionFn, commandName) {
    return async (...args) => {
      try {
        this.emit('command:start', commandName, args);
        const result = await actionFn(...args);
        this.emit('command:complete', commandName, result);
        return result;
      } catch (error) {
        this.emit('command:error', commandName, error);
        throw error;
      }
    };
  }
}

const eventManager = new CLIEventManager();

// Use with commands
program
  .command('deploy')
  .action(eventManager.wrapAction(async (options) => {
    // Deployment logic here
    return { status: 'success', deploymentId: '12345' };
  }, 'deploy'));
```

### Async Action Handling

```javascript
// Comprehensive async action handling
program
  .command('async-operation')
  .option('--parallel <count>', 'parallel operations', parseInt, 1)
  .option('--retry <count>', 'retry attempts', parseInt, 3)
  .action(async (options) => {
    const operations = Array.from({ length: options.parallel }, (_, i) => 
      performAsyncOperation(i, options.retry)
    );
    
    try {
      const results = await Promise.allSettled(operations);
      
      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');
      
      console.log(`✅ Successful: ${successful.length}`);
      console.log(`❌ Failed: ${failed.length}`);
      
      if (failed.length > 0) {
        console.error('Failures:');
        failed.forEach((result, index) => {
          console.error(`  Operation ${index}: ${result.reason.message}`);
        });
        process.exit(1);
      }
      
    } catch (error) {
      console.error('Critical error:', error.message);
      process.exit(1);
    }
  });

async function performAsyncOperation(id, retries) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (Math.random() < 0.3) { // 30% failure rate
        throw new Error(`Operation ${id} failed on attempt ${attempt}`);
      }
      
      return { id, attempt, status: 'success' };
    } catch (error) {
      if (attempt === retries) throw error;
      console.warn(`Retry ${attempt}/${retries} for operation ${id}`);
    }
  }
}
```

## Custom Help and Output

### Advanced Help Customization

```javascript
const { Help } = require('gocommander');

class AdvancedHelp extends Help {
  constructor() {
    super();
    this.theme = {
      primary: '\x1b[36m',    // Cyan
      secondary: '\x1b[33m',  // Yellow
      success: '\x1b[32m',    // Green
      error: '\x1b[31m',      // Red
      reset: '\x1b[0m'        // Reset
    };
  }
  
  formatHelp(cmd, helper) {
    const { primary, secondary, reset } = this.theme;
    
    let output = `\n${primary}╭─ ${cmd.name().toUpperCase()} ─╮${reset}\n`;
    
    // Usage with colors
    output += `\n${secondary}Usage:${reset} ${cmd.usage()}\n`;
    
    // Description
    if (cmd.description()) {
      output += `\n${cmd.description()}\n`;
    }
    
    // Arguments with enhanced formatting
    const args = helper.visibleArguments(cmd);
    if (args.length > 0) {
      output += `\n${secondary}Arguments:${reset}\n`;
      args.forEach(arg => {
        const term = helper.argumentTerm(arg);
        const desc = arg.description || '';
        const required = arg.required ? `${this.theme.error}*${reset}` : ' ';
        output += `  ${required}${primary}${term}${reset}  ${desc}\n`;
      });
    }
    
    // Options with grouping
    const options = helper.visibleOptions(cmd);
    if (options.length > 0) {
      const grouped = this.groupOptions(options);
      
      Object.entries(grouped).forEach(([group, opts]) => {
        output += `\n${secondary}${group}:${reset}\n`;
        opts.forEach(option => {
          const term = helper.optionTerm(option);
          const desc = option.description || '';
          const required = option.mandatory ? `${this.theme.error}*${reset}` : ' ';
          output += `  ${required}${primary}${term}${reset}  ${desc}\n`;
        });
      });
    }
    
    return output;
  }
  
  groupOptions(options) {
    const groups = {
      'Required Options': [],
      'Optional Options': [],
      'Global Options': []
    };
    
    options.forEach(option => {
      if (option.mandatory) {
        groups['Required Options'].push(option);
      } else if (option.flags.includes('--global')) {
        groups['Global Options'].push(option);
      } else {
        groups['Optional Options'].push(option);
      }
    });
    
    // Remove empty groups
    Object.keys(groups).forEach(key => {
      if (groups[key].length === 0) {
        delete groups[key];
      }
    });
    
    return groups;
  }
}

program.configureHelp(new AdvancedHelp());
```

### Dynamic Help Content

```javascript
// Context-aware help
program.addHelpText('afterAll', (context) => {
  const { command, program: prog } = context;
  const isSubcommand = command !== prog;
  
  let helpText = '\n';
  
  // Show different content based on user role
  const userRole = process.env.USER_ROLE || 'user';
  
  if (userRole === 'admin') {
    helpText += '👑 Administrator Features:\n';
    helpText += '  • Advanced debugging options available\n';
    helpText += '  • System-level commands accessible\n';
    helpText += '  • Audit logging enabled\n\n';
  }
  
  // Show environment-specific help
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'development') {
    helpText += '🔧 Development Mode:\n';
    helpText += '  • Debug logging available with --verbose\n';
    helpText += '  • Hot reload enabled for configuration\n';
    helpText += '  • Test data generation commands available\n\n';
  }
  
  // Show platform-specific information
  const platform = process.platform;
  
  if (platform === 'win32') {
    helpText += '🪟 Windows-specific notes:\n';
    helpText += '  • Use PowerShell for best experience\n';
    helpText += '  • File paths use backslashes\n';
    helpText += '  • Some Unix commands may not be available\n\n';
  }
  
  return helpText;
});
```

## Error Handling Strategies

### Comprehensive Error Management

```javascript
class CLIError extends Error {
  constructor(message, code = 'CLI_ERROR', exitCode = 1) {
    super(message);
    this.name = 'CLIError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

class ValidationError extends CLIError {
  constructor(message, field) {
    super(message, 'VALIDATION_ERROR', 2);
    this.field = field;
  }
}

class NetworkError extends CLIError {
  constructor(message, statusCode) {
    super(message, 'NETWORK_ERROR', 3);
    this.statusCode = statusCode;
  }
}

// Global error handler
const handleError = (error) => {
  const isVerbose = program.opts().verbose;
  
  if (error instanceof ValidationError) {
    console.error(`❌ Validation Error: ${error.message}`);
    if (error.field) {
      console.error(`   Field: ${error.field}`);
    }
  } else if (error instanceof NetworkError) {
    console.error(`🌐 Network Error: ${error.message}`);
    if (error.statusCode) {
      console.error(`   Status Code: ${error.statusCode}`);
    }
  } else if (error instanceof CLIError) {
    console.error(`⚠️  CLI Error: ${error.message}`);
  } else {
    console.error(`💥 Unexpected Error: ${error.message}`);
  }
  
  if (isVerbose && error.stack) {
    console.error('\nStack trace:');
    console.error(error.stack);
  }
  
  process.exit(error.exitCode || 1);
};

// Set up global error handling
process.on('uncaughtException', handleError);
process.on('unhandledRejection', (reason) => {
  handleError(new CLIError(`Unhandled promise rejection: ${reason}`));
});

program.exitOverride(handleError);
```

### Graceful Degradation

```javascript
// Graceful degradation for optional features
const tryOptionalFeature = async (featureName, fn, fallback) => {
  try {
    return await fn();
  } catch (error) {
    const verbose = program.opts().verbose;
    
    if (verbose) {
      console.warn(`⚠️  Optional feature '${featureName}' failed: ${error.message}`);
    }
    
    return fallback ? await fallback() : null;
  }
};

program
  .command('enhanced-command')
  .action(async (options) => {
    // Core functionality (required)
    const coreResult = await performCoreOperation();
    
    // Optional enhancements
    const analytics = await tryOptionalFeature(
      'analytics',
      () => sendAnalytics(coreResult),
      () => console.log('Analytics unavailable, continuing...')
    );
    
    const cache = await tryOptionalFeature(
      'caching',
      () => updateCache(coreResult),
      () => console.log('Cache unavailable, continuing...')
    );
    
    console.log('✅ Command completed successfully');
    console.log('Core result:', coreResult);
  });
```

## Performance Optimization

### Lazy Loading and Caching

```javascript
// Lazy loading for heavy dependencies
const lazyRequire = (moduleName) => {
  let module = null;
  return () => {
    if (!module) {
      module = require(moduleName);
    }
    return module;
  };
};

const getLodash = lazyRequire('lodash');
const getChalk = lazyRequire('chalk');

// Command-specific lazy loading
program
  .command('heavy-operation')
  .action(async () => {
    // Only load heavy dependencies when needed
    const _ = getLodash();
    const chalk = getChalk();
    
    console.log(chalk.green('Starting heavy operation...'));
    // Use lodash for data processing
  });
```

### Streaming and Batch Processing

```javascript
const { Transform } = require('stream');

// Streaming data processor
class DataProcessor extends Transform {
  constructor(options = {}) {
    super({ objectMode: true });
    this.batchSize = options.batchSize || 100;
    this.batch = [];
  }
  
  _transform(chunk, encoding, callback) {
    this.batch.push(chunk);
    
    if (this.batch.length >= this.batchSize) {
      this.processBatch();
    }
    
    callback();
  }
  
  _flush(callback) {
    if (this.batch.length > 0) {
      this.processBatch();
    }
    callback();
  }
  
  processBatch() {
    // Process batch of data
    const processed = this.batch.map(item => ({
      ...item,
      processed: true,
      timestamp: Date.now()
    }));
    
    processed.forEach(item => this.push(item));
    this.batch = [];
  }
}

program
  .command('process-large-file')
  .argument('<file>', 'input file')
  .option('--batch-size <size>', 'batch size', parseInt, 1000)
  .action((file, options) => {
    const fs = require('fs');
    const readline = require('readline');
    
    const processor = new DataProcessor({ batchSize: options.batchSize });
    const output = fs.createWriteStream(`${file}.processed`);
    
    const rl = readline.createInterface({
      input: fs.createReadStream(file),
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      processor.write({ line, lineNumber: rl.lineNumber });
    });
    
    rl.on('close', () => {
      processor.end();
    });
    
    processor.pipe(output);
  });
```

## Plugin Architecture

### Plugin System Implementation

```javascript
class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.hooks = new Map();
  }
  
  registerPlugin(name, plugin) {
    if (this.plugins.has(name)) {
      throw new Error(`Plugin ${name} is already registered`);
    }
    
    this.plugins.set(name, plugin);
    
    // Initialize plugin
    if (typeof plugin.init === 'function') {
      plugin.init(this);
    }
    
    console.log(`✅ Plugin registered: ${name}`);
  }
  
  registerHook(hookName, callback) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    
    this.hooks.get(hookName).push(callback);
  }
  
  async executeHook(hookName, ...args) {
    const callbacks = this.hooks.get(hookName) || [];
    
    for (const callback of callbacks) {
      try {
        await callback(...args);
      } catch (error) {
        console.error(`Hook ${hookName} failed:`, error.message);
      }
    }
  }
  
  getPlugin(name) {
    return this.plugins.get(name);
  }
  
  listPlugins() {
    return Array.from(this.plugins.keys());
  }
}

// Example plugin
const loggingPlugin = {
  name: 'logging',
  
  init(pluginManager) {
    pluginManager.registerHook('command:start', this.logCommandStart);
    pluginManager.registerHook('command:end', this.logCommandEnd);
  },
  
  logCommandStart(command, args) {
    console.log(`[LOG] Command started: ${command} with args:`, args);
  },
  
  logCommandEnd(command, result) {
    console.log(`[LOG] Command completed: ${command} with result:`, result);
  }
};

// Usage
const pluginManager = new PluginManager();
pluginManager.registerPlugin('logging', loggingPlugin);

// Enhanced command with plugin support
program
  .command('plugin-aware')
  .action(async (options) => {
    await pluginManager.executeHook('command:start', 'plugin-aware', options);
    
    // Command logic here
    const result = { status: 'success' };
    
    await pluginManager.executeHook('command:end', 'plugin-aware', result);
  });
```

## Testing CLI Applications

### Comprehensive Testing Strategy

```javascript
// test/cli.test.js
const { spawn } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

class CLITester {
  constructor(cliPath) {
    this.cliPath = cliPath;
  }
  
  async run(args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [this.cliPath, ...args], {
        stdio: 'pipe',
        ...options
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        resolve({
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });
      
      child.on('error', reject);
      
      // Send input if provided
      if (options.input) {
        child.stdin.write(options.input);
        child.stdin.end();
      }
    });
  }
  
  async expectSuccess(args, expectedOutput) {
    const result = await this.run(args);
    
    if (result.code !== 0) {
      throw new Error(`Expected success but got exit code ${result.code}\nStderr: ${result.stderr}`);
    }
    
    if (expectedOutput && !result.stdout.includes(expectedOutput)) {
      throw new Error(`Expected output to contain "${expectedOutput}" but got: ${result.stdout}`);
    }
    
    return result;
  }
  
  async expectFailure(args, expectedCode = 1) {
    const result = await this.run(args);
    
    if (result.code === 0) {
      throw new Error(`Expected failure but command succeeded\nStdout: ${result.stdout}`);
    }
    
    if (expectedCode && result.code !== expectedCode) {
      throw new Error(`Expected exit code ${expectedCode} but got ${result.code}`);
    }
    
    return result;
  }
}

// Example tests
describe('CLI Application', () => {
  const cli = new CLITester('./bin/my-cli.js');
  
  test('shows help when no arguments provided', async () => {
    const result = await cli.run(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });
  
  test('handles invalid command', async () => {
    const result = await cli.expectFailure(['invalid-command']);
    expect(result.stderr).toContain('Unknown command');
  });
  
  test('processes file successfully', async () => {
    const result = await cli.expectSuccess(
      ['process', 'test-file.txt', '--format', 'json'],
      'Processing completed'
    );
    expect(result.stdout).toContain('"status": "success"');
  });
});
```

This advanced usage guide demonstrates sophisticated patterns and techniques for building production-ready CLI applications with GoCommander. These examples show how to leverage the full power of the framework while maintaining clean, maintainable code.