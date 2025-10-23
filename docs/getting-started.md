# Getting Started with GoCommander

GoCommander is a drop-in replacement for Commander.js that provides the same API with enhanced performance through Go and WebAssembly.

## Installation

Install GoCommander using npm:

```bash
npm install gocommander
```

Or using yarn:

```bash
yarn add gocommander
```

## Basic Usage

GoCommander provides the exact same API as Commander.js. Here's a simple example:

```javascript
const { program } = require('gocommander');

program
  .name('string-util')
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

## Creating Commands

### Simple Command

```javascript
const { program } = require('gocommander');

program
  .command('serve')
  .description('start the server')
  .option('-p, --port <number>', 'port number', 3000)
  .action((options) => {
    console.log(`Starting server on port ${options.port}`);
  });

program.parse();
```

### Command with Arguments

```javascript
program
  .command('copy <source> <destination>')
  .description('copy a file')
  .action((source, destination) => {
    console.log(`Copying ${source} to ${destination}`);
  });
```

### Subcommands

```javascript
const serve = program
  .command('serve')
  .description('serve files');

serve
  .command('start')
  .description('start the server')
  .action(() => {
    console.log('Server started');
  });

serve
  .command('stop')
  .description('stop the server')
  .action(() => {
    console.log('Server stopped');
  });
```

## Working with Options

### Boolean Options

```javascript
program
  .option('-v, --verbose', 'enable verbose output')
  .option('-q, --quiet', 'suppress output');
```

### Options with Values

```javascript
program
  .option('-p, --port <number>', 'port number')
  .option('-h, --host <address>', 'host address', 'localhost')
  .option('-t, --timeout <ms>', 'timeout in milliseconds', parseInt);
```

### Variadic Options

```javascript
program
  .option('-f, --file <files...>', 'input files');
```

## Working with Arguments

### Required Arguments

```javascript
program
  .command('deploy <environment>')
  .description('deploy to environment')
  .action((environment) => {
    console.log(`Deploying to ${environment}`);
  });
```

### Optional Arguments

```javascript
program
  .command('build [target]')
  .description('build the project')
  .action((target = 'production') => {
    console.log(`Building for ${target}`);
  });
```

### Variadic Arguments

```javascript
program
  .command('install <packages...>')
  .description('install packages')
  .action((packages) => {
    console.log(`Installing: ${packages.join(', ')}`);
  });
```

## Error Handling

```javascript
program
  .command('risky')
  .description('a command that might fail')
  .action(() => {
    try {
      // Some risky operation
      throw new Error('Something went wrong');
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });
```

## Help and Version

GoCommander automatically generates help text:

```javascript
program
  .name('my-cli')
  .description('My awesome CLI tool')
  .version('1.0.0');

// Users can run: my-cli --help or my-cli --version
```

## Next Steps

- Explore the [API Reference](api/) for detailed documentation
- Check out [Examples](examples/) for more complex use cases
- Read the [Migration Guide](migration-guide.md) if you're coming from Commander.js
- See [Performance Comparison](performance.md) for benchmarks