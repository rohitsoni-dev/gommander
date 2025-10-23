class Option {
  constructor(flags, description) {
    this.flags = flags;
    this.description = description || '';
    this.required = false;
    this.variadic = false;
    this.defaultValue = undefined;
    this.choices = undefined;
    this.hidden = false;
    this.parseArg = undefined;
    
    this._parseFlags();
  }

  _parseFlags() {
    // Parse flags like "-v, --verbose" or "--port <number>"
    const flagParts = this.flags.split(',').map(f => f.trim());
    
    for (const flag of flagParts) {
      const match = flag.match(/^(-{1,2})([a-zA-Z0-9-]+)(?:\s+(.+))?$/);
      if (match) {
        const [, dashes, name, arg] = match;
        
        if (dashes === '-') {
          this.short = name;
        } else if (dashes === '--') {
          this.long = name;
        }
        
        if (arg) {
          this.requiresValue = true;
          this.argDescription = arg;
          
          // Check for variadic (...)
          if (arg.includes('...')) {
            this.variadic = true;
          }
          
          // Check for optional value [value]
          if (arg.startsWith('[') && arg.endsWith(']')) {
            this.optionalValue = true;
          }
        }
      }
    }
  }

  default(value) {
    this.defaultValue = value;
    return this;
  }

  preset(value) {
    this.presetArg = value;
    return this;
  }

  env(name) {
    this.envVar = name;
    return this;
  }

  argParser(fn) {
    this.parseArg = fn;
    return this;
  }

  makeOptionMandatory(mandatory = true) {
    this.required = mandatory;
    return this;
  }

  hideHelp(hide = true) {
    this.hidden = hide;
    return this;
  }

  conflicts(names) {
    this.conflictsWith = Array.isArray(names) ? names : [names];
    return this;
  }

  implies(names) {
    this.impliesOptions = Array.isArray(names) ? names : [names];
    return this;
  }

  choices(values) {
    this.choices = values;
    return this;
  }

  // Get the attribute name for storing the option value
  attributeName() {
    if (this.long) {
      return this.long.replace(/-/g, '');
    }
    if (this.short) {
      return this.short;
    }
    return 'unknown';
  }

  // Check if this option matches a given flag
  is(flag) {
    const cleanFlag = flag.replace(/^-+/, '');
    return cleanFlag === this.short || cleanFlag === this.long;
  }

  // Parse the option value
  parseValue(value, previous) {
    // Handle environment variable
    if (value === undefined && this.envVar && process.env[this.envVar]) {
      value = process.env[this.envVar];
    }
    
    // Use default if no value provided
    if (value === undefined) {
      value = this.defaultValue;
    }
    
    // Apply custom parser if available
    if (this.parseArg && value !== undefined) {
      try {
        value = this.parseArg(value, previous);
      } catch (error) {
        throw new Error(`Invalid value for option ${this.flags}: ${error.message}`);
      }
    }
    
    // Validate choices
    if (this.choices && value !== undefined) {
      if (!this.choices.includes(value)) {
        throw new Error(`Invalid choice for option ${this.flags}. Expected one of: ${this.choices.join(', ')}`);
      }
    }
    
    // Handle variadic options
    if (this.variadic) {
      if (previous === undefined) {
        return [value];
      }
      if (Array.isArray(previous)) {
        return previous.concat(value);
      }
      return [previous, value];
    }
    
    return value;
  }

  // Get help text for this option
  helpText() {
    let text = this.flags;
    
    if (this.description) {
      text += '  ' + this.description;
    }
    
    if (this.defaultValue !== undefined) {
      text += ` (default: ${this.defaultValue})`;
    }
    
    if (this.choices) {
      text += ` (choices: ${this.choices.join(', ')})`;
    }
    
    if (this.envVar) {
      text += ` (env: ${this.envVar})`;
    }
    
    return text;
  }
}

module.exports = { Option };