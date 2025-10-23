class CommanderError extends Error {
  constructor(exitCode, code, message) {
    super(message);
    this.name = 'CommanderError';
    this.code = code;
    this.exitCode = exitCode;
    this.nestedError = undefined;
    
    // Handle different parameter patterns for compatibility
    if (typeof exitCode === 'string') {
      // CommanderError(message)
      this.message = exitCode;
      this.exitCode = 1;
      this.code = 'commander.error';
    } else if (typeof code === 'string' && typeof message === 'string') {
      // CommanderError(exitCode, code, message)
      this.exitCode = exitCode;
      this.code = code;
      this.message = message;
    }
  }
}

class InvalidArgumentError extends CommanderError {
  constructor(message) {
    super(1, 'commander.invalidArgument', message);
    this.name = 'InvalidArgumentError';
  }
}

class InvalidOptionArgumentError extends CommanderError {
  constructor(message, option) {
    super(1, 'commander.invalidOptionArgument', message);
    this.name = 'InvalidOptionArgumentError';
    this.option = option;
  }
}

module.exports = {
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
};