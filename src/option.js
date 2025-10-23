class Option {
  constructor(flags, description) {
    this.flags = flags;
    this.description = description || '';
    this.required = false;
    this.optional = false;
    this.variadic = false;
    this.mandatory = false;
    this.defaultValue = undefined;
    this.choices = undefined;
    this.hidden = false;
    this.parseArg = undefined;
    this.negatable = false;
    this.negate = false;
    this.optionalValue = false;
    this.requiresValue = false;
    this.conflictsWith = [];
    this.impliesOptions = [];
    this.envVar = undefined;
    this.presetArg = undefined;
    
    // Commander.js compatibility properties
    this.short = undefined;
    this.long = undefined;
    this.argDescription = undefined;
    
    this._parseFlags();
  }

  _parseFlags() {
    // Parse flags like "-v, --verbose" or "--port <number>" or "--no-color"
    // Split by comma and whitespace, but preserve argument descriptions
    const parts = this.flags.split(',').map(p => p.trim());
    
    for (const part of parts) {
      // Handle negatable options (--no-xxx)
      if (part.startsWith('--no-')) {
        this.long = part.split(/\s+/)[0]; // Keep '--no-' but remove arg description
        this.negate = true;
        this.negatable = true;
        
        // Check for argument description after the flag
        const argMatch = part.match(/--no-[a-zA-Z0-9-]+\s+(.+)/);
        if (argMatch) {
          this.argDescription = argMatch[1];
          this._parseArgDescription(argMatch[1]);
        }
        continue;
      }
      
      // Match flag and optional argument description
      const match = part.match(/^(-{1,2})([a-zA-Z0-9][a-zA-Z0-9-]*)(?:\s+(.+))?$/);
      if (match) {
        const [, dashes, name, arg] = match;
        
        if (dashes === '-') {
          this.short = `-${name}`;
        } else if (dashes === '--') {
          this.long = `--${name}`;
        }
        
        if (arg) {
          this.argDescription = arg;
          this._parseArgDescription(arg);
        }
      }
    }
  }

  _parseArgDescription(arg) {
    // Check for variadic (...)
    if (arg.includes('...')) {
      this.variadic = true;
    }
    
    // Check for optional value [value]
    if (arg.startsWith('[') && arg.endsWith(']')) {
      this.optional = true;
      this.optionalValue = true;
    } else if (arg.startsWith('<') && arg.endsWith('>')) {
      this.required = true;
      this.requiresValue = true;
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
    this.mandatory = mandatory;
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

  // Commander.js API methods
  name() {
    if (this.long) {
      return this.long.replace(/^--/, '');
    }
    if (this.short) {
      return this.short.replace(/^-/, '');
    }
    return 'unknown';
  }

  isBoolean() {
    return !this.required && !this.optional;
  }

  _collectValue(value, previous) {
    if (this.variadic) {
      if (previous === undefined || previous === this.defaultValue) {
        return [value];
      }
      if (Array.isArray(previous)) {
        return previous.concat(value);
      }
      return [previous, value];
    }
    return value;
  }

  // Get the attribute name for storing the option value
  attributeName() {
    if (this.long) {
      return this.long.replace(/^--/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    }
    if (this.short) {
      return this.short.replace(/^-/, '');
    }
    return 'unknown';
  }

  // Check if this option matches a given flag
  is(flag) {
    // Handle different flag formats
    const cleanFlag = flag.replace(/^-+/, '');
    const shortName = this.short ? this.short.replace(/^-/, '') : '';
    const longName = this.long ? this.long.replace(/^--/, '') : '';
    
    // Direct matches
    if (flag === this.short || flag === this.long) {
      return true;
    }
    
    // Clean name matches
    if (cleanFlag === shortName || cleanFlag === longName) {
      return true;
    }
    
    // Handle negatable options - check both positive and negative forms
    if (this.negatable && this.long) {
      const baseName = this.long.replace(/^--/, '');
      const negatedName = `no-${baseName}`;
      
      // Check if flag matches the negated form
      if (cleanFlag === negatedName || flag === `--${negatedName}`) {
        return true;
      }
    }
    
    return false;
  }

  // Check if the flag is the negated version
  isNegated(flag) {
    if (!this.negatable) return false;
    
    const cleanFlag = flag.replace(/^-+/, '');
    const longName = this.long ? this.long.replace(/^--/, '') : '';
    
    // Handle both --no-xxx and no-xxx formats
    return cleanFlag === `no-${longName}` || 
           (this.long && flag === this.long.replace(/^--/, '--no-'));
  }

  // Parse the option value with enhanced processing
  parseValue(value, previous, isNegated = false) {
    // Handle negatable boolean options
    if (this.negatable) {
      if (isNegated) {
        return false;
      } else if (this.isBoolean() && (value === undefined || value === '')) {
        return true;
      }
    }
    
    // Handle environment variable (but don't override explicit CLI values)
    if ((value === undefined || value === '') && this.envVar && process.env[this.envVar]) {
      value = process.env[this.envVar];
    }
    
    // Use preset value if available and no value provided
    if ((value === undefined || value === '') && this.presetArg !== undefined) {
      value = this.presetArg;
    }
    
    // For boolean options without explicit value, default to true
    if ((value === undefined || value === '') && this.isBoolean()) {
      return true;
    }
    
    // Use default if no value provided and not a boolean
    if (value === undefined && this.defaultValue !== undefined) {
      value = this.defaultValue;
    }
    
    // Handle variadic options early to preserve array structure
    if (this.variadic) {
      return this._processVariadicValue(value, previous);
    }
    
    // Apply custom parser if available
    if (this.parseArg && value !== undefined && value !== '') {
      try {
        value = this.parseArg(value, previous);
      } catch (error) {
        throw new Error(`Invalid value for option ${this.flags}: ${error.message}`);
      }
    }
    
    // Validate choices after parsing
    if (this.choices && value !== undefined && value !== '') {
      if (!this.choices.includes(value)) {
        throw new Error(`Invalid choice for option ${this.flags}. Expected one of: ${this.choices.join(', ')}`);
      }
    }
    
    return value;
  }

  // Process variadic option values
  _processVariadicValue(value, previous) {
    // Initialize with empty array if no previous value
    if (previous === undefined || previous === this.defaultValue) {
      if (value === undefined || value === '') {
        return this.defaultValue !== undefined ? this.defaultValue : [];
      }
      return [value];
    }
    
    // Ensure previous is an array
    if (!Array.isArray(previous)) {
      previous = [previous];
    }
    
    // Add new value if provided
    if (value !== undefined && value !== '') {
      // Apply custom parser to individual values if available
      if (this.parseArg) {
        try {
          value = this.parseArg(value, undefined);
        } catch (error) {
          throw new Error(`Invalid value for variadic option ${this.flags}: ${error.message}`);
        }
      }
      
      // Validate choice for individual values
      if (this.choices && !this.choices.includes(value)) {
        throw new Error(`Invalid choice for variadic option ${this.flags}. Expected one of: ${this.choices.join(', ')}`);
      }
      
      return previous.concat(value);
    }
    
    return previous;
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

// Static factory methods for creating different types of options

// Create a boolean option
Option.createBoolean = function(flags, description) {
  const option = new Option(flags, description);
  option.requiresValue = false;
  return option;
};

// Create a negatable boolean option
Option.createNegatable = function(flags, description) {
  const option = new Option(flags, description);
  option.requiresValue = false;
  option.negatable = true;
  option.negate = true;
  return option;
};

// Create a variadic option
Option.createVariadic = function(flags, description) {
  const option = new Option(flags, description);
  option.variadic = true;
  option.requiresValue = true;
  return option;
};

// Create an option with choices
Option.createChoice = function(flags, description, choices) {
  const option = new Option(flags, description);
  option.choices = choices;
  option.requiresValue = true;
  return option;
};

// Create a required option
Option.createRequired = function(flags, description) {
  const option = new Option(flags, description);
  option.required = true;
  option.requiresValue = true;
  return option;
};

// Create an option with custom parser
Option.createWithParser = function(flags, description, parser) {
  const option = new Option(flags, description);
  option.parseArg = parser;
  option.requiresValue = true;
  return option;
};

// Create an option with environment variable support
Option.createWithEnv = function(flags, description, envVar) {
  const option = new Option(flags, description);
  option.env(envVar);
  return option;
};

// Create an optional value option
Option.createOptionalValue = function(flags, description, defaultValue) {
  const option = new Option(flags, description);
  option.optionalValue = true;
  option.defaultValue = defaultValue;
  return option;
};