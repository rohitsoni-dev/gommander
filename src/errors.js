class CommanderError extends Error {
  constructor(exitCode, code, message) {
    // Handle different parameter patterns for compatibility
    if (typeof exitCode === 'string' && code === undefined && message === undefined) {
      // CommanderError(message)
      super(exitCode);
      this.exitCode = 1;
      this.code = 'commander.error';
    } else if (typeof exitCode === 'number' && typeof code === 'string' && typeof message === 'string') {
      // CommanderError(exitCode, code, message)
      super(message);
      this.exitCode = exitCode;
      this.code = code;
    } else {
      // Default case
      super(message || 'Commander error');
      this.exitCode = exitCode || 1;
      this.code = code || 'commander.error';
    }
    
    this.name = 'CommanderError';
    this.nestedError = undefined;
    
    // Maintain stack trace (Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CommanderError);
    }
  }
}

class InvalidArgumentError extends CommanderError {
  constructor(message) {
    super(1, 'commander.invalidArgument', message);
    this.name = 'InvalidArgumentError';
    
    // Maintain stack trace (Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidArgumentError);
    }
  }
}

class InvalidOptionArgumentError extends CommanderError {
  constructor(message, option) {
    super(1, 'commander.invalidOptionArgument', message);
    this.name = 'InvalidOptionArgumentError';
    this.option = option;
    
    // Maintain stack trace (Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidOptionArgumentError);
    }
  }
}

module.exports = {
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
};