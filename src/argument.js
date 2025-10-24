class Argument {
  constructor(name, description) {
    this._name = name;
    this.description = description || '';
    this.required = true;
    this.variadic = false;
    this.defaultValue = undefined;
    this.argChoices = undefined;
    this.parseArg = undefined;
    
    this._parseName();
  }

  _parseName() {
    // Parse argument name like "<file>", "[file]", "<files...>"
    let name = this._name;
    
    // Check for optional argument [name]
    if (name.startsWith('[') && name.endsWith(']')) {
      this.required = false;
      name = name.slice(1, -1);
    }
    
    // Check for required argument <name>
    if (name.startsWith('<') && name.endsWith('>')) {
      this.required = true;
      name = name.slice(1, -1);
    }
    
    // Check for variadic argument name...
    if (name.endsWith('...')) {
      this.variadic = true;
      name = name.slice(0, -3);
    }
    
    this._name = name;
  }

  default(value) {
    this.defaultValue = value;
    this.required = false;
    return this;
  }

  argParser(fn) {
    this.parseArg = fn;
    return this;
  }

  choices(values) {
    this.argChoices = values.slice();
    return this;
  }

  argRequired() {
    this.required = true;
    return this;
  }

  argOptional() {
    this.required = false;
    return this;
  }

  // Commander.js API methods
  name() {
    return this._name;
  }

  // Parse the argument value
  parseValue(value, previous) {
    // Use default if no value provided and not required
    if (value === undefined && !this.required) {
      value = this.defaultValue;
    }
    
    // Check required
    if (this.required && value === undefined) {
      throw new Error(`Missing required argument: ${this.name}`);
    }
    
    // Apply custom parser if available
    if (this.parseArg && value !== undefined) {
      try {
        value = this.parseArg(value, previous);
      } catch (error) {
        throw new Error(`Invalid value for argument ${this.name}: ${error.message}`);
      }
    }
    
    // Validate choices
    if (this.choices && value !== undefined) {
      if (!this.choices.includes(value)) {
        throw new Error(`Invalid choice for argument ${this.name}. Expected one of: ${this.choices.join(', ')}`);
      }
    }
    
    // Handle variadic arguments
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

  // Get help text for this argument
  helpText() {
    let text = this._name;
    
    if (this.variadic) {
      text += '...';
    }
    
    if (this.required) {
      text = `<${text}>`;
    } else {
      text = `[${text}]`;
    }
    
    if (this.description) {
      text += '  ' + this.description;
    }
    
    if (this.defaultValue !== undefined) {
      text += ` (default: ${this.defaultValue})`;
    }
    
    if (this.choices) {
      text += ` (choices: ${this.choices.join(', ')})`;
    }
    
    return text;
  }

  // Commander.js compatibility method
  humanReadableArgName() {
    let name = this._name;
    if (this.variadic) {
      name += '...';
    }
    return this.required ? `<${name}>` : `[${name}]`;
  }
}

module.exports = { Argument };