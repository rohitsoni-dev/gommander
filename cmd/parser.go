package cmd

import (
	"fmt"
	"strings"
)

// ParsedCommand represents the result of parsing command-line arguments
type ParsedCommand struct {
	Command   *Command
	Options   map[string]interface{}
	Arguments []interface{}
	Unknown   []string
}

// Parser handles command-line argument parsing
type Parser struct {
	AllowUnknownOptions bool
	StopAtFirstUnknown  bool
}

// NewParser creates a new parser with default settings
func NewParser() *Parser {
	return &Parser{
		AllowUnknownOptions: false,
		StopAtFirstUnknown:  false,
	}
}

// ParseCommand parses command-line arguments against a command structure
func (p *Parser) ParseCommand(cmd *Command, args []string) (*ParsedCommand, error) {
	result := &ParsedCommand{
		Command:   cmd,
		Options:   make(map[string]interface{}),
		Arguments: make([]interface{}, 0),
		Unknown:   make([]string, 0),
	}

	// Initialize options with default values
	for _, option := range cmd.Options {
		if option.Default != nil {
			key := option.Long
			if key == "" {
				key = option.Short
			}
			result.Options[key] = option.Default
		}
	}

	i := 0
	argIndex := 0

	for i < len(args) {
		arg := args[i]

		// Check for subcommand
		if !strings.HasPrefix(arg, "-") {
			if subCmd := cmd.FindSubcommand(arg); subCmd != nil {
				// Parse remaining args with subcommand
				return p.ParseCommand(subCmd, args[i+1:])
			}
		}

		// Handle options
		if strings.HasPrefix(arg, "-") {
			consumed, err := p.parseOption(cmd, args, i, result)
			if err != nil {
				if p.AllowUnknownOptions {
					result.Unknown = append(result.Unknown, arg)
					i++
					continue
				}
				return nil, err
			}
			i += consumed
			continue
		}

		// Handle arguments
		if argIndex < len(cmd.Arguments) {
			cmdArg := cmd.Arguments[argIndex]
			value, err := cmdArg.ParseValue(arg)
			if err != nil {
				return nil, fmt.Errorf("invalid argument '%s': %v", arg, err)
			}

			if cmdArg.Variadic {
				// Collect all remaining non-option arguments
				for i < len(args) && !strings.HasPrefix(args[i], "-") {
					val, err := cmdArg.ParseValue(args[i])
					if err != nil {
						return nil, fmt.Errorf("invalid argument '%s': %v", args[i], err)
					}
					result.Arguments = append(result.Arguments, val)
					i++
				}
				argIndex++
				continue
			} else {
				result.Arguments = append(result.Arguments, value)
				argIndex++
			}
		} else {
			// Extra arguments
			if p.StopAtFirstUnknown {
				break
			}
			result.Unknown = append(result.Unknown, arg)
		}
		i++
	}

	// Validate required arguments
	for i, cmdArg := range cmd.Arguments {
		if cmdArg.Required && i >= len(result.Arguments) {
			return nil, fmt.Errorf("missing required argument: %s", cmdArg.Name)
		}
	}

	// Validate required options
	for _, option := range cmd.Options {
		if option.Required {
			key := option.Long
			if key == "" {
				key = option.Short
			}
			if _, exists := result.Options[key]; !exists {
				return nil, fmt.Errorf("missing required option: %s", option.Flags)
			}
		}
	}

	return result, nil
}

// parseOption parses a single option and its value(s)
func (p *Parser) parseOption(cmd *Command, args []string, index int, result *ParsedCommand) (int, error) {
	arg := args[index]

	// Remove leading dashes
	flag := strings.TrimLeft(arg, "-")

	// Find matching option
	var option *Option
	for _, opt := range cmd.Options {
		if opt.Matches(flag) {
			option = opt
			break
		}
	}

	if option == nil {
		return 0, fmt.Errorf("unknown option: %s", arg)
	}

	key := option.Long
	if key == "" {
		key = option.Short
	}

	// Handle boolean options (no value expected)
	if option.Default != nil {
		if _, isBool := option.Default.(bool); isBool {
			result.Options[key] = true
			return 1, nil
		}
	}

	// Handle options that expect values
	if index+1 >= len(args) {
		return 0, fmt.Errorf("option %s requires a value", arg)
	}

	nextArg := args[index+1]
	if strings.HasPrefix(nextArg, "-") {
		return 0, fmt.Errorf("option %s requires a value", arg)
	}

	if option.Variadic {
		// Collect multiple values
		values := make([]interface{}, 0)
		consumed := 1

		for index+consumed < len(args) && !strings.HasPrefix(args[index+consumed], "-") {
			value, err := option.ParseValue(args[index+consumed])
			if err != nil {
				return 0, fmt.Errorf("invalid value for option %s: %v", arg, err)
			}
			values = append(values, value)
			consumed++
		}

		result.Options[key] = values
		return consumed, nil
	} else {
		// Single value
		value, err := option.ParseValue(nextArg)
		if err != nil {
			return 0, fmt.Errorf("invalid value for option %s: %v", arg, err)
		}

		result.Options[key] = value
		return 2, nil
	}
}
