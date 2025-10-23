# Help API

GoCommander provides comprehensive help generation and customization capabilities.

## Help Class

### new Help()

Creates a new Help instance for customizing help output.

```javascript
const { Help } = require('gocommander');
const help = new Help();
```

## Help Methods on Command

### .help(options?)

Display help and exit the process.

```javascript
program.help(); // Display help and exit with code 0
program.help({ error: true }); // Display help to stderr and exit with code 1
```

**Parameters:**
- `options` (object, optional):
  - `error` (boolean): Display to stderr and exit with code 1

### .outputHelp(options?)

Output help text without exiting.

```javascript
const helpText = program.outputHelp();
console.log(helpText);

// Custom output function
program.outputHelp((str) => {
  console.log('Custom help:', str);
});
```

**Parameters:**
- `options` (function|object, optional): Output function or options

**Returns:** Help text string (if no output function provided)

### .helpInformation(context?)

Get formatted help information.

```javascript
const helpInfo = program.helpInformation();
console.log(helpInfo);
```

**Parameters:**
- `context` (object, optional): Context for help generation

**Returns:** Formatted help string

### .configureHelp(configuration)

Configure help display options.

```javascript
program.configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => cmd.name(),
  optionTerm: (option) => option.flags,
  argumentTerm: (arg) => arg.name(),
  longestOptionTermLength: (cmd, helper) => helper.longestOptionTermLength(cmd, helper),
  longestSubcommandTermLength: (cmd, helper) => helper.longestSubcommandTermLength(cmd, helper),
  longestArgumentTermLength: (cmd, helper) => helper.longestArgumentTermLength(cmd, helper),
  showGlobalOptions: false
});
```

**Parameters:**
- `configuration` (object): Help configuration options

### .createHelp()

Create a Help instance.

```javascript
const help = program.createHelp();
```

**Returns:** Help instance

## Help Configuration Options

### sortSubcommands

Sort subcommands alphabetically in help output.

```javascript
program.configureHelp({
  sortSubcommands: true
});
```

### subcommandTerm

Customize how subcommand names are displayed.

```javascript
program.configureHelp({
  subcommandTerm: (cmd) => `${cmd.name()} (${cmd.alias()})`
});
```

### optionTerm

Customize how option flags are displayed.

```javascript
program.configureHelp({
  optionTerm: (option) => {
    return option.flags.replace(/,/g, ' |');
  }
});
```

### argumentTerm

Customize how argument names are displayed.

```javascript
program.configureHelp({
  argumentTerm: (arg) => {
    return arg.required ? `<${arg.name()}>` : `[${arg.name()}]`;
  }
});
```

## Custom Help Sections

### .addHelpText(position, text)

Add custom text to help output.

```javascript
program.addHelpText('before', 'My CLI Tool v1.0.0\n');
program.addHelpText('after', '\nFor more information, visit: https://example.com');

// Dynamic text
program.addHelpText('afterAll', (context) => {
  return `\nCurrent directory: ${process.cwd()}`;
});
```

**Parameters:**
- `position` (string): Position to add text ('before', 'after', 'beforeAll', 'afterAll')
- `text` (string|function): Text to add or function returning text

### Custom Help Command

```javascript
// Disable default help command
program.helpOption(false);

// Add custom help command
program
  .command('help [command]')
  .description('display help for command')
  .action((commandName) => {
    if (commandName) {
      const cmd = program.commands.find(c => c.name() === commandName);
      if (cmd) {
        cmd.help();
      } else {
        console.error(`Unknown command: ${commandName}`);
      }
    } else {
      program.help();
    }
  });
```

## Help Formatting

### Default Help Format

```
Usage: my-cli [options] [command]

My CLI application description

Options:
  -V, --version     display version number
  -h, --help        display help for command

Commands:
  serve [options]   start the server
  build [options]   build the project
  help [command]    display help for command
```

### Custom Help Class

```javascript
class CustomHelp extends Help {
  subcommandTerm(cmd) {
    return `${cmd.name().padEnd(15)} - ${cmd.description()}`;
  }

  optionTerm(option) {
    return option.flags.padEnd(20);
  }

  formatHelp(cmd, helper) {
    const termWidth = helper.padWidth(cmd, helper);
    const helpWidth = helper.helpWidth || 80;
    const itemIndentWidth = 2;
    const itemSeparatorWidth = 2;
    
    let output = `${cmd.usage()}\n`;
    
    if (cmd.description()) {
      output += `\n${cmd.description()}\n`;
    }
    
    // Custom formatting logic here
    
    return output;
  }
}

program.configureHelp(new CustomHelp());
```

## Help Examples

### Basic Help Customization

```javascript
const { program } = require('gocommander');

program
  .name('file-manager')
  .description('A powerful file management CLI')
  .version('2.1.0');

program.configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => cmd.name(),
  optionTerm: (option) => option.flags
});

program.addHelpText('before', `
File Manager CLI v2.1.0
=======================
`);

program.addHelpText('after', `
Examples:
  $ file-manager copy source.txt dest.txt
  $ file-manager list --recursive --format json
  $ file-manager serve --port 8080

For more help: https://docs.example.com
`);
```

### Context-Aware Help

```javascript
program.addHelpText('afterAll', (context) => {
  const isSubcommand = context.command !== context.program;
  
  if (isSubcommand) {
    return `\nRun '${context.program.name()} help' for general help.`;
  } else {
    return `\nRun '${context.program.name()} help <command>' for command-specific help.`;
  }
});
```

### Conditional Help Sections

```javascript
program.addHelpText('after', (context) => {
  if (process.env.NODE_ENV === 'development') {
    return '\nDevelopment mode: Additional debug options available.';
  }
  return '';
});
```

### Multi-language Help

```javascript
const messages = {
  en: {
    usage: 'Usage:',
    options: 'Options:',
    commands: 'Commands:'
  },
  es: {
    usage: 'Uso:',
    options: 'Opciones:',
    commands: 'Comandos:'
  }
};

const lang = process.env.LANG || 'en';
const msg = messages[lang] || messages.en;

class LocalizedHelp extends Help {
  // Override methods to use localized strings
  formatHelp(cmd, helper) {
    // Custom localized formatting
    return super.formatHelp(cmd, helper)
      .replace('Usage:', msg.usage)
      .replace('Options:', msg.options)
      .replace('Commands:', msg.commands);
  }
}

program.configureHelp(new LocalizedHelp());
```

## Help Events

Commands emit help-related events:

```javascript
program.on('--help', () => {
  console.log('');
  console.log('Additional help information...');
});

// For subcommands
program
  .command('serve')
  .on('--help', () => {
    console.log('');
    console.log('Server-specific help...');
  });
```

## Best Practices

### Clear Descriptions

Write clear, concise descriptions:

```javascript
program
  .command('deploy')
  .description('Deploy application to specified environment')
  .option('-e, --env <name>', 'target environment (dev, staging, prod)')
  .option('-f, --force', 'force deployment without confirmation');
```

### Helpful Examples

Include practical examples in help text:

```javascript
program.addHelpText('after', `
Examples:
  Deploy to staging:
    $ myapp deploy --env staging

  Force deploy to production:
    $ myapp deploy --env prod --force

  Deploy with custom config:
    $ myapp deploy --env prod --config ./prod.json
`);
```

### Organized Help Output

Group related options and commands:

```javascript
program.configureHelp({
  sortSubcommands: true,
  // Group options by category in custom help formatter
});
```

### Progressive Disclosure

Show basic help by default, detailed help on request:

```javascript
program
  .command('advanced-help')
  .description('show detailed help information')
  .action(() => {
    console.log('Detailed help with advanced options...');
  });
```