const { EventEmitter } = require('events');
const { wasmLoader } = require('./wasm-loader');
const { Option } = require('./option');
const { Argument } = require('./argument');
const { CommanderError } = require('./errors');

class Command extends EventEmitter {
  constructor(name) {
    super();
    this._name = name || '';
    this._description = '';
    this._wasmCommandId = null;
    this._options = [];
    this._arguments = [];
    this._commands = [];
    this._parent = null;
    this._aliases = [];
    this._hidden = false;
    this._action = null;
    this._version = null;
    
    // Initialize WASM if name is provided
    if (name) {
      this._initializeWASM();
    }
  }

  async _initializeWASM() {
    try {
      await wasmLoader.loadWASM();
      const wasmInterface = wasmLoader.getInterface();
      
      const result = wasmInterface.createCommand(this._name, this._description);
      if (result.error) {
        throw new Error(result.error);
      }
      
      this._wasmCommandId = result.id;
    } catch (error) {
      // Fallback to JavaScript-only mode for development
      console.warn('WASM not available, using JavaScript fallback:', error.message);
      this._wasmCommandId = `js_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  async _ensureWASM() {
    if (!this._wasmCommandId) {
      await this._initializeWASM();
    }
  }

  // Core API methods matching Commander.js

  name(str) {
    if (str === undefined) return this._name;
    this._name = str;
    return this;
  }

  description(str) {
    if (str === undefined) return this._description;
    this._description = str;
    return this;
  }

  alias(alias) {
    if (alias === undefined) return this._aliases[0];
    this._aliases.push(alias);
    return this;
  }

  aliases(aliases) {
    if (aliases === undefined) return this._aliases;
    this._aliases = aliases.slice();
    return this;
  }

  usage(str) {
    if (str === undefined) return this._usage;
    this._usage = str;
    return this;
  }

  option(flags, description, defaultValue) {
    const option = new Option(flags, description);
    if (defaultValue !== undefined) {
      option.default(defaultValue);
    }
    
    this._options.push(option);
    
    // Add to WASM if available
    this._addOptionToWASM(option);
    
    return this;
  }

  requiredOption(flags, description, defaultValue) {
    const option = new Option(flags, description);
    option.required = true;
    if (defaultValue !== undefined) {
      option.default(defaultValue);
    }
    
    this._options.push(option);
    this._addOptionToWASM(option);
    
    return this;
  }

  argument(name, description) {
    const argument = new Argument(name, description);
    this._arguments.push(argument);
    
    // Add to WASM if available
    this._addArgumentToWASM(argument);
    
    return this;
  }

  command(nameAndArgs, description, opts) {
    const cmd = new Command();
    
    // Parse name and arguments
    const parts = nameAndArgs.split(' ');
    cmd._name = parts[0];
    
    if (description) {
      cmd._description = description;
    }
    
    if (opts) {
      if (opts.hidden) cmd._hidden = true;
      if (opts.isDefault) cmd._isDefault = true;
    }
    
    cmd._parent = this;
    this._commands.push(cmd);
    
    return cmd;
  }

  addCommand(cmd) {
    cmd._parent = this;
    this._commands.push(cmd);
    return this;
  }

  action(fn) {
    this._action = fn;
    return this;
  }

  version(str, flags, description) {
    if (str === undefined) return this._version;
    
    this._version = str;
    
    // Add version option
    const versionFlags = flags || '-V, --version';
    const versionDesc = description || 'display version number';
    
    this.option(versionFlags, versionDesc);
    
    return this;
  }

  async parse(argv, options) {
    await this._ensureWASM();
    
    // Use process.argv if not provided
    if (!argv) {
      argv = process.argv;
    }
    
    // Remove 'node' and script name from argv
    if (argv.length > 2 && (argv[0].endsWith('node') || argv[0].endsWith('node.exe'))) {
      argv = argv.slice(2);
    }
    
    try {
      if (wasmLoader.isWASMLoaded()) {
        return await this._parseWithWASM(argv);
      } else {
        return this._parseWithJS(argv);
      }
    } catch (error) {
      if (error instanceof CommanderError) {
        throw error;
      }
      throw new CommanderError(error.message);
    }
  }

  async parseAsync(argv, options) {
    return this.parse(argv, options);
  }

  // Helper methods

  async _addOptionToWASM(option) {
    if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
      return;
    }
    
    try {
      const wasmInterface = wasmLoader.getInterface();
      const result = wasmInterface.addOption(
        this._wasmCommandId,
        option.flags,
        option.description,
        option.defaultValue,
        option.required
      );
      
      if (result.error) {
        console.warn('Failed to add option to WASM:', result.error);
      }
    } catch (error) {
      console.warn('Error adding option to WASM:', error.message);
    }
  }

  async _addArgumentToWASM(argument) {
    if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
      return;
    }
    
    try {
      const wasmInterface = wasmLoader.getInterface();
      const result = wasmInterface.addArgument(
        this._wasmCommandId,
        argument.name,
        argument.description,
        argument.required
      );
      
      if (result.error) {
        console.warn('Failed to add argument to WASM:', result.error);
      }
    } catch (error) {
      console.warn('Error adding argument to WASM:', error.message);
    }
  }

  async _parseWithWASM(argv) {
    const wasmInterface = wasmLoader.getInterface();
    const result = wasmInterface.parseArguments(this._wasmCommandId, argv);
    
    if (result.error) {
      throw new CommanderError(result.error);
    }
    
    // Execute action if available
    if (this._action) {
      await this._action(result.arguments, result.options);
    }
    
    return result;
  }

  _parseWithJS(argv) {
    // Fallback JavaScript implementation
    const options = {};
    const args = [];
    
    // Simple parsing logic for fallback
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      
      if (arg.startsWith('-')) {
        // Handle options
        const option = this._findOption(arg);
        if (option) {
          if (option.requiresValue && i + 1 < argv.length) {
            options[option.attributeName()] = argv[++i];
          } else {
            options[option.attributeName()] = true;
          }
        }
      } else {
        args.push(arg);
      }
    }
    
    // Execute action if available
    if (this._action) {
      this._action(args, options);
    }
    
    return { options, arguments: args };
  }

  _findOption(flag) {
    const cleanFlag = flag.replace(/^-+/, '');
    return this._options.find(opt => 
      opt.short === cleanFlag || opt.long === cleanFlag
    );
  }

  // Output methods

  outputHelp() {
    console.log(this.helpInformation());
  }

  helpInformation() {
    let help = '';
    
    if (this._description) {
      help += this._description + '\n\n';
    }
    
    help += 'Usage: ' + this._name;
    
    if (this._options.length > 0) {
      help += ' [options]';
    }
    
    if (this._arguments.length > 0) {
      help += ' ' + this._arguments.map(arg => `<${arg.name}>`).join(' ');
    }
    
    if (this._commands.length > 0) {
      help += ' [command]';
    }
    
    help += '\n\n';
    
    if (this._options.length > 0) {
      help += 'Options:\n';
      for (const option of this._options) {
        help += `  ${option.flags.padEnd(20)} ${option.description}\n`;
      }
      help += '\n';
    }
    
    if (this._commands.length > 0) {
      help += 'Commands:\n';
      for (const cmd of this._commands) {
        if (!cmd._hidden) {
          help += `  ${cmd._name.padEnd(20)} ${cmd._description}\n`;
        }
      }
      help += '\n';
    }
    
    return help;
  }
}

module.exports = { Command };