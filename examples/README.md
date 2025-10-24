# GoCommander Examples

This directory contains example applications demonstrating various GoCommander features.

## Examples

### [basic-cli.js](./basic-cli.js)
Basic CLI application showing:
- Option parsing with defaults
- Required and optional arguments
- Action handlers

**Usage:**
```bash
node examples/basic-cli.js --verbose --port 8080 input.txt output.txt
```

### [advanced-cli.js](./advanced-cli.js)
Advanced CLI application showing:
- Subcommands and aliases
- Option groups
- Global options
- Error handling

**Usage:**
```bash
node examples/advanced-cli.js db migrate --dry-run
node examples/advanced-cli.js server start --port 8080 --ssl
node examples/advanced-cli.js build --env production --minify
```

### [performance-benchmark.js](./performance-benchmark.js)
Performance comparison showing:
- Benchmarking argument parsing
- Performance metrics
- Comparison with Commander.js

**Usage:**
```bash
node examples/performance-benchmark.js
```

### [migration-example.js](./migration-example.js)
Migration guide showing:
- Drop-in replacement usage
- Identical API compatibility
- Error handling

**Usage:**
```bash
node examples/migration-example.js split "a,b,c" --separator ","
```

## Running Examples

All examples can be run directly with Node.js:

```bash
# Make sure GoCommander is built first
npm run build

# Run any example
node examples/basic-cli.js --help
node examples/advanced-cli.js --help
```

## Creating Your Own CLI

Use these examples as templates for your own CLI applications:

1. Copy an example that matches your needs
2. Modify the options, commands, and actions
3. Add your business logic to the action handlers
4. Test with `node your-cli.js --help`

## Performance Notes

GoCommander provides 2-5x better performance than Commander.js while maintaining 100% API compatibility. This makes it ideal for:

- Build tools and task runners
- High-frequency CLI operations
- Performance-critical applications
- Large-scale automation scripts

The performance benefits are most noticeable with:
- Complex option parsing
- Many subcommands
- Frequent CLI invocations
- Large argument lists
