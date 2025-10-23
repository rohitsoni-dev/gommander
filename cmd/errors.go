package cmd

import "fmt"

// ValidationError represents an error that occurs during command validation
type ValidationError struct {
	Command string
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	if e.Command != "" && e.Field != "" {
		return fmt.Sprintf("validation error in command '%s', field '%s': %s", e.Command, e.Field, e.Message)
	} else if e.Command != "" {
		return fmt.Sprintf("validation error in command '%s': %s", e.Command, e.Message)
	}
	return fmt.Sprintf("validation error: %s", e.Message)
}

// ParseError represents an error that occurs during argument parsing
type ParseError struct {
	Command  string
	Argument string
	Option   string
	Value    string
	Message  string
	Position int
}

func (e *ParseError) Error() string {
	if e.Option != "" {
		return fmt.Sprintf("parse error for option '%s' in command '%s': %s", e.Option, e.Command, e.Message)
	} else if e.Argument != "" {
		return fmt.Sprintf("parse error for argument '%s' in command '%s': %s", e.Argument, e.Command, e.Message)
	}
	return fmt.Sprintf("parse error in command '%s': %s", e.Command, e.Message)
}

// CommanderError represents a general Commander error (compatible with Commander.js)
type CommanderError struct {
	Code     string
	Message  string
	ExitCode int
	Command  string
}

func (e *CommanderError) Error() string {
	return e.Message
}

// InvalidArgumentError represents an invalid argument error (compatible with Commander.js)
type InvalidArgumentError struct {
	*CommanderError
	Argument string
	Value    string
}

func NewInvalidArgumentError(message, argument, value string) *InvalidArgumentError {
	return &InvalidArgumentError{
		CommanderError: &CommanderError{
			Code:     "commander.invalidArgument",
			Message:  message,
			ExitCode: 1,
		},
		Argument: argument,
		Value:    value,
	}
}

// InvalidOptionArgumentError represents an invalid option argument error
type InvalidOptionArgumentError struct {
	*CommanderError
	Option string
	Value  string
}

func NewInvalidOptionArgumentError(message, option, value string) *InvalidOptionArgumentError {
	return &InvalidOptionArgumentError{
		CommanderError: &CommanderError{
			Code:     "commander.invalidOptionArgument",
			Message:  message,
			ExitCode: 1,
		},
		Option: option,
		Value:  value,
	}
}

// MissingArgumentError represents a missing required argument error
type MissingArgumentError struct {
	*CommanderError
	Argument string
}

func NewMissingArgumentError(argument string) *MissingArgumentError {
	return &MissingArgumentError{
		CommanderError: &CommanderError{
			Code:     "commander.missingArgument",
			Message:  fmt.Sprintf("missing required argument '%s'", argument),
			ExitCode: 1,
		},
		Argument: argument,
	}
}

// MissingOptionError represents a missing required option error
type MissingOptionError struct {
	*CommanderError
	Option string
}

func NewMissingOptionError(option string) *MissingOptionError {
	return &MissingOptionError{
		CommanderError: &CommanderError{
			Code:     "commander.missingOption",
			Message:  fmt.Sprintf("missing required option '%s'", option),
			ExitCode: 1,
		},
		Option: option,
	}
}

// UnknownOptionError represents an unknown option error
type UnknownOptionError struct {
	*CommanderError
	Option string
}

func NewUnknownOptionError(option string) *UnknownOptionError {
	return &UnknownOptionError{
		CommanderError: &CommanderError{
			Code:     "commander.unknownOption",
			Message:  fmt.Sprintf("unknown option '%s'", option),
			ExitCode: 1,
		},
		Option: option,
	}
}

// ConflictingOptionError represents a conflicting option error
type ConflictingOptionError struct {
	*CommanderError
	Option1 string
	Option2 string
}

func NewConflictingOptionError(option1, option2 string) *ConflictingOptionError {
	return &ConflictingOptionError{
		CommanderError: &CommanderError{
			Code:     "commander.conflictingOption",
			Message:  fmt.Sprintf("conflicting options '%s' and '%s'", option1, option2),
			ExitCode: 1,
		},
		Option1: option1,
		Option2: option2,
	}
}

// ExcessArgumentsError represents an error when too many arguments are provided
type ExcessArgumentsError struct {
	*CommanderError
	Expected int
	Received int
}

func NewExcessArgumentsError(expected, received int) *ExcessArgumentsError {
	return &ExcessArgumentsError{
		CommanderError: &CommanderError{
			Code:     "commander.excessArguments",
			Message:  fmt.Sprintf("too many arguments: expected %d, received %d", expected, received),
			ExitCode: 1,
		},
		Expected: expected,
		Received: received,
	}
}

// HelpDisplayedError represents when help is displayed (not really an error)
type HelpDisplayedError struct {
	*CommanderError
}

func NewHelpDisplayedError() *HelpDisplayedError {
	return &HelpDisplayedError{
		CommanderError: &CommanderError{
			Code:     "commander.helpDisplayed",
			Message:  "help displayed",
			ExitCode: 0,
		},
	}
}

// VersionDisplayedError represents when version is displayed (not really an error)
type VersionDisplayedError struct {
	*CommanderError
}

func NewVersionDisplayedError() *VersionDisplayedError {
	return &VersionDisplayedError{
		CommanderError: &CommanderError{
			Code:     "commander.versionDisplayed",
			Message:  "version displayed",
			ExitCode: 0,
		},
	}
}
