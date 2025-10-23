const { Command } = require('./command');
const { Option } = require('./option');
const { Argument } = require('./argument');
const { CommanderError, InvalidArgumentError } = require('./errors');
const { Help } = require('./help');

// Create the main program instance
const program = new Command();

// For compatibility with Commander.js
const createCommand = (name) => new Command(name);
const createOption = (flags, description) => new Option(flags, description);
const createArgument = (name, description) => new Argument(name, description);

// Export the main API
module.exports = {
  Command,
  Option,
  Argument,
  CommanderError,
  InvalidArgumentError,
  Help,
  program,
  createCommand,
  createOption,
  createArgument,
};

// Also export as named exports for ES modules
module.exports.Command = Command;
module.exports.Option = Option;
module.exports.Argument = Argument;
module.exports.CommanderError = CommanderError;
module.exports.InvalidArgumentError = InvalidArgumentError;
module.exports.Help = Help;
module.exports.program = program;
module.exports.createCommand = createCommand;
module.exports.createOption = createOption;
module.exports.createArgument = createArgument;