# Migration Guide: Commander.js to GoCommander

This guide helps you migrate from Commander.js to GoCommander. GoCommander is designed as a drop-in replacement, so most code should work without changes.

## Quick Migration

### 1. Install GoCommander

```bash
npm uninstall commander
npm install gocommander
```

### 2. Update Imports

```javascript
// Before (Commander.js)
const { program } = require('commander');
const { Command, Option, Argument } = require('commander');

// After (GoCommander)
const { program } = require('gocommander');
const { Command, Option, Argument } = require('gocommander');
```

### 3. Test Your Application

Most Commander.js code should work immediately:

```javascript
// This code works identically in both libraries
const { program } = require('gocommander'); // Changed from 'commander'

program
  .name('my-cli')
  .description('CLI application')
  .version('1.0.0')
  .option('-v, --verbose', 'verbose output')
  .option('-p, --port <number>', 'port number', 3000)
  .parse();

const options = program.opts();
console.log(options);
```

## Common Migration Scenarios

### Basic CLI Application

**Commander.js:**
```javascript
const { program } = require('commander');

program
  .version('1.0.0')
  .option('-d, --debug', 'output extra debugging')
  .option('-s, --small', 'small pizza size')
  .option('-p, --pizza-type <type>', 'flavour of pizza');

program.parse();
const options = program.opts();
```

**GoCommander (identical):**
```javascript
const { program } = require('gocommander'); // Only change needed

program
  .version('1.0.0')
  .option('-d, --debug', 'output extra debugging')
  .option('-s, --small', 'small pizza size')
  .option('-p, --pizza-type <type>', 'flavour of pizza');

program.parse();
const options = program.opts();
```

### Commands with Actions

**Commander.js:**
```javascript
const { program } = require('commander');

program
  .command('serve')
  .description('start the server')
  .option('-p, --port <number>', 'port to bind on', 3000)
  .action((options) => {
    console.log(`Server running on port ${options.port}`);
  });

program.parse();
```

**GoCommander (identical):**
```javascript
const { program } = require('gocommander'); // Only change needed

program
  .command('serve')
  .description('start the server')
  .option('-p, --port <number>', 'port to bind on', 3000)
  .action((options) => {
    console.log(`Server running on port ${options.port}`);
  });

program.parse();
```

### Subcommands

**Commander.js:**
```javascript
const { program } = require('commander');

const serve = program.command('serve');
serve.description('serve files');

serve
  .command('start')
  .description('start the server')
  .action(() => console.log('Starting server'));

serve
  .command('stop')
  .description('stop the server')
  .action(() => console.log('Stopping server'));

program.parse();
```

**GoCommander (identical):**
```javascript
const { program } = require('gocommander'); // Only change needed

const serve = program.command('serve');
serve.description('serve files');

serve
  .command('start')
  .description('start the server')
  .action(() => console.log('Starting server'));

serve
  .command('stop')
  .description('stop the server')
  .action(() => console.log('Stopping server'));

program.parse();
```

### Custom Option Classes

**Commander.js:**
```javascript
const { program, Option } = require('commander');

const logLevelOption = new Option('-l, --log-level <level>', 'logging level')
  .choices(['error', 'warn', 'info', 'debug'])
  .default('info');

program.addOption(logLevelOption);
program.parse();
```

**GoCommander (identical):**
```javascript
const { program, Option } = require('gocommander'); // Only change needed

const logLevelOption = new Option('-l, --log-level <level>', 'logging level')
  .choices(['error', 'warn', 'info', 'debug'])
  .default('info');

program.addOption(logLevelOption);
program.parse();
```

### Error Handling

**Commander.js:**
```javascript
const { program } = require('commander');

program.exitOverride((err) => {
  if (err.code === 'commander.help') return;
  console.error('Error:', err.message);
  process.exit(err.exitCode || 1);
});

program.parse();
```

**GoCommander (identical):**
```javascript
const { program } = require('gocommander'); // Only change needed

program.exitOverride((err) => {
  if (err.code === 'commander.help') return;
  console.error('Error:', err.message);
  process.exit(err.exitCode || 1);
});

program.parse();
```

## Advanced Migration Cases

### Custom Help Configuration

**Commander.js:**
```javascript
const { program } = require('commander');

program.configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => cmd.name()
});

program.addHelpText('after', '\nExample usage:\n  $ my-cli serve --port 8080');
program.parse();
```

**GoCommander (identical):**
```javascript
const { program } = require('gocommander'); // Only change needed

program.configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => cmd.name()
});

program.addHelpText('after', '\nExample usage:\n  $ my-cli serve --port 8080');
program.parse();
```

### Async Actions

**Commander.js:**
```javascript
const { program } = require('commander');

program
  .command('deploy')
  .action(async (options) => {
    console.log('Deploying...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Deployed!');
  });

program.parseAsync();
```

**GoCommander (identical):**
```javascript
const { program } = require('gocommander'); // Only change needed

program
  .command('deploy')
  .action(async (options) => {
    console.log('Deploying...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Deployed!');
  });

program.parseAsync();
```

## Performance Improvements

After migrating to GoCommander, you should see performance improvements:

### Parsing Performance

```javascript
// Complex CLI with many options and subcommands
const { program } = require('gocommander');

// GoCommander handles complex parsing 2-5x faster
for (let i = 0; i < 100; i++) {
  program.command(`cmd${i}`)
    .option(`-${i}, --option${i} <value>`, `option ${i}`)
    .action(() => {});
}

console.time('parse');
program.parse(['node', 'script.js', 'cmd50', '--option50', 'value']);
console.timeEnd('parse'); // Significantly faster with GoCommander
```

### Memory Usage

```javascript
// GoCommander uses less memory for large command structures
const { program } = require('gocommander');

// Create many commands and options
for (let i = 0; i < 1000; i++) {
  program.command(`command-${i}`)
    .description(`Command ${i}`)
    .option(`--opt-${i} <value>`, `Option ${i}`)
    .action(() => {});
}

// Check memory usage - GoCommander should use less
console.log('Memory usage:', process.memoryUsage());
```

## Compatibility Checklist

Use this checklist to verify your migration:

### ✅ Basic Features
- [ ] Command creation with `.command()`
- [ ] Option parsing with `.option()`
- [ ] Argument handling with `.argument()`
- [ ] Action handlers with `.action()`
- [ ] Help generation with `.help()`
- [ ] Version handling with `.version()`

### ✅ Advanced Features
- [ ] Subcommands and nested commands
- [ ] Custom option classes with `Option`
- [ ] Custom argument classes with `Argument`
- [ ] Error handling with `.exitOverride()`
- [ ] Help customization with `.configureHelp()`
- [ ] Async actions with `.parseAsync()`

### ✅ Edge Cases
- [ ] Variadic options and arguments
- [ ] Negatable options with `--no-` prefix
- [ ] Custom parsers and validators
- [ ] Environment variable integration
- [ ] Complex command hierarchies

## Troubleshooting

### Common Issues

#### 1. Import Errors

**Problem:**
```javascript
// This might cause issues if you have both libraries installed
const { program } = require('commander'); // Still importing old library
```

**Solution:**
```javascript
// Make sure to update all imports
const { program } = require('gocommander');
```

#### 2. TypeScript Definitions

**Problem:**
```typescript
// TypeScript might complain about missing types
import { Command } from 'commander'; // Old types
```

**Solution:**
```typescript
// Use GoCommander types
import { Command } from 'gocommander';
```

#### 3. Package.json Dependencies

**Problem:**
```json
{
  "dependencies": {
    "commander": "^9.0.0",
    "gocommander": "^1.0.0"
  }
}
```

**Solution:**
```json
{
  "dependencies": {
    "gocommander": "^1.0.0"
  }
}
```

### Performance Verification

Test that GoCommander provides expected performance improvements:

```javascript
const { performance } = require('perf_hooks');

// Benchmark parsing performance
const iterations = 1000;
const args = ['node', 'script.js', '--verbose', '--port', '3000', 'serve'];

const start = performance.now();
for (let i = 0; i < iterations; i++) {
  program.parse([...args]);
}
const end = performance.now();

console.log(`Parsed ${iterations} times in ${end - start}ms`);
console.log(`Average: ${(end - start) / iterations}ms per parse`);
```

## Migration Examples

### Example 1: File Processing CLI

**Before (Commander.js):**
```javascript
const { program } = require('commander');
const fs = require('fs');

program
  .name('file-processor')
  .description('Process files with various operations')
  .version('1.0.0');

program
  .command('compress <input> [output]')
  .description('compress a file')
  .option('-l, --level <number>', 'compression level', '6')
  .action((input, output, options) => {
    console.log(`Compressing ${input} with level ${options.level}`);
    if (output) console.log(`Output: ${output}`);
  });

program
  .command('extract <archive>')
  .description('extract an archive')
  .option('-d, --destination <dir>', 'extraction directory', '.')
  .action((archive, options) => {
    console.log(`Extracting ${archive} to ${options.destination}`);
  });

program.parse();
```

**After (GoCommander):**
```javascript
const { program } = require('gocommander'); // Only change needed
const fs = require('fs');

program
  .name('file-processor')
  .description('Process files with various operations')
  .version('1.0.0');

program
  .command('compress <input> [output]')
  .description('compress a file')
  .option('-l, --level <number>', 'compression level', '6')
  .action((input, output, options) => {
    console.log(`Compressing ${input} with level ${options.level}`);
    if (output) console.log(`Output: ${output}`);
  });

program
  .command('extract <archive>')
  .description('extract an archive')
  .option('-d, --destination <dir>', 'extraction directory', '.')
  .action((archive, options) => {
    console.log(`Extracting ${archive} to ${options.destination}`);
  });

program.parse();
```

### Example 2: API Client CLI

**Before (Commander.js):**
```javascript
const { program, Option } = require('commander');

const formatOption = new Option('-f, --format <type>', 'output format')
  .choices(['json', 'xml', 'yaml'])
  .default('json');

program
  .name('api-client')
  .description('API client CLI tool')
  .version('2.0.0')
  .addOption(formatOption)
  .option('-v, --verbose', 'verbose output')
  .option('-t, --token <token>', 'API token')
  .option('-u, --url <url>', 'API base URL', 'https://api.example.com');

program
  .command('get <endpoint>')
  .description('GET request to endpoint')
  .action(async (endpoint, options, command) => {
    const globalOpts = command.parent.opts();
    console.log(`GET ${globalOpts.url}/${endpoint}`);
    console.log(`Format: ${globalOpts.format}`);
    if (globalOpts.verbose) console.log('Verbose mode enabled');
  });

program.parseAsync();
```

**After (GoCommander):**
```javascript
const { program, Option } = require('gocommander'); // Only change needed

const formatOption = new Option('-f, --format <type>', 'output format')
  .choices(['json', 'xml', 'yaml'])
  .default('json');

program
  .name('api-client')
  .description('API client CLI tool')
  .version('2.0.0')
  .addOption(formatOption)
  .option('-v, --verbose', 'verbose output')
  .option('-t, --token <token>', 'API token')
  .option('-u, --url <url>', 'API base URL', 'https://api.example.com');

program
  .command('get <endpoint>')
  .description('GET request to endpoint')
  .action(async (endpoint, options, command) => {
    const globalOpts = command.parent.opts();
    console.log(`GET ${globalOpts.url}/${endpoint}`);
    console.log(`Format: ${globalOpts.format}`);
    if (globalOpts.verbose) console.log('Verbose mode enabled');
  });

program.parseAsync();
```

## Next Steps

After successful migration:

1. **Run your test suite** to ensure everything works correctly
2. **Benchmark performance** to verify improvements
3. **Update documentation** to reference GoCommander
4. **Consider new features** available in GoCommander
5. **Monitor memory usage** in production

## Getting Help

If you encounter issues during migration:

- Check the [API Documentation](api/) for detailed reference
- Review [Examples](examples/) for common patterns
- Open an issue on [GitHub](https://github.com/rohitsoni007/gocommander/issues)
- Compare with [Commander.js documentation](https://github.com/tj/commander.js) for expected behavior