class Help {
  constructor() {
    this.helpWidth = undefined;
    this.sortSubcommands = false;
    this.sortOptions = false;
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
    let usage = cmd.name();
    
    // Add options placeholder
    if (cmd._options && cmd._options.length > 0) {
      usage += ' [options]';
    }
    
    // Add arguments
    if (cmd._arguments && cmd._arguments.length > 0) {
      for (const arg of cmd._arguments) {
        usage += ' ' + arg.helpText().split('  ')[0]; // Just the name part
      }
    }
    
    // Add subcommands placeholder
    if (cmd._commands && cmd._commands.length > 0) {
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
    const termWidth = this.helpWidth || this.getTerminalWidth();
    let output = '';
    
    // Usage
    output += 'Usage: ' + this.commandUsage(cmd) + '\n';
    
    // Description
    const description = this.commandDescription(cmd);
    if (description) {
      output += '\n' + description + '\n';
    }
    
    // Arguments
    if (cmd._arguments && cmd._arguments.length > 0) {
      output += '\nArguments:\n';
      for (const arg of cmd._arguments) {
        const argHelp = this.argumentDescription(arg);
        output += '  ' + this.padWidth(argHelp, termWidth) + '\n';
      }
    }
    
    // Options
    if (cmd._options && cmd._options.length > 0) {
      let options = cmd._options.slice();
      if (this.sortOptions) {
        options.sort((a, b) => a.flags.localeCompare(b.flags));
      }
      
      output += '\nOptions:\n';
      for (const option of options) {
        if (!option.hidden) {
          const optionHelp = this.optionDescription(option);
          output += '  ' + this.padWidth(optionHelp, termWidth) + '\n';
        }
      }
    }
    
    // Commands
    if (cmd._commands && cmd._commands.length > 0) {
      let commands = cmd._commands.slice();
      if (this.sortSubcommands) {
        commands.sort((a, b) => a.name().localeCompare(b.name()));
      }
      
      output += '\nCommands:\n';
      for (const subCmd of commands) {
        if (!subCmd._hidden) {
          const name = subCmd.name();
          const desc = this.subcommandDescription(subCmd);
          const cmdLine = name + (desc ? '  ' + desc : '');
          output += '  ' + this.padWidth(cmdLine, termWidth) + '\n';
        }
      }
    }
    
    return output;
  }

  // Pad text to specified width
  padWidth(str, width) {
    const maxWidth = width || 80;
    if (str.length <= maxWidth) {
      return str;
    }
    
    // Simple word wrapping
    const words = str.split(' ');
    let line = '';
    let result = '';
    
    for (const word of words) {
      if (line.length + word.length + 1 <= maxWidth) {
        line += (line ? ' ' : '') + word;
      } else {
        if (result) result += '\n  ';
        result += line;
        line = word;
      }
    }
    
    if (line) {
      if (result) result += '\n  ';
      result += line;
    }
    
    return result;
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

module.exports = { Help };