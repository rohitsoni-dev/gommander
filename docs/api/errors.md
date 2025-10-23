# Error Handling API

GoCommander provides comprehensive error handling with specific error types for different scenarios.

## Error Classes

### CommanderError

Base error class for all Commander-related errors.

```javascript
const { CommanderError } = require('gocommander');

try {
  program.parse();
} catch (error) {
  if (error instanceof CommanderError) {
    console.error('Commander error:', error.message);
    console.error('Exit code:', error.exitCode);
  }
}
```

**Properties:**
- `message` (string): Error message
- `code` (string): Error code
- `exitCode` (number): Suggested exit code

### InvalidArgumentError

Thrown when an invalid argument is provided.

```javascript
const { InvalidArgumentError } = require('gocommander');

// Custom argument parser that throws InvalidArgumentError
const parsePort = (value) => {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new InvalidArgumentError('Port must be between 1 and 65535');
  }
  return port;
};

program
  .option('-p, --port <number>', 'port number')
  .argParser(parsePort);
```

**Properties:**
- `message` (string): Error message
- `code` (string): 'commander.invalidArgument'
- `argument` (Argument): The argument that caused the error
- `value` (string): The invalid value provided

### InvalidOptionArgumentError

Thrown when an invalid option argument is provided.

```javascript
const { InvalidOptionArgumentError } = require('gocommander');

// This error is thrown automatically for invalid option values
program
  .option('-l, --level <level>', 'log level')
  .choices(['error', 'warn', 'info', 'debug']);

// Parsing '--level invalid' will throw InvalidOptionArgumentError
```

**Properties:**
- `message` (string): Error message
- `code` (string): 'commander.invalidOptionArgument'
- `option` (Option): The option that caused the error
- `value` (string): The invalid value provided

## Error Handling Methods

### .exitOverride(fn?)

Override the default exit behavior for error handling.

```javascript
program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    // Help was displayed, don't exit
    return;
  }
  
  if (err.code === 'commander.version') {
    // Version was displayed, don't exit
    return;
  }
  
  // Log error and exit with custom code
  console.error('Error:', err.message);
  process.exit(err.exitCode || 1);
});
```

**Parameters:**
- `fn` (function, optional): Custom exit handler function

### .showHelpAfterError(displayHelp?)

Show help after displaying an error.

```javascript
program.showHelpAfterError();

// Or with custom message
program.showHelpAfterError('(add --help for additional information)');
```

**Parameters:**
- `displayHelp` (boolean|string, optional): Whether to show help or custom message

### .showSuggestionAfterError(displaySuggestion?)

Show command suggestions after displaying an error.

```javascript
program.showSuggestionAfterError();

// Will suggest similar commands for typos
// e.g., "serv" might suggest "serve"
```

**Parameters:**
- `displaySuggestion` (boolean, optional): Whether to show suggestions

### .configureOutput(options)

Configure error and output handling.

```javascript
program.configureOutput({
  writeOut: (str) => process.stdout.write(str),
  writeErr: (str) => process.stderr.write(str),
  outputError: (str, write) => write(str)
});
```

**Parameters:**
- `options` (object): Output configuration
  - `writeOut` (function): Function to write normal output
  - `writeErr` (function): Function to write error output
  - `outputError` (function): Function to handle error output

## Error Codes

GoCommander uses specific error codes for different scenarios:

| Code | Description | Exit Code |
|------|-------------|-----------|
| `commander.help` | Help was displayed | 0 |
| `commander.version` | Version was displayed | 0 |
| `commander.invalidArgument` | Invalid argument value | 1 |
| `commander.invalidOptionArgument` | Invalid option value | 1 |
| `commander.missingArgument` | Required argument missing | 1 |
| `commander.missingMandatoryOptionValue` | Required option missing | 1 |
| `commander.unknownOption` | Unknown option provided | 1 |
| `commander.excessArguments` | Too many arguments | 1 |
| `commander.unknownCommand` | Unknown command | 1 |

## Error Handling Patterns

### Basic Error Handling

```javascript
const { program } = require('gocommander');

try {
  program.parse();
} catch (error) {
  console.error('Error:', error.message);
  process.exit(error.exitCode || 1);
}
```

### Detailed Error Handling

```javascript
const { program, CommanderError, InvalidArgumentError } = require('gocommander');

program.exitOverride((err) => {
  switch (err.code) {
    case 'commander.help':
    case 'commander.version':
      // Don't exit for help/version
      return;
      
    case 'commander.invalidArgument':
      console.error(`Invalid argument: ${err.message}`);
      if (err.argument) {
        console.error(`Argument: ${err.argument.name()}`);
      }
      break;
      
    case 'commander.invalidOptionArgument':
      console.error(`Invalid option value: ${err.message}`);
      if (err.option) {
        console.error(`Option: ${err.option.flags}`);
      }
      break;
      
    case 'commander.unknownOption':
      console.error(`Unknown option: ${err.message}`);
      break;
      
    case 'commander.unknownCommand':
      console.error(`Unknown command: ${err.message}`);
      break;
      
    default:
      console.error(`Error: ${err.message}`);
  }
  
  process.exit(err.exitCode || 1);
});
```

### Graceful Error Recovery

```javascript
program
  .command('risky-operation')
  .option('-f, --force', 'force operation')
  .action(async (options) => {
    try {
      await performRiskyOperation();
    } catch (error) {
      if (options.force) {
        console.warn('Operation failed but continuing due to --force flag');
        console.warn('Error:', error.message);
      } else {
        console.error('Operation failed:', error.message);
        console.error('Use --force to continue anyway');
        process.exit(1);
      }
    }
  });
```

### Custom Error Classes

```javascript
class ValidationError extends CommanderError {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'validation.failed';
    this.field = field;
    this.exitCode = 2;
  }
}

const validateConfig = (configPath) => {
  if (!fs.existsSync(configPath)) {
    throw new ValidationError(`Config file not found: ${configPath}`, 'config');
  }
  
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.apiKey) {
      throw new ValidationError('API key is required in config', 'apiKey');
    }
    return config;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`Invalid config file: ${error.message}`, 'config');
  }
};
```

## Async Error Handling

### With parseAsync

```javascript
program
  .command('async-command')
  .action(async () => {
    throw new Error('Async operation failed');
  });

try {
  await program.parseAsync();
} catch (error) {
  console.error('Async error:', error.message);
  process.exit(1);
}
```

### Promise Rejection Handling

```javascript
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

program
  .command('async-command')
  .action(async () => {
    // This will be caught by unhandledRejection handler
    await Promise.reject(new Error('Async error'));
  });
```

## Validation Helpers

### Input Validation

```javascript
const validateEmail = (value) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    throw new InvalidArgumentError('Invalid email format');
  }
  return value;
};

const validateUrl = (value) => {
  try {
    new URL(value);
    return value;
  } catch {
    throw new InvalidArgumentError('Invalid URL format');
  }
};

program
  .option('-e, --email <address>', 'email address', validateEmail)
  .option('-u, --url <address>', 'URL', validateUrl);
```

### File System Validation

```javascript
const fs = require('fs');
const path = require('path');

const validateFile = (filePath) => {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    throw new InvalidArgumentError(`File not found: ${filePath}`);
  }
  if (!fs.statSync(fullPath).isFile()) {
    throw new InvalidArgumentError(`Path is not a file: ${filePath}`);
  }
  return fullPath;
};

const validateDirectory = (dirPath) => {
  const fullPath = path.resolve(dirPath);
  if (!fs.existsSync(fullPath)) {
    throw new InvalidArgumentError(`Directory not found: ${dirPath}`);
  }
  if (!fs.statSync(fullPath).isDirectory()) {
    throw new InvalidArgumentError(`Path is not a directory: ${dirPath}`);
  }
  return fullPath;
};
```

## Best Practices

### Consistent Error Messages

Use consistent error message formats:

```javascript
// Good: Clear, actionable error messages
throw new InvalidArgumentError('Port must be a number between 1 and 65535');
throw new InvalidArgumentError('File not found: config.json');

// Avoid: Vague or unhelpful messages
throw new Error('Invalid input');
throw new Error('Something went wrong');
```

### Appropriate Exit Codes

Use meaningful exit codes:

```javascript
const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_USAGE: 2,
  CONFIG_ERROR: 3,
  NETWORK_ERROR: 4
};

program.exitOverride((err) => {
  let exitCode = EXIT_CODES.GENERAL_ERROR;
  
  if (err.code === 'commander.invalidArgument') {
    exitCode = EXIT_CODES.INVALID_USAGE;
  } else if (err.code === 'validation.config') {
    exitCode = EXIT_CODES.CONFIG_ERROR;
  }
  
  process.exit(exitCode);
});
```

### User-Friendly Error Messages

Provide helpful context and suggestions:

```javascript
program.showHelpAfterError('(use --help for usage information)');
program.showSuggestionAfterError();

// Custom error messages with suggestions
const handleUnknownCommand = (cmdName) => {
  const availableCommands = program.commands.map(cmd => cmd.name());
  const suggestions = availableCommands.filter(cmd => 
    cmd.includes(cmdName) || cmdName.includes(cmd)
  );
  
  console.error(`Unknown command: ${cmdName}`);
  if (suggestions.length > 0) {
    console.error(`Did you mean: ${suggestions.join(', ')}?`);
  }
  console.error('Run --help to see available commands');
};
```