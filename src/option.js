class Option {
  constructor(flags, description) {
    this.flags = flags;
    this.description = description || '';
    this.required = false;
    this.optional = false;
    this.variadic = false;
    this.mandatory = false;
    this.defaultValue = undefined;
    this.argChoices = undefined;
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
      
      // Match flag and optional argument description with improved regex
      const match = part.match(/^(-{1,2})([a-zA-Z0-9][a-zA-Z0-9-]*)(?:\s+(.+))?$/);
      if (match) {
        const [, dashes, name, arg] = match;
        
        if (dashes === '-') {
          this.short = `-${name}`;
        } else if (dashes === '--') {
          this.long = `--${name}`;
          
          // Don't automatically make options negatable - this should be explicit
        }
        
        if (arg) {
          this.argDescription = arg;
          this._parseArgDescription(arg);
        }
      }
    }
    
    // Validate flag configuration
    this._validateFlags();
  }

  _validateFlags() {
    if (!this.short && !this.long) {
      throw new Error(`Invalid option flags: ${this.flags}`);
    }
    
    // Ensure negatable options are boolean
    if (this.negatable && (this.required || this.optional)) {
      throw new Error(`Negatable options cannot require values: ${this.flags}`);
    }
    
    // Validate flag format
    if (this.short && !/^-[a-zA-Z0-9]$/.test(this.short)) {
      throw new Error(`Invalid short flag format: ${this.short}`);
    }
    
    if (this.long && !/^--[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(this.long)) {
      throw new Error(`Invalid long flag format: ${this.long}`);
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
      // <value> syntax means the option requires a value when provided,
      // but doesn't make the option itself mandatory unless explicitly set
      this.requiresValue = true;
      // Don't set this.required = true here - that should only be set by requiredOption()
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
    if (values === undefined) {
      return this.argChoices;
    }
    this.argChoices = Array.isArray(values) ? values : [values];
    return this;
  }

  // Additional setter methods for enhanced API compatibility
  setEnv(name) {
    return this.env(name);
  }

  setConflicts(names) {
    return this.conflicts(names);
  }

  setImplies(names) {
    return this.implies(names);
  }

  setHidden(hidden = true) {
    return this.hideHelp(hidden);
  }

  setChoices(values) {
    this.argChoices = values;
    return this;
  }

  setDefault(value) {
    return this.default(value);
  }

  setRequired(required = true) {
    this.required = required;
    this.requiresValue = required;
    return this;
  }

  setVariadic(variadic = true) {
    this.variadic = variadic;
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
      // Initialize with empty array if no previous value
      if (previous === undefined || previous === this.defaultValue) {
        // If value is also undefined, return empty array for variadic options
        if (value === undefined) {
          return this.defaultValue !== undefined && Array.isArray(this.defaultValue) ? 
                 this.defaultValue : [];
        }
        return [value];
      }
      
      // Ensure previous is an array
      if (Array.isArray(previous)) {
        // If value is undefined, just return the previous array
        if (value === undefined) {
          return previous;
        }
        return previous.concat(value);
      }
      
      // Convert non-array previous to array and add new value
      if (value === undefined) {
        return [previous];
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
      
      // If this option is defined as --no-xxx, check for positive form
      if (baseName.startsWith('no-')) {
        const positiveName = baseName.substring(3); // Remove 'no-'
        if (cleanFlag === positiveName || flag === `--${positiveName}`) {
          return true;
        }
      } else {
        // This is a positive option, check for negated form
        const negatedName = `no-${baseName}`;
        if (cleanFlag === negatedName || flag === `--${negatedName}`) {
          return true;
        }
      }
    }
    
    return false;
  }

  // Check if the flag is the negated version
  isNegated(flag) {
    if (!this.negatable) return false;
    
    const cleanFlag = flag.replace(/^-+/, '');
    const longName = this.long ? this.long.replace(/^--/, '') : '';
    
    // If this option is defined as --no-xxx, then the positive form is negated
    if (longName.startsWith('no-')) {
      const positiveName = longName.substring(3);
      return cleanFlag === positiveName || flag === `--${positiveName}`;
    } else {
      // This is a positive option, check if flag is the negated form
      return cleanFlag === `no-${longName}` || flag === `--no-${longName}`;
    }
  }

  // Parse the option value with enhanced processing
  parseValue(value, previous, isNegated = false) {
    // Handle negatable boolean options first
    if (this.negatable) {
      if (isNegated) {
        return false;
      } else if (this.isBoolean() && (value === undefined || value === '' || value === null)) {
        return true;
      }
    }
    
    // Handle variadic options early to preserve array structure
    if (this.variadic) {
      return this._processVariadicValue(value, previous);
    }
    
    // Handle environment variable (but don't override explicit CLI values)
    if ((value === undefined || value === '' || value === null) && this.envVar && process.env[this.envVar]) {
      value = process.env[this.envVar];
    }
    
    // Use preset value if available and no value provided
    if ((value === undefined || value === '' || value === null) && this.presetArg !== undefined) {
      value = this.presetArg;
    }
    
    // For boolean options without explicit value, default to true
    if ((value === undefined || value === '' || value === null) && this.isBoolean()) {
      return true;
    }
    
    // Use default if no value provided
    if ((value === undefined || value === null) && this.defaultValue !== undefined) {
      value = this.defaultValue;
    }
    
    // Handle empty string for required options
    if (this.requiresValue && (value === '' || value === null)) {
      throw new Error(`Option ${this.flags} requires a value`);
    }
    
    // Apply type conversion for common types
    if (value !== undefined && value !== null && value !== '') {
      value = this._convertType(value);
    }
    
    // Apply custom parser if available
    if (this.parseArg && value !== undefined && value !== null && value !== '') {
      try {
        value = this.parseArg(value, previous);
      } catch (error) {
        throw new Error(`Invalid value for option ${this.flags}: ${error.message}`);
      }
    }
    
    // Validate choices after parsing
    if (this.argChoices && this.argChoices.length > 0 && value !== undefined && value !== null && value !== '') {
      if (!this.argChoices.includes(value)) {
        throw new Error(`Invalid choice for option ${this.flags}. Expected one of: ${this.argChoices.join(', ')}`);
      }
    }
    
    return value;
  }

  // Convert value to appropriate type based on argument description
  _convertType(value) {
    if (typeof value !== 'string') {
      return value;
    }
    
    // Don't convert if we have a custom parser - let the parser handle it
    if (this.parseArg) {
      return value;
    }
    
    // Only convert if explicitly requested through specific argument descriptions
    // This is more conservative to avoid breaking existing behavior
    if (this.argDescription) {
      const desc = this.argDescription.toLowerCase();
      
      // Only convert for very specific patterns to avoid breaking tests
      // Most Commander.js applications expect string values by default
      
      // Boolean types - only for explicit boolean descriptions
      if (desc === 'boolean' || desc === 'bool') {
        const lower = value.toLowerCase();
        if (['true', 't', 'yes', 'y', '1', 'on', 'enable', 'enabled'].includes(lower)) {
          return true;
        }
        if (['false', 'f', 'no', 'n', '0', 'off', 'disable', 'disabled'].includes(lower)) {
          return false;
        }
      }
    }
    
    // Return string value by default to maintain Commander.js compatibility
    return value;
  }

  // Process variadic option values
  _processVariadicValue(value, previous) {
    // Initialize with empty array if no previous value or if previous is the default
    if (previous === undefined || previous === this.defaultValue) {
      if (value === undefined || value === '') {
        // For variadic options, always return an array, even if empty
        return this.defaultValue !== undefined && Array.isArray(this.defaultValue) ? 
               this.defaultValue : [];
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
      if (this.argChoices && value !== undefined && value !== null && value !== '' && !this.argChoices.includes(value)) {
        throw new Error(`Invalid choice for variadic option ${this.flags}. Expected one of: ${this.argChoices.join(', ')}`);
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
    
    if (this.argChoices) {
      text += ` (choices: ${this.argChoices.join(', ')})`;
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
  
  // Determine if this is the negative form based on flags
  if (flags.includes('--no-')) {
    option.negate = true;
  } else {
    option.negate = false;
  }
  
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
  option.argChoices = choices;
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