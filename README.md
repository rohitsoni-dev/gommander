# GoCommander

A high-performance Go-based port of Commander.js compiled to WebAssembly, providing a drop-in replacement for Commander.js with enhanced performance and type safety.

## Features

- 🚀 **High Performance**: Go-based implementation compiled to WebAssembly
- 🔄 **Drop-in Replacement**: 100% API compatibility with Commander.js
- 📦 **Zero Dependencies**: No runtime dependencies beyond Node.js built-ins
- 🎯 **Type Safe**: Full TypeScript definitions included
- 🌐 **Cross-Platform**: Works on all platforms supported by Node.js and WebAssembly

## Installation

```bash
npm install gocommander
```

## Quick Start

GoCommander provides the exact same API as Commander.js:

```javascript
const { program } = require('gocommander');

program
  .name('my-cli')
  .description('CLI to some JavaScript string utilities')
  .version('0.8.0');

program
  .option('-d, --debug', 'output extra debugging')
  .option('-s, --small', 'small pizza size')
  .option('-p, --pizza-type <type>', 'flavour of pizza');

program.parse();

const options = program.opts();
console.log('pizza details:');
if (options.debug) console.log(options);
console.log('- small:', options.small);
console.log('- pizza-type:', options.pizzaType || 'margherita');
```

## Migration from Commander.js

GoCommander is designed as a drop-in replacement for Commander.js. Simply replace your import:

```javascript
// Before
const { program } = require('commander');

// After
const { program } = require('gocommander');
```

All existing Commander.js code should work without modification.

## Performance

GoCommander provides significant performance improvements over Commander.js:

- **2-5x faster** parsing for complex command structures
- **Lower memory usage** due to efficient Go implementation
- **Faster startup time** with optimized WASM loading

## Documentation

📚 **[Complete Documentation](docs/README.md)**

### Quick Links

- 🚀 **[Getting Started](docs/getting-started.md)** - Installation and basic usage
- 📖 **[API Reference](docs/api/)** - Complete API documentation
  - [Command API](docs/api/command.md)
  - [Option API](docs/api/option.md)
  - [Argument API](docs/api/argument.md)
  - [Help API](docs/api/help.md)
  - [Error Handling](docs/api/errors.md)
- 🔄 **[Migration Guide](docs/migration-guide.md)** - Migrate from Commander.js
- ⚡ **[Performance Comparison](docs/performance.md)** - Benchmarks and optimization
- 🎯 **[Examples](docs/examples/)** - Real-world usage examples
- 🔧 **[Advanced Usage](docs/advanced.md)** - Advanced patterns and techniques

### Supported Features

- ✅ Commands and subcommands
- ✅ Options (boolean, value, variadic)
- ✅ Arguments (required, optional, variadic)
- ✅ Help generation
- ✅ Version handling
- ✅ Custom parsers
- ✅ Error handling
- ✅ TypeScript definitions
- ✅ Async actions
- ✅ Lifecycle hooks
- ✅ Custom help formatting

## Building from Source

### Prerequisites

- Go 1.21 or later
- Node.js 14 or later
- npm or yarn

### Build Steps

```bash
# Clone the repository
git clone https://github.com/rohitsoni-dev/gocommander.git
cd gocommander

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Development

```bash
# Build WASM only
npm run build:wasm

# Build JavaScript only
npm run build:js

# Run in development mode
npm run dev
```

## Architecture

GoCommander consists of three main layers:

1. **Go Core Layer**: Implements CLI parsing logic in Go
2. **WASM Bridge Layer**: Provides interface between Go and JavaScript
3. **JavaScript API Layer**: Exposes Commander.js-compatible API

```
┌─────────────────────┐
│   Node.js App       │
├─────────────────────┤
│ JavaScript API      │
├─────────────────────┤
│ WASM Bridge         │
├─────────────────────┤
│ Go Core             │
└─────────────────────┘
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Commander.js](https://github.com/tj/commander.js) - The original and excellent CLI framework
- [Go Team](https://golang.org/) - For the amazing Go language and WebAssembly support