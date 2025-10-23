class Help {
  constructor() {
    this.helpWidth = undefined;
    this.sortSubcommands = false;
    this.sortOptions = false;
    this.showGlobalOptions = false;
  }

  // Configure help display
  configureHelp(configuration) {
    if (configuration.helpWidth !== undefined) {
      this.helpWidth = configuration.helpWidth;
    }
    if (configuration.sortSubcommands !== undefined) {
      this.sortSubcommands = configuration.sortSubcommands;
    }
    if (configuration.sortOptions !== undefined) {
      this.sortOptions = configuration.sortOptions;
    }
    return this;
  }

  // Get the command usage string
  commandUsage(cmd) {
    // Use custom usage if set
    if (cmd._usage) {
      return cmd._usage;
    }

    let usage = cmd.name();
    
    // Add options placeholder
    if (cmd.options && cmd.options.length > 0) {
      usage += ' [options]';
    }
    
    // Add arguments
    if (cmd.registeredArguments && cmd.registeredArguments.length > 0) {
      for (const arg of cmd.registeredArguments) {
        usage += ' ' + arg.humanReadableArgName();
      }
    }
    
    // Add subcommands placeholder
    if (cmd.commands && cmd.commands.length > 0) {
      usage += ' [command]';
    }
    
    return usage;
  }

  // Get the command description
  commandDescription(cmd) {
    return cmd.description();
  }

  // Get subcommand help
  subcommandDescription(cmd) {
    return cmd.description();
  }

  // Get option help
  optionDescription(option) {
    return option.helpText();
  }

  // Get argument help
  argumentDescription(argument) {
    return argument.helpText();
  }

  // Format help for a command
  formatHelp(cmd, helper) {
    const termWidth = this.padWidth(cmd, helper);
    let output = '';
    
    // Emit beforeAll help event
    cmd.emit('beforeAllHelp', { command: cmd, error: false });
    
    // Usage
    output += 'Usage: ' + this.commandUsage(cmd) + '\n';
    
    // Description
    const description = this.commandDescription(cmd);
    if (description) {
      output += '\n' + description + '\n';
    }
    
    // Emit before help event
    cmd.emit('beforeHelp', { command: cmd, error: false });
    
    // Arguments
    if (cmd.registeredArguments && cmd.registeredArguments.length > 0) {
      output += '\nArguments:\n';
      const maxArgWidth = Math.max(...cmd.registeredArguments.map(arg => 
        arg.humanReadableArgName().length));
      
      for (const arg of cmd.registeredArguments) {
        const name = arg.humanReadableArgName().padEnd(maxArgWidth);
        const desc = arg.description || '';
        output += `  ${name}  ${desc}\n`;
      }
    }
    
    // Options
    const visibleOptions = this.visibleOptions(cmd);
    if (visibleOptions.length > 0) {
      output += '\nOptions:\n';
      const maxFlagWidth = Math.max(...visibleOptions.map(opt => opt.flags.length));
      
      for (const option of visibleOptions) {
        const flags = option.flags.padEnd(maxFlagWidth);
        const desc = option.description || '';
        output += `  ${flags}  ${desc}\n`;
      }
    }
    
    // Commands
    const visibleCommands = this.visibleCommands(cmd);
    if (visibleCommands.length > 0) {
      output += '\nCommands:\n';
      const maxNameWidth = Math.max(...visibleCommands.map(cmd => cmd.name().length));
      
      for (const subCmd of visibleCommands) {
        const name = subCmd.name().padEnd(maxNameWidth);
        const desc = this.subcommandDescription(subCmd);
        output += `  ${name}  ${desc}\n`;
      }
    }
    
    // Emit after help event
    cmd.emit('afterHelp', { command: cmd, error: false });
    
    // Emit afterAll help event
    cmd.emit('afterAllHelp', { command: cmd, error: false });
    
    return output;
  }

  // Get visible options for help display
  visibleOptions(cmd) {
    let options = cmd.options.filter(option => !option.hidden);
    if (this.sortOptions) {
      options.sort((a, b) => a.flags.localeCompare(b.flags));
    }
    return options;
  }

  // Get visible commands for help display
  visibleCommands(cmd) {
    let commands = cmd.commands.filter(cmd => !cmd._hidden);
    if (this.sortSubcommands) {
      commands.sort((a, b) => a.name().localeCompare(b.name()));
    }
    return commands;
  }

  // Calculate padding width for help display
  padWidth(cmd, helper) {
    if (this.helpWidth !== undefined) {
      return this.helpWidth;
    }
    
    // Use output configuration to get width
    if (cmd._outputConfiguration && cmd._outputConfiguration.getOutHelpWidth) {
      const width = cmd._outputConfiguration.getOutHelpWidth();
      if (width !== undefined) {
        return width;
      }
    }
    
    return this.getTerminalWidth();
  }

  // Get terminal width
  getTerminalWidth() {
    if (process.stdout.columns) {
      return Math.min(process.stdout.columns, 120);
    }
    return 80;
  }

  // Wrap text to specified width
  wrap(str, width, indent) {
    const maxWidth = width || this.getTerminalWidth();
    const indentStr = ' '.repeat(indent || 0);
    
    if (str.length <= maxWidth) {
      return indentStr + str;
    }
    
    const words = str.split(' ');
    let line = '';
    let result = '';
    
    for (const word of words) {
      if (line.length + word.length + 1 <= maxWidth - indentStr.length) {
        line += (line ? ' ' : '') + word;
      } else {
        if (result) result += '\n';
        result += indentStr + line;
        line = word;
      }
    }
    
    if (line) {
      if (result) result += '\n';
      result += indentStr + line;
    }
    
    return result;
  }
}

// Utility function to strip ANSI color codes
function stripColor(str) {
  // Remove ANSI escape sequences
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

module.exports = { Help, stripColor };