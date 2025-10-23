# Command API

The `Command` class is the core of GoCommander, providing methods to define CLI commands, options, and arguments.

## Constructor

### new Command(name)

Creates a new command instance.

```javascript
const { Command } = require('gocommander');
const program = new Command('my-program');
```

## Methods

### .name(str)

Set the name of the command.

```javascript
program.name('my-cli');
```

**Parameters:**
- `str` (string): The name of the command

**Returns:** Command instance for chaining

### .description(str)

Set the description for the command.

```javascript
program.description('A CLI tool for managing files');
```

**Parameters:**
- `str` (string): The description text

**Returns:** Command instance for chaining

### .version(str, flags?, description?)

Set the version for the command.

```javascript
program.version('1.0.0');
program.version('1.0.0', '-v, --version', 'display version number');
```

**Parameters:**
- `str` (string): The version string
- `flags` (string, optional): Custom flags for version option (default: '-V, --version')
- `description` (string, optional): Custom description for version option

**Returns:** Command instance for chaining

### .option(flags, description?, defaultValue?, parseArg?)

Add an option to the command.

```javascript
program.option('-p, --port <number>', 'port number', 3000);
program.option('-v, --verbose', 'verbose output');
program.option('-f, --file <path>', 'input file', parseFile);
```

**Parameters:**
- `flags` (string): Option flags (e.g., '-p, --port <value>')
- `description` (string, optional): Option description
- `defaultValue` (any, optional): Default value for the option
- `parseArg` (function, optional): Custom parser function

**Returns:** Command instance for chaining

### .requiredOption(flags, description?, defaultValue?, parseArg?)

Add a required option to the command.

```javascript
program.requiredOption('-c, --config <path>', 'configuration file');
```

**Parameters:** Same as `.option()` but the option becomes required

**Returns:** Command instance for chaining

### .command(nameAndArgs, description?, opts?)

Create a subcommand.

```javascript
program.command('serve <dir>', 'serve files from directory');
program.command('build').description('build the project');
```

**Parameters:**
- `nameAndArgs` (string): Command name and arguments
- `description` (string, optional): Command description
- `opts` (object, optional): Command options

**Returns:** New Command instance for the subcommand

### .argument(name, description?, defaultValue?, parseArg?)

Add an argument to the command.

```javascript
program.argument('<file>', 'input file');
program.argument('[output]', 'output file', 'stdout');
```

**Parameters:**
- `name` (string): Argument name with angle brackets for required, square brackets for optional
- `description` (string, optional): Argument description
- `defaultValue` (any, optional): Default value for optional arguments
- `parseArg` (function, optional): Custom parser function

**Returns:** Command instance for chaining

### .action(fn)

Set the action handler for the command.

```javascript
program
  .command('serve')
  .option('-p, --port <number>', 'port', 3000)
  .action((options) => {
    console.log(`Starting server on port ${options.port}`);
  });
```

**Parameters:**
- `fn` (function): Action handler function

**Returns:** Command instance for chaining

### .parse(argv?, options?)

Parse command line arguments.

```javascript
program.parse(); // Uses process.argv
program.parse(['node', 'script.js', '--verbose']);
program.parse(process.argv, { from: 'user' });
```

**Parameters:**
- `argv` (string[], optional): Arguments to parse (default: process.argv)
- `options` (object, optional): Parse options

**Returns:** Command instance

### .parseAsync(argv?, options?)

Parse command line arguments asynchronously.

```javascript
await program.parseAsync();
```

**Parameters:** Same as `.parse()`

**Returns:** Promise<Command>

### .opts()

Get the parsed options.

```javascript
program.parse();
const options = program.opts();
console.log(options.verbose);
```

**Returns:** Object containing parsed options

### .args

Get the parsed arguments.

```javascript
program.parse();
console.log(program.args); // Array of arguments
```

### .help(options?)

Display help information.

```javascript
program.help(); // Display help and exit
program.help({ error: true }); // Display help to stderr
```

**Parameters:**
- `options` (object, optional): Help display options

### .outputHelp(options?)

Output help information without exiting.

```javascript
const helpText = program.outputHelp();
console.log(helpText);
```

**Parameters:**
- `options` (object, optional): Help output options

**Returns:** Help text string

## Properties

### .commands

Array of subcommands.

```javascript
console.log(program.commands.length); // Number of subcommands
```

### .options

Array of options defined for this command.

```javascript
console.log(program.options.map(opt => opt.flags));
```

### .parent

Parent command (for subcommands).

```javascript
if (subcommand.parent) {
  console.log('This is a subcommand');
}
```

## Events

Commands extend EventEmitter and emit various events:

### 'preAction'

Emitted before action execution.

```javascript
program.on('preAction', (thisCommand, actionCommand) => {
  console.log('About to execute action');
});
```

### 'postAction'

Emitted after action execution.

```javascript
program.on('postAction', (thisCommand, actionCommand) => {
  console.log('Action completed');
});
```

## Examples

### Basic CLI

```javascript
const { program } = require('gocommander');

program
  .name('file-util')
  .description('File utility CLI')
  .version('1.0.0')
  .option('-v, --verbose', 'verbose output')
  .option('-d, --directory <path>', 'working directory', '.')
  .parse();

const options = program.opts();
if (options.verbose) {
  console.log('Verbose mode enabled');
  console.log('Working directory:', options.directory);
}
```

### CLI with Subcommands

```javascript
const { program } = require('gocommander');

program
  .name('git-like')
  .description('Git-like CLI tool')
  .version('1.0.0');

program
  .command('init')
  .description('initialize a repository')
  .option('--bare', 'create bare repository')
  .action((options) => {
    console.log('Initializing repository...');
    if (options.bare) console.log('Creating bare repository');
  });

program
  .command('clone <repository> [directory]')
  .description('clone a repository')
  .option('-b, --branch <name>', 'branch to clone')
  .action((repository, directory, options) => {
    console.log(`Cloning ${repository}`);
    if (directory) console.log(`Into directory: ${directory}`);
    if (options.branch) console.log(`Branch: ${options.branch}`);
  });

program.parse();
```