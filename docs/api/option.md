# Option API

The `Option` class represents command-line options in GoCommander.

## Constructor

### new Option(flags, description?)

Creates a new option instance.

```javascript
const { Option } = require('gocommander');
const option = new Option('-p, --port <number>', 'port number');
```

**Parameters:**
- `flags` (string): Option flags specification
- `description` (string, optional): Option description

## Methods

### .default(value)

Set the default value for the option.

```javascript
const option = new Option('-p, --port <number>', 'port number')
  .default(3000);
```

**Parameters:**
- `value` (any): Default value

**Returns:** Option instance for chaining

### .env(name)

Set environment variable name for the option.

```javascript
const option = new Option('-p, --port <number>', 'port number')
  .env('PORT');
```

**Parameters:**
- `name` (string): Environment variable name

**Returns:** Option instance for chaining

### .argParser(fn)

Set a custom argument parser for the option.

```javascript
const option = new Option('-p, --port <number>', 'port number')
  .argParser(parseInt);
```

**Parameters:**
- `fn` (function): Parser function

**Returns:** Option instance for chaining

### .choices(values)

Set allowed choices for the option value.

```javascript
const option = new Option('-l, --log-level <level>', 'log level')
  .choices(['error', 'warn', 'info', 'debug']);
```

**Parameters:**
- `values` (array): Array of allowed values

**Returns:** Option instance for chaining

### .makeOptionMandatory(mandatory?)

Make the option mandatory.

```javascript
const option = new Option('-c, --config <file>', 'config file')
  .makeOptionMandatory();
```

**Parameters:**
- `mandatory` (boolean, optional): Whether option is mandatory (default: true)

**Returns:** Option instance for chaining

### .hideHelp(hide?)

Hide the option from help output.

```javascript
const option = new Option('--internal', 'internal option')
  .hideHelp();
```

**Parameters:**
- `hide` (boolean, optional): Whether to hide option (default: true)

**Returns:** Option instance for chaining

### .conflicts(names)

Specify options that conflict with this option.

```javascript
const option = new Option('--json', 'output as JSON')
  .conflicts(['xml', 'yaml']);
```

**Parameters:**
- `names` (string|array): Conflicting option names

**Returns:** Option instance for chaining

### .implies(optionValues)

Specify options that are implied by this option.

```javascript
const option = new Option('--verbose', 'verbose output')
  .implies({ debug: true });
```

**Parameters:**
- `optionValues` (object): Options and values to imply

**Returns:** Option instance for chaining

## Properties

### .flags

The flags string for the option.

```javascript
console.log(option.flags); // "-p, --port <number>"
```

### .description

The description of the option.

```javascript
console.log(option.description); // "port number"
```

### .required

Whether the option is required.

```javascript
console.log(option.required); // true/false
```

### .optional

Whether the option is optional.

```javascript
console.log(option.optional); // true/false
```

### .variadic

Whether the option accepts multiple values.

```javascript
console.log(option.variadic); // true/false
```

### .mandatory

Whether the option is mandatory.

```javascript
console.log(option.mandatory); // true/false
```

### .short

The short flag for the option.

```javascript
console.log(option.short); // "-p"
```

### .long

The long flag for the option.

```javascript
console.log(option.long); // "--port"
```

### .negate

Whether this is a negatable option.

```javascript
console.log(option.negate); // true/false
```

## Flag Syntax

Options support various flag syntaxes:

### Boolean Options

```javascript
// Simple boolean flags
new Option('-v, --verbose', 'verbose output');
new Option('--debug', 'debug mode');

// Negatable boolean flags
new Option('--no-color', 'disable colors');
```

### Value Options

```javascript
// Required value
new Option('-p, --port <number>', 'port number');

// Optional value
new Option('-h, --host [address]', 'host address');

// Multiple values
new Option('-f, --file <files...>', 'input files');
```

### Complex Examples

```javascript
// Option with choices and default
const logOption = new Option('-l, --log-level <level>', 'logging level')
  .choices(['error', 'warn', 'info', 'debug'])
  .default('info');

// Required option with environment variable
const configOption = new Option('-c, --config <file>', 'config file')
  .env('CONFIG_FILE')
  .makeOptionMandatory();

// Option with custom parser
const portOption = new Option('-p, --port <number>', 'port number')
  .argParser((value) => {
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error('Port must be a number between 1 and 65535');
    }
    return port;
  })
  .default(3000);
```

## Usage with Commands

Options are typically added to commands:

```javascript
const { program } = require('gocommander');

// Using .option() method
program
  .option('-v, --verbose', 'verbose output')
  .option('-p, --port <number>', 'port number', 3000);

// Using .addOption() method with Option instances
const debugOption = new Option('--debug', 'debug mode')
  .conflicts('quiet');

program.addOption(debugOption);
```

## Validation and Processing

### Custom Validation

```javascript
const option = new Option('-a, --age <years>', 'age in years')
  .argParser((value) => {
    const age = parseInt(value, 10);
    if (isNaN(age) || age < 0 || age > 150) {
      throw new Error('Age must be a valid number between 0 and 150');
    }
    return age;
  });
```

### Environment Variable Integration

```javascript
const option = new Option('-t, --token <token>', 'API token')
  .env('API_TOKEN')
  .makeOptionMandatory();

// Will use value from API_TOKEN environment variable if not provided via CLI
```

### Choice Validation

```javascript
const option = new Option('-f, --format <type>', 'output format')
  .choices(['json', 'xml', 'yaml', 'csv'])
  .default('json');
```

## Error Handling

Options can throw various errors during parsing:

```javascript
try {
  program.parse();
} catch (error) {
  if (error.code === 'commander.invalidArgument') {
    console.error('Invalid argument:', error.message);
  } else if (error.code === 'commander.missingMandatoryOptionValue') {
    console.error('Missing required option:', error.message);
  }
  process.exit(1);
}
```