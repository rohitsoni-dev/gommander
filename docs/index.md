# GoCommander Documentation

GoCommander is a high-performance Go-based port of Commander.js compiled to WebAssembly.

## Features

- 🚀 **High Performance**: 2-5x faster than Commander.js
- 🔄 **Drop-in Replacement**: Identical API to Commander.js
- 📦 **Zero Dependencies**: No runtime dependencies
- 🎯 **Type Safe**: Full TypeScript support
- 🌐 **Cross Platform**: Works on all Node.js supported platforms

## Quick Links

- [API Documentation](./api/index.md)
- [Migration Guide](./migration.md)
- [Performance Comparison](./performance.md)
- [Examples](../examples/README.md)

## Installation

```bash
npm install gocommander
```

## Basic Usage

```javascript
const { program } = require('gocommander');

program
  .name('my-cli')
  .description('CLI description')
  .version('1.0.0')
  .option('-v, --verbose', 'verbose output')
  .option('-p, --port <number>', 'port number', 3000)
  .parse();

const options = program.opts();
console.log('Verbose:', options.verbose);
console.log('Port:', options.port);
```

## Why GoCommander?

GoCommander provides the exact same API as Commander.js but with significant performance improvements:

- **Faster Parsing**: Go's efficient parsing algorithms
- **Lower Memory**: Compiled code uses less memory
- **Better Performance**: WebAssembly execution speed
- **Type Safety**: Go's strong typing prevents runtime errors

Perfect for high-performance CLI applications, build tools, and any scenario where argument parsing performance matters.
