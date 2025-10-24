# GoCommander API Documentation

## Core Classes

- [Command](./command.md) - Main command class with all Commander.js methods
- [Option](./option.md) - Option configuration and processing
- [Argument](./argument.md) - Argument configuration and validation
- [Help](./help.md) - Help generation and customization
- [Errors](./errors.md) - Error classes and handling

## Quick Start

```javascript
const { program } = require('gocommander');

program
  .option('-v, --verbose', 'verbose output')
  .option('-p, --port <number>', 'port number', 3000)
  .parse();

console.log('Options:', program.opts());
```

## Migration from Commander.js

GoCommander is a drop-in replacement for Commander.js. Simply replace:

```javascript
// Before
const { program } = require('commander');

// After  
const { program } = require('gocommander');
```

All existing Commander.js code will work without modification.

## Performance Benefits

- 2-5x faster argument parsing
- Lower memory usage
- Compiled Go performance with WebAssembly
- Zero runtime dependencies
