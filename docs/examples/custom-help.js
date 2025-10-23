#!/usr/bin/env node

/**
 * Example: Custom Help Formatting
 * Description: Demonstrates advanced help customization and formatting options
 * 
 * Usage:
 *   node custom-help.js --help
 *   node custom-help.js deploy --help
 *   node custom-help.js config --help
 * 
 * Features demonstrated:
 *   - Custom help formatting
 *   - Help sections and text
 *   - Conditional help content
 *   - Multi-language support
 *   - Custom Help class
 */

const { program, Help } = require('gocommander');

// Custom Help class with enhanced formatting
class CustomHelp extends Help {
  // Customize command term display
  subcommandTerm(cmd) {
    const name = cmd.name();
    const alias = cmd.alias();
    return alias ? `${name}|${alias}` : name;
  }

  // Customize option term display
  optionTerm(option) {
    return option.flags.replace(/,/g, ' |');
  }

  // Customize argument term display
  argumentTerm(arg) {
    return arg.required ? `<${arg.name()}>` : `[${arg.name()}]`;
  }

  // Custom help formatting
  formatHelp(cmd, helper) {
    const termWidth = helper.padWidth(cmd, helper);
    const helpWidth = helper.helpWidth || 80;
    
    let output = '';
    
    // Custom header
    output += this.formatHeader(cmd);
    
    // Usage
    output += this.formatUsage(cmd);
    
    // Description
    if (cmd.description()) {
      output += `\n${cmd.description()}\n`;
    }
    
    // Arguments
    const args = helper.visibleArguments(cmd);
    if (args.length > 0) {
      output += '\nArguments:\n';
      args.forEach(arg => {
        const term = helper.argumentTerm(arg);
        const description = arg.description || '';
        output += `  ${term.padEnd(termWidth)} ${description}\n`;
      });
    }
    
    // Options
    const options = helper.visibleOptions(cmd);
    if (options.length > 0) {
      output += '\nOptions:\n';
      options.forEach(option => {
        const term = helper.optionTerm(option);
        const description = option.description || '';
        output += `  ${term.padEnd(termWidth)} ${description}\n`;
      });
    }
    
    // Commands
    const commands = helper.visibleCommands(cmd);
    if (commands.length > 0) {
      output += '\nCommands:\n';
      commands.forEach(subCmd => {
        const term = helper.subcommandTerm(subCmd);
        const description = subCmd.description() || '';
        output += `  ${term.padEnd(termWidth)} ${description}\n`;
      });
    }
    
    return output;
  }
  
  formatHeader(cmd) {
    const name = cmd.name();
    const version = cmd.version();
    
    let header = `\n╭─────────────────────────────────────────╮\n`;
    header += `│  🚀 ${name.toUpperCase()}${version ? ` v${version}` : ''}${' '.repeat(Math.max(0, 35 - name.length - (version ? version.length + 2 : 0)))}│\n`;
    header += `╰─────────────────────────────────────────╯\n`;
    
    return header;
  }
  
  formatUsage(cmd) {
    const usage = cmd.usage();
    return `\n📖 Usage: ${usage}\n`;
  }
}

// Localization support
const messages = {
  en: {
    usage: 'Usage:',
    arguments: 'Arguments:',
    options: 'Options:',
    commands: 'Commands:',
    examples: 'Examples:',
    description: 'A demonstration of custom help formatting in GoCommander'
  },
  es: {
    usage: 'Uso:',
    arguments: 'Argumentos:',
    options: 'Opciones:',
    commands: 'Comandos:',
    examples: 'Ejemplos:',
    description: 'Una demostración de formato de ayuda personalizado en GoCommander'
  },
  fr: {
    usage: 'Utilisation:',
    arguments: 'Arguments:',
    options: 'Options:',
    commands: 'Commandes:',
    examples: 'Exemples:',
    description: 'Une démonstration du formatage d\'aide personnalisé dans GoCommander'
  }
};

const lang = process.env.LANG?.slice(0, 2) || 'en';
const msg = messages[lang] || messages.en;

// Set up the main program with custom help
program
  .name('custom-help-demo')
  .description(msg.description)
  .version('1.0.0')
  .configureHelp(new CustomHelp());

// Global options
program
  .option('-v, --verbose', 'enable verbose output')
  .option('-c, --config <file>', 'configuration file')
  .option('--no-color', 'disable colored output')
  .option('-l, --lang <language>', 'interface language', 'en');

// Deploy command with extensive help
const deployCmd = program
  .command('deploy')
  .alias('d')
  .description('deploy application to specified environment')
  .argument('<environment>', 'target environment (dev, staging, prod)')
  .argument('[version]', 'version to deploy', 'latest')
  .option('-f, --force', 'force deployment without confirmation')
  .option('-r, --rollback', 'enable automatic rollback on failure')
  .option('-t, --timeout <seconds>', 'deployment timeout', '300')
  .option('--dry-run', 'simulate deployment without executing')
  .option('--skip-tests', 'skip pre-deployment tests')
  .action((environment, version, options) => {
    console.log(`🚀 Deploying version ${version} to ${environment}`);
    console.log('Options:', options);
  });

// Add custom help sections to deploy command
deployCmd.addHelpText('before', `
🎯 Deployment Command
This command handles application deployment to various environments.
`);

deployCmd.addHelpText('after', `
${msg.examples}
  Deploy latest to staging:
    $ custom-help-demo deploy staging

  Deploy specific version to production:
    $ custom-help-demo deploy prod v2.1.0 --force

  Dry run deployment:
    $ custom-help-demo deploy dev --dry-run

  Deploy with rollback enabled:
    $ custom-help-demo deploy prod --rollback --timeout 600

⚠️  Warning: Production deployments require --force flag for safety.
💡 Tip: Use --dry-run first to validate your deployment configuration.
`);

// Config command with dynamic help
const configCmd = program
  .command('config')
  .description('manage application configuration')
  .option('--set <key=value>', 'set configuration value')
  .option('--get <key>', 'get configuration value')
  .option('--list', 'list all configuration values')
  .option('--reset', 'reset to default configuration')
  .action((options) => {
    console.log('⚙️  Configuration management');
    console.log('Options:', options);
  });

// Dynamic help based on environment
configCmd.addHelpText('after', (context) => {
  const isDev = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';
  
  let helpText = `\n${msg.examples}\n`;
  helpText += `  Set API endpoint:\n`;
  helpText += `    $ custom-help-demo config --set api.endpoint=https://api.example.com\n\n`;
  helpText += `  Get current configuration:\n`;
  helpText += `    $ custom-help-demo config --list\n\n`;
  
  if (isDev) {
    helpText += `🔧 Development Mode:\n`;
    helpText += `  Additional debug options are available in development mode.\n`;
    helpText += `  Use --set debug.level=verbose for detailed logging.\n\n`;
  }
  
  if (isProduction) {
    helpText += `🔒 Production Mode:\n`;
    helpText += `  Configuration changes require confirmation in production.\n`;
    helpText += `  Sensitive values are automatically masked.\n\n`;
  }
  
  helpText += `📁 Configuration file location:\n`;
  helpText += `  ${process.env.HOME || process.env.USERPROFILE}/.custom-help-demo.json\n`;
  
  return helpText;
});

// Status command with conditional help
const statusCmd = program
  .command('status')
  .alias('st')
  .description('show application status and health information')
  .option('--json', 'output status as JSON')
  .option('--watch', 'continuously monitor status')
  .option('--services <services...>', 'check specific services only')
  .action((options) => {
    console.log('📊 Application status');
    console.log('Options:', options);
  });

// Help that changes based on user permissions
statusCmd.addHelpText('after', () => {
  const isAdmin = process.env.USER === 'admin' || process.env.USERNAME === 'admin';
  
  let helpText = `\n${msg.examples}\n`;
  helpText += `  Basic status check:\n`;
  helpText += `    $ custom-help-demo status\n\n`;
  helpText += `  JSON output:\n`;
  helpText += `    $ custom-help-demo status --json\n\n`;
  helpText += `  Monitor specific services:\n`;
  helpText += `    $ custom-help-demo status --services api,database\n\n`;
  
  if (isAdmin) {
    helpText += `👑 Administrator Commands:\n`;
    helpText += `  $ custom-help-demo status --watch --services all\n`;
    helpText += `  $ custom-help-demo status --json | jq '.services[] | select(.status != "healthy")'\n\n`;
  }
  
  helpText += `📈 Status Information Includes:\n`;
  helpText += `  • Service health and uptime\n`;
  helpText += `  • Resource usage (CPU, memory)\n`;
  helpText += `  • Database connectivity\n`;
  helpText += `  • External API status\n`;
  
  return helpText;
});

// Add global help customization
program.addHelpText('before', `
┌─────────────────────────────────────────────────────────────┐
│                    🎨 Custom Help Demo                      │
│         Showcasing GoCommander's help customization        │
└─────────────────────────────────────────────────────────────┘
`);

program.addHelpText('afterAll', (context) => {
  const isSubcommand = context.command !== context.program;
  
  let helpText = `\n📚 Additional Resources:\n`;
  helpText += `  • Documentation: https://gocommander.dev/docs\n`;
  helpText += `  • GitHub: https://github.com/rohitsoni-dev/gocommander\n`;
  helpText += `  • Issues: https://github.com/rohitsoni-dev/gocommander/issues\n\n`;
  
  if (isSubcommand) {
    helpText += `💡 Run '${context.program.name()} --help' for general help.\n`;
  } else {
    helpText += `💡 Run '${context.program.name()} <command> --help' for command-specific help.\n`;
  }
  
  helpText += `\n🌍 Language: Set LANG environment variable to change interface language.\n`;
  helpText += `   Supported: en (English), es (Español), fr (Français)\n`;
  
  return helpText;
});

// Custom help event handlers
program.on('--help', () => {
  console.log('\n🎉 Thank you for using the Custom Help Demo!');
});

deployCmd.on('--help', () => {
  console.log('\n🚀 Ready to deploy? Remember to test in staging first!');
});

configCmd.on('--help', () => {
  console.log('\n⚙️  Configuration changes take effect immediately.');
});

// Handle help for unknown commands
program.on('command:*', (operands) => {
  const unknownCommand = operands[0];
  const availableCommands = program.commands.map(cmd => cmd.name());
  
  console.error(`\n❌ Unknown command: ${unknownCommand}`);
  
  // Suggest similar commands
  const suggestions = availableCommands.filter(cmd => 
    cmd.includes(unknownCommand) || unknownCommand.includes(cmd)
  );
  
  if (suggestions.length > 0) {
    console.error(`\n💡 Did you mean: ${suggestions.join(', ')}?`);
  }
  
  console.error(`\n📖 Run '${program.name()} --help' to see available commands.`);
  process.exit(1);
});

// Parse command line arguments
program.parse();