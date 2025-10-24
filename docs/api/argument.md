# Argument API

The `Argument` class represents command-line arguments in GoCommander.

## Constructor

### new Argument(name, description?)

Creates a new argument instance.

```javascript
const { Argument } = require('gocommander');
const arg = new Argument('<file>', 'input file');
```

**Parameters:**
- `name` (string): Argument name with angle brackets for required, square brackets for optional
- `description` (string, optional): Argument description

## Methods

### .default(value)

Set the default value for optional arguments.

```javascript
const arg = new Argument('[output]', 'output file')
  .default('stdout');
```

**Parameters:**
- `value` (any): Default value

**Returns:** Argument instance for chaining

### .argParser(fn)

Set a custom argument parser.

```javascript
const arg = new Argument('<port>', 'port number')
  .argParser(parseInt);
```

**Parameters:**
- `fn` (function): Parser function

**Returns:** Argument instance for chaining

### .choices(values)

Set allowed choices for the argument value.

```javascript
const arg = new Argument('<format>', 'output format')
  .choices(['json', 'xml', 'yaml']);
```

**Parameters:**
- `values` (array): Array of allowed values

**Returns:** Argument instance for chaining

## Properties

### .name

The name of the argument.

```javascript
console.log(arg.name); // "file"
```

### .description

The description of the argument.

```javascript
console.log(arg.description); // "input file"
```

### .required

Whether the argument is required.

```javascript
console.log(arg.required); // true/false
```

### .variadic

Whether the argument accepts multiple values.

```javascript
console.log(arg.variadic); // true/false
```

## Argument Syntax

Arguments support various syntaxes:

### Required Arguments

```javascript
// Single required argument
new Argument('<file>', 'input file');

// Multiple required arguments
new Argument('<source>', 'source file');
new Argument('<destination>', 'destination file');
```

### Optional Arguments

```javascript
// Single optional argument
new Argument('[output]', 'output file');

// Optional argument with default
new Argument('[port]', 'port number').default(3000);
```

### Variadic Arguments

```javascript
// Required variadic (one or more)
new Argument('<files...>', 'input files');

// Optional variadic (zero or more)
new Argument('[files...]', 'input files');
```

## Usage with Commands

Arguments are added to commands using the `.argument()` method:

```javascript
const { program } = require('gocommander');

// Single argument
program
  .command('copy')
  .argument('<source>', 'source file')
  .argument('<destination>', 'destination file')
  .action((source, destination) => {
    console.log(`Copying ${source} to ${destination}`);
  });

// Optional argument with default
program
  .command('serve')
  .argument('[port]', 'port number', '3000')
  .action((port) => {
    console.log(`Starting server on port ${port}`);
  });

// Variadic arguments
program
  .command('install')
  .argument('<packages...>', 'packages to install')
  .action((packages) => {
    console.log(`Installing: ${packages.join(', ')}`);
  });
```

### Using Argument Instances

```javascript
const { program, Argument } = require('gocommander');

const fileArg = new Argument('<file>', 'input file')
  .choices(['input.txt', 'data.json', 'config.yaml']);

const formatArg = new Argument('[format]', 'output format')
  .choices(['json', 'xml', 'yaml'])
  .default('json');

program
  .command('process')
  .addArgument(fileArg)
  .addArgument(formatArg)
  .action((file, format) => {
    console.log(`Processing ${file} as ${format}`);
  });
```

## Validation and Processing

### Custom Validation

```javascript
const portArg = new Argument('<port>', 'port number')
  .argParser((value) => {
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error('Port must be a number between 1 and 65535');
    }
    return port;
  });

program
  .command('serve')
  .addArgument(portArg)
  .action((port) => {
    console.log(`Starting server on port ${port}`);
  });
```

### Choice Validation

```javascript
const formatArg = new Argument('<format>', 'output format')
  .choices(['json', 'xml', 'yaml', 'csv']);

program
  .command('export')
  .addArgument(formatArg)
  .action((format) => {
    console.log(`Exporting as ${format}`);
  });
```

### File Path Validation

```javascript
const fs = require('fs');

const fileArg = new Argument('<file>', 'input file')
  .argParser((value) => {
    if (!fs.existsSync(value)) {
      throw new Error(`File not found: ${value}`);
    }
    return value;
  });
```

## Complex Examples

### File Processing CLI

```javascript
const { program, Argument } = require('gocommander');
const fs = require('fs');
const path = require('path');

// Input file argument with validation
const inputArg = new Argument('<input>', 'input file')
  .argParser((value) => {
    if (!fs.existsSync(value)) {
      throw new Error(`Input file not found: ${value}`);
    }
    return path.resolve(value);
  });

// Output file argument with default
const outputArg = new Argument('[output]', 'output file')
  .default('output.txt')
  .argParser((value) => path.resolve(value));

program
  .command('process')
  .addArgument(inputArg)
  .addArgument(outputArg)
  .option('-f, --format <type>', 'processing format')
  .action((input, output, options) => {
    console.log(`Processing ${input} -> ${output}`);
    if (options.format) {
      console.log(`Using format: ${options.format}`);
    }
  });
```

### Package Manager CLI

```javascript
const { program } = require('gocommander');

// Install command with variadic packages
program
  .command('install')
  .argument('<packages...>', 'packages to install')
  .option('-g, --global', 'install globally')
  .option('--save-dev', 'save as dev dependency')
  .action((packages, options) => {
    const scope = options.global ? 'globally' : 'locally';
    const type = options.saveDev ? 'dev dependency' : 'dependency';
    console.log(`Installing ${packages.join(', ')} ${scope} as ${type}`);
  });

// Uninstall command
program
  .command('uninstall')
  .argument('<package>', 'package to uninstall')
  .option('-g, --global', 'uninstall globally')
  .action((package, options) => {
    const scope = options.global ? 'globally' : 'locally';
    console.log(`Uninstalling ${package} ${scope}`);
  });
```

## Error Handling

Arguments can throw various errors during parsing:

```javascript
try {
  program.parse();
} catch (error) {
  if (error.code === 'commander.invalidArgument') {
    console.error('Invalid argument:', error.message);
  } else if (error.code === 'commander.missingArgument') {
    console.error('Missing required argument:', error.message);
  } else if (error.code === 'commander.excessArguments') {
    console.error('Too many arguments provided');
  }
  process.exit(1);
}
```

## Best Practices

### Argument Order

Place arguments in logical order:
1. Required arguments first
2. Optional arguments after required ones
3. Variadic arguments last

```javascript
program
  .command('deploy')
  .argument('<environment>', 'deployment environment')  // Required
  .argument('[version]', 'version to deploy')          // Optional
  .argument('[services...]', 'services to deploy')     // Variadic
```

### Meaningful Names

Use descriptive argument names:

```javascript
// Good
.argument('<source-file>', 'source file path')
.argument('<target-directory>', 'target directory')

// Avoid
.argument('<file>', 'file')
.argument('<dir>', 'directory')
```

### Validation

Always validate arguments when necessary:

```javascript
const urlArg = new Argument('<url>', 'API endpoint URL')
  .argParser((value) => {
    try {
      return new URL(value);
    } catch {
      throw new Error('Invalid URL format');
    }
  });
```