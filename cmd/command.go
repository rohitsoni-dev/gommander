package cmd

import (
	"fmt"
	"strings"
)

// ActionHandler represents a function that handles command execution
type ActionHandler func(args []string, opts map[string]interface{}) error

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
}

// NewCommand creates a new command with the given name
func NewCommand(name string) *Command {
	return &Command{
		Name:        name,
		Options:     make([]*Option, 0),
		Arguments:   make([]*Argument, 0),
		Subcommands: make([]*Command, 0),
		Aliases:     make([]string, 0),
	}
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
		for _, alias := range sub.Aliases {
			if alias == name {
				return sub
			}
		}
	}
	return nil
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