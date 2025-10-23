package cmd

import (
	"fmt"
	"os"
	"slices"
	"strings"
)

// ActionHandler represents a function that handles command execution
type ActionHandler func(args []string, opts map[string]any) error

// HookHandler represents a function that handles command lifecycle hooks
type HookHandler func(thisCommand *Command, actionCommand *Command) error

// AsyncActionHandler represents an async action handler
type AsyncActionHandler func(args []string, opts map[string]any) <-chan error

// HookEvent represents different types of lifecycle events
type HookEvent string

const (
	HookEventPreAction     HookEvent = "preAction"
	HookEventPostAction    HookEvent = "postAction"
	HookEventPreSubcommand HookEvent = "preSubcommand"
)

// LifecycleHooks manages all lifecycle hooks for a command
type LifecycleHooks struct {
	PreAction     []HookHandler
	PostAction    []HookHandler
	PreSubcommand []HookHandler
}

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

	// Enhanced lifecycle management
	Hooks       *LifecycleHooks
	AsyncAction AsyncActionHandler

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
	ErrorConfiguration  *ErrorConfiguration

	// Exit handling
	ExitOverride func(err error)

	// Enhanced subcommand support
	ExecutableHandler bool
	ExecutableFile    string
	ExecutableDir     string
	DefaultCommand    *Command
	IsDefault         bool

	// Advanced parsing configuration
	PassThroughArgs []string
	UnknownOptions  []string
}

// OutputConfiguration represents output stream configuration
type OutputConfiguration struct {
	WriteOut        func(str string)
	WriteErr        func(str string)
	OutputError     func(str string, write func(string))
	GetOutHelpWidth func() int
	GetErrHelpWidth func() int
	GetOutHasColors func() bool
	GetErrHasColors func() bool
	StripColor      func(str string) string
}

// ErrorConfiguration represents error handling configuration
type ErrorConfiguration struct {
	ShowHelpAfterError       bool
	ShowSuggestionAfterError bool
	ExitOverride             func(err error)
	SuggestionGenerator      func(unknownCommand string, availableCommands []string) string
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

		// Initialize lifecycle hooks
		Hooks: &LifecycleHooks{
			PreAction:     make([]HookHandler, 0),
			PostAction:    make([]HookHandler, 0),
			PreSubcommand: make([]HookHandler, 0),
		},
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

// SetExecutable configures the command as an executable subcommand
func (c *Command) SetExecutable(executableFile string) *Command {
	c.ExecutableHandler = true
	c.ExecutableFile = executableFile
	return c
}

// SetExecutableDir sets the directory for executable subcommands
func (c *Command) SetExecutableDir(dir string) *Command {
	c.ExecutableDir = dir
	return c
}

// SetAsDefault marks this command as the default subcommand
func (c *Command) SetAsDefault() *Command {
	c.IsDefault = true
	if c.Parent != nil {
		c.Parent.DefaultCommand = c
	}
	return c
}

// AddAlias adds an alias to the command
func (c *Command) AddAlias(alias string) *Command {
	if !slices.Contains(c.Aliases, alias) {
		c.Aliases = append(c.Aliases, alias)
	}
	return c
}

// SetAliases sets multiple aliases for the command
func (c *Command) SetAliases(aliases []string) *Command {
	c.Aliases = make([]string, len(aliases))
	copy(c.Aliases, aliases)
	return c
}

// FindSubcommandByNameOrAlias finds a subcommand by name or any of its aliases
func (c *Command) FindSubcommandByNameOrAlias(nameOrAlias string) *Command {
	for _, sub := range c.Subcommands {
		if sub.Name == nameOrAlias {
			return sub
		}
		for _, alias := range sub.Aliases {
			if alias == nameOrAlias {
				return sub
			}
		}
	}
	return nil
}

// GetDefaultSubcommand returns the default subcommand if one is set
func (c *Command) GetDefaultSubcommand() *Command {
	return c.DefaultCommand
}

// HasSubcommands returns true if the command has any subcommands
func (c *Command) HasSubcommands() bool {
	return len(c.Subcommands) > 0
}

// GetVisibleSubcommands returns all non-hidden subcommands
func (c *Command) GetVisibleSubcommands() []*Command {
	var visible []*Command
	for _, sub := range c.Subcommands {
		if !sub.Hidden {
			visible = append(visible, sub)
		}
	}
	return visible
}

// IsExecutableSubcommand returns true if this is an executable subcommand
func (c *Command) IsExecutableSubcommand() bool {
	return c.ExecutableHandler
}

// GetExecutablePath returns the full path to the executable file
func (c *Command) GetExecutablePath() string {
	if c.ExecutableFile == "" {
		return ""
	}

	if c.ExecutableDir != "" {
		return fmt.Sprintf("%s/%s", c.ExecutableDir, c.ExecutableFile)
	}

	return c.ExecutableFile
}

// CopyInheritedSettings copies settings from parent command
func (c *Command) CopyInheritedSettings(parent *Command) *Command {
	if parent == nil {
		return c
	}

	// Copy configuration settings
	c.AllowUnknownOption = parent.AllowUnknownOption
	c.AllowExcessArguments = parent.AllowExcessArguments
	c.EnablePositionalOptions = parent.EnablePositionalOptions
	c.PassThroughOptions = parent.PassThroughOptions
	c.StoreOptionsAsProperties = parent.StoreOptionsAsProperties
	c.CombineFlagAndOptionalValue = parent.CombineFlagAndOptionalValue
	c.ShowHelpAfterError = parent.ShowHelpAfterError
	c.ShowSuggestionAfterError = parent.ShowSuggestionAfterError

	// Copy output configuration
	if parent.OutputConfiguration != nil {
		c.OutputConfiguration = parent.OutputConfiguration
	}

	// Copy exit override
	c.ExitOverride = parent.ExitOverride

	// Copy executable directory
	if c.ExecutableDir == "" && parent.ExecutableDir != "" {
		c.ExecutableDir = parent.ExecutableDir
	}

	return c
}

// SetLifecycleHooks sets the lifecycle hooks for the command
func (c *Command) SetLifecycleHooks(preAction, postAction, preSubcommand HookHandler) *Command {
	c.PreAction = preAction
	c.PostAction = postAction
	c.PreSubcommand = preSubcommand
	return c
}

// AddHook adds a lifecycle hook to the command
func (c *Command) AddHook(event HookEvent, handler HookHandler) *Command {
	if c.Hooks == nil {
		c.Hooks = &LifecycleHooks{
			PreAction:     make([]HookHandler, 0),
			PostAction:    make([]HookHandler, 0),
			PreSubcommand: make([]HookHandler, 0),
		}
	}

	switch event {
	case HookEventPreAction:
		c.Hooks.PreAction = append(c.Hooks.PreAction, handler)
	case HookEventPostAction:
		c.Hooks.PostAction = append(c.Hooks.PostAction, handler)
	case HookEventPreSubcommand:
		c.Hooks.PreSubcommand = append(c.Hooks.PreSubcommand, handler)
	}

	return c
}

// RemoveHook removes all hooks of a specific type
func (c *Command) RemoveHook(event HookEvent) *Command {
	if c.Hooks == nil {
		return c
	}

	switch event {
	case HookEventPreAction:
		c.Hooks.PreAction = make([]HookHandler, 0)
	case HookEventPostAction:
		c.Hooks.PostAction = make([]HookHandler, 0)
	case HookEventPreSubcommand:
		c.Hooks.PreSubcommand = make([]HookHandler, 0)
	}

	return c
}

// SetAsyncAction sets an async action handler for the command
func (c *Command) SetAsyncAction(action AsyncActionHandler) *Command {
	c.AsyncAction = action
	return c
}

// ExecuteHooks executes all hooks of a specific type
func (c *Command) ExecuteHooks(event HookEvent, actionCommand *Command) error {
	if c.Hooks == nil {
		return nil
	}

	var hooks []HookHandler
	switch event {
	case HookEventPreAction:
		hooks = c.Hooks.PreAction
	case HookEventPostAction:
		hooks = c.Hooks.PostAction
	case HookEventPreSubcommand:
		hooks = c.Hooks.PreSubcommand
	default:
		return nil
	}

	for _, hook := range hooks {
		if err := hook(c, actionCommand); err != nil {
			return fmt.Errorf("%s hook failed: %v", event, err)
		}
	}

	// Also execute legacy single hooks for backward compatibility
	switch event {
	case HookEventPreAction:
		if c.PreAction != nil {
			return c.PreAction(c, actionCommand)
		}
	case HookEventPostAction:
		if c.PostAction != nil {
			return c.PostAction(c, actionCommand)
		}
	case HookEventPreSubcommand:
		if c.PreSubcommand != nil {
			return c.PreSubcommand(c, actionCommand)
		}
	}

	return nil
}

// ExecuteWithHooks executes the command with lifecycle hooks
func (c *Command) ExecuteWithHooks(args []string, opts map[string]any) error {
	// Execute pre-action hooks
	if err := c.ExecuteHooks(HookEventPreAction, c); err != nil {
		return err
	}

	// Execute the main action
	var actionErr error
	if c.AsyncAction != nil {
		// Handle async action
		errChan := c.AsyncAction(args, opts)
		actionErr = <-errChan
	} else if c.Action != nil {
		actionErr = c.Action(args, opts)
	}

	// Execute post-action hooks (even if action failed)
	if hookErr := c.ExecuteHooks(HookEventPostAction, c); hookErr != nil {
		// If both action and hook failed, return combined error
		if actionErr != nil {
			return fmt.Errorf("action failed: %v; post-action hook failed: %v", actionErr, hookErr)
		}
		return hookErr
	}

	return actionErr
}

// ExecuteSubcommandWithHooks executes a subcommand with pre-subcommand hook
func (c *Command) ExecuteSubcommandWithHooks(subcommand *Command, args []string, opts map[string]any) error {
	// Execute pre-subcommand hooks
	if err := c.ExecuteHooks(HookEventPreSubcommand, subcommand); err != nil {
		return err
	}

	// Execute the subcommand
	return subcommand.ExecuteWithHooks(args, opts)
}

// HasHooks returns true if the command has any lifecycle hooks
func (c *Command) HasHooks() bool {
	if c.Hooks == nil {
		return c.PreAction != nil || c.PostAction != nil || c.PreSubcommand != nil
	}

	return len(c.Hooks.PreAction) > 0 ||
		len(c.Hooks.PostAction) > 0 ||
		len(c.Hooks.PreSubcommand) > 0 ||
		c.PreAction != nil ||
		c.PostAction != nil ||
		c.PreSubcommand != nil
}

// GetHookCount returns the number of hooks for a specific event
func (c *Command) GetHookCount(event HookEvent) int {
	if c.Hooks == nil {
		return 0
	}

	switch event {
	case HookEventPreAction:
		count := len(c.Hooks.PreAction)
		if c.PreAction != nil {
			count++
		}
		return count
	case HookEventPostAction:
		count := len(c.Hooks.PostAction)
		if c.PostAction != nil {
			count++
		}
		return count
	case HookEventPreSubcommand:
		count := len(c.Hooks.PreSubcommand)
		if c.PreSubcommand != nil {
			count++
		}
		return count
	}

	return 0
}

// ConfigureOutput sets the output configuration for the command
func (c *Command) ConfigureOutput(config *OutputConfiguration) *Command {
	c.OutputConfiguration = config
	return c
}

// ConfigureError sets the error configuration for the command
func (c *Command) ConfigureError(config *ErrorConfiguration) *Command {
	c.ErrorConfiguration = config
	return c
}

// SetExitOverride sets a custom exit handler
func (c *Command) SetExitOverride(handler func(err error)) *Command {
	c.ExitOverride = handler
	if c.ErrorConfiguration != nil {
		c.ErrorConfiguration.ExitOverride = handler
	}
	return c
}

// WriteOut writes output using the configured output writer
func (c *Command) WriteOut(str string) {
	if c.OutputConfiguration != nil && c.OutputConfiguration.WriteOut != nil {
		c.OutputConfiguration.WriteOut(str)
	} else {
		// Default output to stdout
		fmt.Print(str)
	}
}

// WriteErr writes error output using the configured error writer
func (c *Command) WriteErr(str string) {
	if c.OutputConfiguration != nil && c.OutputConfiguration.WriteErr != nil {
		c.OutputConfiguration.WriteErr(str)
	} else {
		// Default error output to stderr
		fmt.Fprint(os.Stderr, str)
	}
}

// OutputError outputs an error message using the configured error output
func (c *Command) OutputError(str string) {
	if c.OutputConfiguration != nil && c.OutputConfiguration.OutputError != nil {
		c.OutputConfiguration.OutputError(str, c.OutputConfiguration.WriteErr)
	} else {
		c.WriteErr(str)
	}
}

// GenerateSuggestion generates a suggestion for an unknown command
func (c *Command) GenerateSuggestion(unknownCommand string) string {
	if c.ErrorConfiguration != nil && c.ErrorConfiguration.SuggestionGenerator != nil {
		availableCommands := make([]string, len(c.Subcommands))
		for i, sub := range c.Subcommands {
			availableCommands[i] = sub.Name
		}
		return c.ErrorConfiguration.SuggestionGenerator(unknownCommand, availableCommands)
	}

	// Default suggestion logic
	return c.generateDefaultSuggestion(unknownCommand)
}

// generateDefaultSuggestion provides basic suggestion logic
func (c *Command) generateDefaultSuggestion(unknownCommand string) string {
	if len(c.Subcommands) == 0 {
		return ""
	}

	// Simple similarity check - find commands that start with the same letter
	for _, sub := range c.Subcommands {
		if len(sub.Name) > 0 && len(unknownCommand) > 0 &&
			strings.ToLower(sub.Name[:1]) == strings.ToLower(unknownCommand[:1]) {
			return fmt.Sprintf("Did you mean '%s'?", sub.Name)
		}
	}

	// If no similar command found, suggest available commands
	if len(c.Subcommands) <= 3 {
		names := make([]string, len(c.Subcommands))
		for i, sub := range c.Subcommands {
			names[i] = sub.Name
		}
		return fmt.Sprintf("Available commands: %s", strings.Join(names, ", "))
	}

	return "Use --help to see available commands"
}

// HandleError handles errors with configured error handling
func (c *Command) HandleError(err error) {
	if c.ExitOverride != nil {
		c.ExitOverride(err)
		return
	}

	// Default error handling
	c.OutputError(fmt.Sprintf("Error: %s\n", err.Error()))

	if c.ShowHelpAfterError {
		c.WriteErr("\n")
		// Generate and show help
		c.WriteErr(c.GenerateHelp())
	}

	// Exit with error code
	os.Exit(1)
}

// GenerateHelp generates help text for the command
func (c *Command) GenerateHelp() string {
	help := fmt.Sprintf("Usage: %s", c.GetFullName())

	// Add options placeholder
	if len(c.Options) > 0 {
		help += " [options]"
	}

	// Add arguments
	for _, arg := range c.Arguments {
		if arg.Required {
			if arg.Variadic {
				help += fmt.Sprintf(" <%s...>", arg.Name)
			} else {
				help += fmt.Sprintf(" <%s>", arg.Name)
			}
		} else {
			if arg.Variadic {
				help += fmt.Sprintf(" [%s...]", arg.Name)
			} else {
				help += fmt.Sprintf(" [%s]", arg.Name)
			}
		}
	}

	// Add subcommands placeholder
	if len(c.Subcommands) > 0 {
		help += " [command]"
	}

	help += "\n"

	if c.Description != "" {
		help += fmt.Sprintf("\n%s\n", c.Description)
	}

	// Add options help
	if len(c.Options) > 0 {
		help += "\nOptions:\n"
		for _, opt := range c.Options {
			if !opt.Hidden {
				help += fmt.Sprintf("  %s  %s\n", opt.Flags, opt.Description)
			}
		}
	}

	// Add arguments help
	if len(c.Arguments) > 0 {
		help += "\nArguments:\n"
		for _, arg := range c.Arguments {
			help += fmt.Sprintf("  %s  %s\n", arg.Name, arg.Description)
		}
	}

	// Add subcommands help
	if len(c.Subcommands) > 0 {
		help += "\nCommands:\n"
		for _, sub := range c.Subcommands {
			if !sub.Hidden {
				help += fmt.Sprintf("  %s  %s\n", sub.Name, sub.Description)
			}
		}
	}

	return help
}
