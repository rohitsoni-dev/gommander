const { Option } = require('./option');

/**
 * OptionProcessor handles complex option processing scenarios
 * This class provides the JavaScript interface to the Go option processing system
 */
class OptionProcessor {
  constructor() {
    this.options = new Map();
    this.values = new Map();
    this.groups = [];
    this.customValidators = [];
    this.preprocessors = new Map();
    this.postprocessors = new Map();
  }

  /**
   * Reset values for fresh parsing while keeping option structure
   */
  reset() {
    this.values.clear();
  }

  /**
   * Add preprocessor for an option
   */
  addPreprocessor(optionName, processor) {
    this.preprocessors.set(optionName, processor);
    return this;
  }

  /**
   * Add postprocessor for an option
   */
  addPostprocessor(optionName, processor) {
    this.postprocessors.set(optionName, processor);
    return this;
  }

  /**
   * Add an option to the processor
   * @param {Option} option - The option to add
   * @returns {OptionProcessor} - Returns this for chaining
   */
  addOption(option) {
    if (!(option instanceof Option)) {
      throw new Error('Expected Option instance');
    }

    const key = this._getOptionKey(option);
    
    // Check for conflicts with existing options
    for (const [, existingOption] of this.options) {
      this._checkCompatibility(option, existingOption);
    }

    this.options.set(key, option);

    // Don't set default value here - it will be handled in getValues()
    // This allows environment variables to take precedence over defaults

    return this;
  }

  /**
   * Process a single option with its value with enhanced processing
   * @param {string} flag - The flag name (without dashes)
   * @param {string} value - The option value
   * @returns {OptionProcessor} - Returns this for chaining
   */
  processOption(flag, value) {
    const { option, key, isNegated } = this._findOption(flag);
    
    if (!option) {
      throw new Error(`Unknown option: ${flag}`);
    }

    // Apply preprocessing if available
    if (this.preprocessors.has(key)) {
      try {
        value = this.preprocessors.get(key)(value);
      } catch (error) {
        throw new Error(`Preprocessing failed for option ${flag}: ${error.message}`);
      }
    }

    // Get current value for variadic options
    const currentValue = this.values.get(key);

    // Process the value with enhanced error handling
    let processedValue;
    try {
      processedValue = option.parseValue(value, currentValue, isNegated);
    } catch (error) {
      throw new Error(`Failed to process option ${flag}: ${error.message}`);
    }

    // Store the processed value
    this.values.set(key, processedValue);

    // Apply postprocessing if available
    if (this.postprocessors.has(key)) {
      try {
        processedValue = this.postprocessors.get(key)(processedValue);
        this.values.set(key, processedValue);
      } catch (error) {
        throw new Error(`Postprocessing failed for option ${flag}: ${error.message}`);
      }
    }

    // Handle implied options with enhanced logic
    if (option.impliesOptions && option.impliesOptions.length > 0) {
      for (const impliedFlag of option.impliesOptions) {
        const { option: impliedOption, key: impliedKey } = this._findOption(impliedFlag);
        if (impliedOption && !this.values.has(impliedKey)) {
          const impliedValue = impliedOption.defaultValue !== undefined ? 
                             impliedOption.defaultValue : 
                             (impliedOption.isBoolean() ? true : undefined);
          if (impliedValue !== undefined) {
            this.values.set(impliedKey, impliedValue);
          }
        }
      }
    }

    return this;
  }

  /**
   * Process a boolean option (flag without value)
   * @param {string} flag - The flag name
   * @returns {OptionProcessor} - Returns this for chaining
   */
  processBooleanOption(flag) {
    return this.processOption(flag, '');
  }

  /**
   * Process a variadic option with multiple values
   * @param {string} flag - The flag name
   * @param {string[]} values - Array of values
   * @returns {OptionProcessor} - Returns this for chaining
   */
  processVariadicOption(flag, values) {
    const { option, key } = this._findOption(flag);
    
    if (!option) {
      throw new Error(`Unknown option: ${flag}`);
    }

    if (!option.variadic) {
      throw new Error(`Option ${flag} is not variadic`);
    }

    let currentValue = this.values.get(key);

    for (const value of values) {
      currentValue = option.parseValue(value, currentValue, false);
    }

    this.values.set(key, currentValue);
    return this;
  }

  /**
   * Add a preprocessor for an option
   * @param {string} optionKey - The option key
   * @param {Function} preprocessor - The preprocessing function
   * @returns {OptionProcessor} - Returns this for chaining
   */
  addPreprocessor(optionKey, preprocessor) {
    this.preprocessors.set(optionKey, preprocessor);
    return this;
  }

  /**
   * Add a postprocessor for an option
   * @param {string} optionKey - The option key
   * @param {Function} postprocessor - The postprocessing function
   * @returns {OptionProcessor} - Returns this for chaining
   */
  addPostprocessor(optionKey, postprocessor) {
    this.postprocessors.set(optionKey, postprocessor);
    return this;
  }

  /**
   * Add a custom validator
   * @param {Function} validator - The validation function
   * @returns {OptionProcessor} - Returns this for chaining
   */
  addCustomValidator(validator) {
    this.customValidators.push(validator);
    return this;
  }

  /**
   * Validate all processed options with enhanced validation
   * @throws {Error} - If validation fails
   */
  validate() {
    // Check required options (including mandatory options)
    for (const [key, option] of this.options) {
      const hasValue = this.values.has(key);
      const value = this.values.get(key);
      
      if ((option.required || option.mandatory) && (!hasValue || value === undefined)) {
        throw new Error(`Missing required option: ${option.flags}`);
      }
    }

    // Check conflicts with enhanced logic
    for (const [key1, option1] of this.options) {
      if (!this.values.has(key1)) continue;

      if (option1.conflictsWith && option1.conflictsWith.length > 0) {
        for (const conflictFlag of option1.conflictsWith) {
          const { key: conflictKey, option: conflictOption } = this._findOption(conflictFlag);
          if (conflictOption && this.values.has(conflictKey)) {
            throw new Error(`Conflicting options: ${option1.flags} and ${conflictOption.flags}`);
          }
        }
      }
    }

    // Validate option groups with enhanced error messages
    for (const group of this.groups) {
      try {
        this._validateGroup(group);
      } catch (error) {
        throw new Error(`Option group validation failed: ${error.message}`);
      }
    }

    // Apply custom validators with enhanced error handling
    for (const validator of this.customValidators) {
      try {
        const result = validator(this.getValues());
        if (result === false) {
          throw new Error('Custom validation failed');
        } else if (typeof result === 'object' && result.valid === false) {
          throw new Error(result.message || 'Custom validation failed');
        }
      } catch (error) {
        throw new Error(`Custom validation failed: ${error.message}`);
      }
    }
  }

  /**
   * Get all processed option values with enhanced precedence handling
   * @returns {Object} - Object with option values
   */
  getValues() {
    const result = {};
    
    // Process all options to ensure proper precedence: CLI > Environment > Default
    for (const [key, option] of this.options) {
      let value = this.values.get(key);
      let valueSource = 'default';
      
      // Check if we have an explicit CLI value
      if (value !== undefined) {
        valueSource = 'cli';
      } else if (option.envVar && process.env[option.envVar] !== undefined) {
        // Check environment variable if no CLI value
        try {
          const envValue = process.env[option.envVar];
          if (option.parseArg) {
            value = option.parseArg(envValue, option.defaultValue);
          } else {
            value = envValue;
          }
          valueSource = 'env';
        } catch (error) {
          throw new Error(`Invalid environment variable value for ${option.flags}: ${error.message}`);
        }
      } else if (option.defaultValue !== undefined) {
        // Fall back to default value
        value = option.defaultValue;
        valueSource = 'default';
      }
      
      // For variadic options, ensure we always have an array
      if (option.variadic && value === undefined) {
        value = [];
        valueSource = 'default';
      }
      
      // Store the final value if it's defined
      if (value !== undefined) {
        result[key] = value;
        // Store source information for debugging
        result[`${key}_source`] = valueSource;
      }
    }
    
    return result;
  }

  /**
   * Get value for a specific option
   * @param {string} key - The option key
   * @returns {*} - The option value or undefined
   */
  getValue(key) {
    return this.values.get(key);
  }

  /**
   * Check if an option has been set
   * @param {string} key - The option key
   * @returns {boolean} - True if the option has been set
   */
  hasValue(key) {
    return this.values.has(key);
  }

  /**
   * Set a value for an option
   * @param {string} key - The option key
   * @param {*} value - The value to set
   * @returns {OptionProcessor} - Returns this for chaining
   */
  setValue(key, value) {
    this.values.set(key, value);
    return this;
  }

  /**
   * Add an option group for validation
   * @param {OptionGroup} group - The option group
   * @returns {OptionProcessor} - Returns this for chaining
   */
  addOptionGroup(group) {
    this.groups.push(group);
    
    // Add all options from the group
    for (const option of group.options) {
      this.addOption(option);
    }
    
    return this;
  }

  /**
   * Find an option by flag name
   * @private
   * @param {string} flag - The flag name (can include dashes or be clean)
   * @returns {Object} - Object with option, key, and isNegated properties
   */
  _findOption(flag) {
    // Clean the flag name for consistent matching
    const cleanFlag = flag.replace(/^-+/, '');
    
    for (const [key, option] of this.options) {
      // Check multiple matching patterns
      if (option.is(flag) || 
          option.is(`-${cleanFlag}`) || 
          option.is(`--${cleanFlag}`) ||
          (option.long && option.long.replace(/^--/, '') === cleanFlag) ||
          (option.short && option.short.replace(/^-/, '') === cleanFlag) ||
          key === cleanFlag) {
        return {
          option,
          key,
          isNegated: option.isNegated ? option.isNegated(flag) : false
        };
      }
    }
    return { option: null, key: null, isNegated: false };
  }

  /**
   * Get the preferred key for an option
   * @private
   * @param {Option} option - The option
   * @returns {string} - The option key
   */
  _getOptionKey(option) {
    // Use the attribute name for consistency with Command class
    return option.attributeName();
  }

  /**
   * Check compatibility between two options
   * @private
   * @param {Option} option1 - First option
   * @param {Option} option2 - Second option
   * @throws {Error} - If options are incompatible
   */
  _checkCompatibility(option1, option2) {
    // Skip compatibility check if it's the same option instance
    if (option1 === option2) {
      return;
    }
    
    // Check for flag conflicts only if they're different options
    if (option1.short && option2.short && option1.short === option2.short) {
      throw new Error(`Short flag conflict: both options use ${option1.short}`);
    }

    if (option1.long && option2.long && option1.long === option2.long) {
      throw new Error(`Long flag conflict: both options use ${option1.long}`);
    }
    
    // Check for attribute name conflicts
    if (option1.attributeName() === option2.attributeName()) {
      throw new Error(`Attribute name conflict: both options use attribute '${option1.attributeName()}'`);
    }
  }

  /**
   * Validate an option group
   * @private
   * @param {OptionGroup} group - The option group to validate
   * @throws {Error} - If group validation fails
   */
  _validateGroup(group) {
    const setOptions = [];

    // Find which options in the group are set
    for (const option of group.options) {
      const key = this._getOptionKey(option);
      if (this.values.has(key)) {
        setOptions.push(option);
      }
    }

    // Check exclusive constraint
    if (group.exclusive && setOptions.length > 1) {
      const optionNames = setOptions.map(opt => opt.flags);
      throw new Error(`Options in group '${group.name}' are mutually exclusive, but multiple were set: ${optionNames.join(', ')}`);
    }

    // Check required constraint
    if (group.required && setOptions.length === 0) {
      throw new Error(`At least one option from group '${group.name}' is required`);
    }
  }
}

/**
 * OptionGroup represents a group of related options
 */
class OptionGroup {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.options = [];
    this.exclusive = false;
    this.required = false;
    this.minCount = undefined;
    this.maxCount = undefined;
    this.customValidator = null;
  }

  /**
   * Add an option to the group
   * @param {Option} option - The option to add
   * @returns {OptionGroup} - Returns this for chaining
   */
  addOption(option) {
    if (this.options.includes(option)) {
      throw new Error(`Option ${option.flags} is already in group ${this.name}`);
    }
    this.options.push(option);
    return this;
  }

  /**
   * Add multiple options to the group
   * @param {Option[]} options - Array of options to add
   * @returns {OptionGroup} - Returns this for chaining
   */
  addOptions(options) {
    for (const option of options) {
      this.addOption(option);
    }
    return this;
  }

  /**
   * Mark the group as mutually exclusive
   * @param {boolean} exclusive - Whether the group is exclusive
   * @returns {OptionGroup} - Returns this for chaining
   */
  setExclusive(exclusive = true) {
    this.exclusive = exclusive;
    if (exclusive) {
      this.maxCount = 1;
    }
    return this;
  }

  /**
   * Mark the group as required
   * @param {boolean} required - Whether the group is required
   * @returns {OptionGroup} - Returns this for chaining
   */
  setRequired(required = true) {
    this.required = required;
    if (required && this.minCount === undefined) {
      this.minCount = 1;
    }
    return this;
  }

  /**
   * Set minimum number of options that must be set
   * @param {number} count - Minimum count
   * @returns {OptionGroup} - Returns this for chaining
   */
  setMinCount(count) {
    this.minCount = count;
    if (count > 0) {
      this.required = true;
    }
    return this;
  }

  /**
   * Set maximum number of options that can be set
   * @param {number} count - Maximum count
   * @returns {OptionGroup} - Returns this for chaining
   */
  setMaxCount(count) {
    this.maxCount = count;
    if (count === 1) {
      this.exclusive = true;
    }
    return this;
  }

  /**
   * Set both min and max count
   * @param {number} min - Minimum count
   * @param {number} max - Maximum count
   * @returns {OptionGroup} - Returns this for chaining
   */
  setCountRange(min, max) {
    this.setMinCount(min);
    this.setMaxCount(max);
    return this;
  }

  /**
   * Set custom validation function
   * @param {Function} validator - Custom validation function
   * @returns {OptionGroup} - Returns this for chaining
   */
  setCustomValidator(validator) {
    if (typeof validator !== 'function') {
      throw new Error('Custom validator must be a function');
    }
    this.customValidator = validator;
    return this;
  }

  /**
   * Remove an option from the group
   * @param {Option} option - The option to remove
   * @returns {OptionGroup} - Returns this for chaining
   */
  removeOption(option) {
    const index = this.options.indexOf(option);
    if (index !== -1) {
      this.options.splice(index, 1);
    }
    return this;
  }

  /**
   * Check if the group contains an option
   * @param {Option} option - The option to check
   * @returns {boolean} - True if the group contains the option
   */
  hasOption(option) {
    return this.options.includes(option);
  }

  /**
   * Get all option names in the group
   * @returns {string[]} - Array of option names
   */
  getOptionNames() {
    return this.options.map(option => option.attributeName());
  }

  /**
   * Validate the group with given option values
   * @param {Object} optionValues - Object with option values
   * @throws {Error} - If validation fails
   */
  validate(optionValues) {
    const setOptions = this.options.filter(option => {
      const key = option.attributeName();
      return optionValues[key] !== undefined;
    });

    // Check exclusive constraint
    if (this.exclusive && setOptions.length > 1) {
      const optionNames = setOptions.map(opt => opt.flags);
      throw new Error(`Options in group '${this.name}' are mutually exclusive, but multiple were set: ${optionNames.join(', ')}`);
    }

    // Check required constraint
    if (this.required && setOptions.length === 0) {
      throw new Error(`At least one option from group '${this.name}' is required`);
    }

    // Check minimum count constraint
    if (this.minCount !== undefined && setOptions.length < this.minCount) {
      throw new Error(`Group '${this.name}' requires at least ${this.minCount} option(s), but only ${setOptions.length} were set`);
    }

    // Check maximum count constraint
    if (this.maxCount !== undefined && setOptions.length > this.maxCount) {
      throw new Error(`Group '${this.name}' allows at most ${this.maxCount} option(s), but ${setOptions.length} were set`);
    }

    // Apply custom validation
    if (this.customValidator) {
      const result = this.customValidator(setOptions, optionValues);
      if (result === false) {
        throw new Error(`Custom validation failed for group '${this.name}'`);
      } else if (typeof result === 'object' && result.valid === false) {
        throw new Error(result.message || `Custom validation failed for group '${this.name}'`);
      }
    }
  }
}

/**
 * Built-in option parsers
 */
const OptionParsers = {
  /**
   * Parse integer values
   * @param {string} value - The value to parse
   * @returns {number} - The parsed integer
   */
  int: (value) => {
    // Handle different input types
    if (typeof value === 'number') {
      return Math.floor(value);
    }
    if (value === null || value === undefined) {
      throw new Error(`Invalid integer: ${value}`);
    }
    if (typeof value !== 'string') {
      value = String(value);
    }
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`Invalid integer: ${value}`);
    }
    return parsed;
  },

  /**
   * Parse float values
   * @param {string} value - The value to parse
   * @returns {number} - The parsed float
   */
  float: (value) => {
    // Handle different input types
    if (typeof value === 'number') {
      return value;
    }
    if (value === null || value === undefined) {
      throw new Error(`Invalid float: ${value}`);
    }
    if (typeof value !== 'string') {
      value = String(value);
    }
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      throw new Error(`Invalid float: ${value}`);
    }
    return parsed;
  },

  /**
   * Parse boolean values
   * @param {string} value - The value to parse
   * @returns {boolean} - The parsed boolean
   */
  boolean: (value) => {
    // Handle different input types
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value !== 'string') {
      value = String(value);
    }
    const lower = value.toLowerCase();
    if (['true', 't', 'yes', 'y', '1', 'on', 'enable', 'enabled'].includes(lower)) {
      return true;
    }
    if (['false', 'f', 'no', 'n', '0', 'off', 'disable', 'disabled'].includes(lower)) {
      return false;
    }
    throw new Error(`Invalid boolean value: ${value}`);
  },

  /**
   * Parse comma-separated list
   * @param {string} value - The value to parse
   * @returns {string[]} - The parsed array
   */
  list: (value) => {
    // Handle different input types
    if (Array.isArray(value)) {
      return value;
    }
    if (value === null || value === undefined) {
      return [];
    }
    if (typeof value !== 'string') {
      value = String(value);
    }
    if (value === '') {
      return [];
    }
    return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
  },

  /**
   * Parse JSON values
   * @param {string} value - The value to parse
   * @returns {*} - The parsed JSON value
   */
  json: (value) => {
    // Handle different input types
    if (typeof value === 'object' && value !== null) {
      return value; // Already parsed
    }
    if (value === null || value === undefined) {
      throw new Error(`Invalid JSON: "${value}" is not valid JSON`);
    }
    if (typeof value !== 'string') {
      throw new Error(`Invalid JSON: "${value}" is not valid JSON`);
    }
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
  }
};

module.exports = {
  OptionProcessor,
  OptionGroup,
  OptionParsers
};