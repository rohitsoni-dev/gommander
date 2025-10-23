package cmd

import (
	"fmt"
	"slices"
	"strings"
)

// ActionHandler represents a function that handles command execution
type ActionHandler func(args []string, opts map[string]any) error

// HookHandler represents a function that handles command lifecycle hooks
type HookHandler func(thisCommand *Command, actionCommand *Command) error

// Command represents a CLI command with options, arguments, and subcommands
type Command struct {
	Name        string
	Description string
	Options     []*Option
	Arguments   []*Argument
	Subcommands []*Command
	Action      ActionHandler
	Parent      *Command
	Aliases     []string
	Hidden      bool
	Version     string

	// Commander.js compatibility fields
	Usage           string
	Summary         string
	HelpInformation string

	// Lifecycle hooks
	PreAction     HookHandler
	PostAction    HookHandler
	PreSubcommand HookHandler

	// Configuration options
	AllowUnknownOption          bool
	AllowExcessArguments        bool
	EnablePositionalOptions     bool
	PassThroughOptions          bool
	StoreOptionsAsProperties    bool
	CombineFlagAndOptionalValue bool

	// Help configuration
	HelpOption               *Option
	HelpCommand              *Command
	ShowHelpAfterError       bool
	ShowSuggestionAfterError bool

	// Output configuration
	OutputConfiguration *OutputConfiguration

	// Exit handling
	ExitOverride func(err error)
}

// OutputConfiguration represents output stream configuration
type OutputConfiguration struct {
	WriteOut        func(str string)
	WriteErr        func(str string)
	GetOutHelpWidth func() int
	GetErrHelpWidth func() int
}

// NewCommand creates a new command with the given name
func NewCommand(name string) *Command {
	cmd := &Command{
		Name:        name,
		Options:     make([]*Option, 0),
		Arguments:   make([]*Argument, 0),
		Subcommands: make([]*Command, 0),
		Aliases:     make([]string, 0),

		// Default configuration
		AllowUnknownOption:          false,
		AllowExcessArguments:        true,
		EnablePositionalOptions:     false,
		PassThroughOptions:          false,
		StoreOptionsAsProperties:    false,
		CombineFlagAndOptionalValue: true,
		ShowHelpAfterError:          false,
		ShowSuggestionAfterError:    true,
	}

	// Add default help option
	cmd.HelpOption = NewOption("-h, --help", "display help for command")
	cmd.AddOption(cmd.HelpOption)

	return cmd
}

// Validate validates the command structure and configuration
func (c *Command) Validate() error {
	if c.Name == "" {
		return fmt.Errorf("command name cannot be empty")
	}

	// Validate options
	optionFlags := make(map[string]bool)
	for _, option := range c.Options {
		if err := option.Validate(); err != nil {
			return fmt.Errorf("invalid option in command '%s': %v", c.Name, err)
		}

		// Check for duplicate flags
		if option.Short != "" {
			if optionFlags[option.Short] {
				return fmt.Errorf("duplicate short flag '-%s' in command '%s'", option.Short, c.Name)
			}
			optionFlags[option.Short] = true
		}
		if option.Long != "" {
			if optionFlags[option.Long] {
				return fmt.Errorf("duplicate long flag '--%s' in command '%s'", option.Long, c.Name)
			}
			optionFlags[option.Long] = true
		}
	}

	// Validate arguments
	variadicFound := false
	for i, arg := range c.Arguments {
		if err := arg.ValidateStructure(); err != nil {
			return fmt.Errorf("invalid argument in command '%s': %v", c.Name, err)
		}

		// Variadic argument must be last
		if variadicFound {
			return fmt.Errorf("variadic argument must be the last argument in command '%s'", c.Name)
		}
		if arg.Variadic {
			variadicFound = true
		}

		// Required arguments cannot come after optional ones
		if !arg.Required && i < len(c.Arguments)-1 {
			for j := i + 1; j < len(c.Arguments); j++ {
				if c.Arguments[j].Required {
					return fmt.Errorf("required argument '%s' cannot come after optional argument '%s' in command '%s'",
						c.Arguments[j].Name, arg.Name, c.Name)
				}
			}
		}
	}

	// Validate subcommands
	subcommandNames := make(map[string]bool)
	for _, sub := range c.Subcommands {
		if err := sub.Validate(); err != nil {
			return err
		}

		// Check for duplicate names and aliases
		if subcommandNames[sub.Name] {
			return fmt.Errorf("duplicate subcommand name '%s' in command '%s'", sub.Name, c.Name)
		}
		subcommandNames[sub.Name] = true

		for _, alias := range sub.Aliases {
			if subcommandNames[alias] {
				return fmt.Errorf("duplicate subcommand alias '%s' in command '%s'", alias, c.Name)
			}
			subcommandNames[alias] = true
		}
	}

	return nil
}

// AddOption adds an option to the command
func (c *Command) AddOption(option *Option) *Command {
	c.Options = append(c.Options, option)
	return c
}

// AddArgument adds an argument to the command
func (c *Command) AddArgument(argument *Argument) *Command {
	c.Arguments = append(c.Arguments, argument)
	return c
}

// AddSubcommand adds a subcommand to the command
func (c *Command) AddSubcommand(subcommand *Command) *Command {
	subcommand.Parent = c
	c.Subcommands = append(c.Subcommands, subcommand)
	return c
}

// SetAction sets the action handler for the command
func (c *Command) SetAction(action ActionHandler) *Command {
	c.Action = action
	return c
}

// GetFullName returns the full command name including parent commands
func (c *Command) GetFullName() string {
	if c.Parent == nil {
		return c.Name
	}
	return c.Parent.GetFullName() + " " + c.Name
}

// FindSubcommand finds a subcommand by name or alias
func (c *Command) FindSubcommand(name string) *Command {
	for _, sub := range c.Subcommands {
		if sub.Name == name {
			return sub
		}
		if slices.Contains(sub.Aliases, name) {
			return sub
		}
	}
	return nil
}

// FindOption finds an option by flag (short or long)
func (c *Command) FindOption(flag string) *Option {
	for _, option := range c.Options {
		if option.Matches(flag) {
			return option
		}
	}
	return nil
}

// GetRequiredOptions returns all required options
func (c *Command) GetRequiredOptions() []*Option {
	var required []*Option
	for _, option := range c.Options {
		if option.Required {
			required = append(required, option)
		}
	}
	return required
}

// GetRequiredArguments returns all required arguments
func (c *Command) GetRequiredArguments() []*Argument {
	var required []*Argument
	for _, arg := range c.Arguments {
		if arg.Required {
			required = append(required, arg)
		}
	}
	return required
}

// IsExecutable returns true if the command has an action handler
func (c *Command) IsExecutable() bool {
	return c.Action != nil
}

// GetCommandPath returns the full path to this command
func (c *Command) GetCommandPath() []*Command {
	if c.Parent == nil {
		return []*Command{c}
	}
	path := c.Parent.GetCommandPath()
	return append(path, c)
}

// String returns a string representation of the command
func (c *Command) String() string {
	var parts []string
	if c.Name != "" {
		parts = append(parts, c.Name)
	}
	if c.Description != "" {
		parts = append(parts, fmt.Sprintf("(%s)", c.Description))
	}
	return strings.Join(parts, " ")
}
