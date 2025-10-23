package cmd

import (
	"fmt"
	"strings"
)

// ParsedCommand represents the result of parsing command-line arguments
type ParsedCommand struct {
	Command   *Command
	Options   map[string]any
	Arguments []any
	Unknown   []string
}

// Parser handles command-line argument parsing
type Parser struct {
	AllowUnknownOptions bool
	StopAtFirstUnknown  bool

	// Advanced parsing options
	EnablePositionalOptions     bool
	PassThroughOptions          bool
	CombineFlagAndOptionalValue bool

	// Enhanced parsing configuration
	UnknownOptionHandler  func(option string, value string) error
	ExcessArgumentHandler func(args []string) error
	PositionalOptionMap   map[int]string // Maps position to option name
}

// NewParser creates a new parser with default settings
func NewParser() *Parser {
	return &Parser{
		AllowUnknownOptions:         false,
		StopAtFirstUnknown:          false,
		EnablePositionalOptions:     false,
		PassThroughOptions:          false,
		CombineFlagAndOptionalValue: true,
		PositionalOptionMap:         make(map[int]string),
	}
}

// SetPositionalOption maps a position to an option name for positional option parsing
func (p *Parser) SetPositionalOption(position int, optionName string) {
	if p.PositionalOptionMap == nil {
		p.PositionalOptionMap = make(map[int]string)
	}
	p.PositionalOptionMap[position] = optionName
}

// SetUnknownOptionHandler sets a custom handler for unknown options
func (p *Parser) SetUnknownOptionHandler(handler func(option string, value string) error) {
	p.UnknownOptionHandler = handler
}

// SetExcessArgumentHandler sets a custom handler for excess arguments
func (p *Parser) SetExcessArgumentHandler(handler func(args []string) error) {
	p.ExcessArgumentHandler = handler
}

// Token represents a parsed command-line token
type Token struct {
	Type  TokenType
	Value string
	Raw   string
}

// TokenType represents the type of a command-line token
type TokenType int

const (
	TokenArgument TokenType = iota
	TokenShortOption
	TokenLongOption
	TokenOptionValue
	TokenDoubleDash
	TokenUnknown
)

// Tokenize breaks down command-line arguments into tokens with enhanced parsing
func (p *Parser) Tokenize(args []string, cmd *Command) []Token {
	var tokens []Token

	for i, arg := range args {
		if arg == "--" {
			// Double dash - everything after is arguments
			tokens = append(tokens, Token{Type: TokenDoubleDash, Value: arg, Raw: arg})
			// Add remaining args as arguments
			for j := i + 1; j < len(args); j++ {
				tokens = append(tokens, Token{Type: TokenArgument, Value: args[j], Raw: args[j]})
			}
			break
		} else if strings.HasPrefix(arg, "--") {
			// Long option
			if idx := strings.Index(arg, "="); idx != -1 && p.CombineFlagAndOptionalValue {
				// --flag=value format
				flag := arg[2:idx]
				value := arg[idx+1:]
				tokens = append(tokens, Token{Type: TokenLongOption, Value: flag, Raw: arg})
				tokens = append(tokens, Token{Type: TokenOptionValue, Value: value, Raw: value})
			} else {
				// --flag format
				tokens = append(tokens, Token{Type: TokenLongOption, Value: arg[2:], Raw: arg})
			}
		} else if strings.HasPrefix(arg, "-") && len(arg) > 1 {
			// Short option(s)
			if len(arg) == 2 {
				// Single short option: -f
				tokens = append(tokens, Token{Type: TokenShortOption, Value: arg[1:], Raw: arg})
			} else {
				// Multiple short options or short option with value: -abc or -fvalue
				flags := arg[1:]

				// Check if this can be parsed as multiple flags
				if p.canParseAsMultipleFlags(flags, cmd) {
					// Parse as multiple boolean flags: -abc -> -a -b -c
					for _, flag := range flags {
						tokens = append(tokens, Token{Type: TokenShortOption, Value: string(flag), Raw: "-" + string(flag)})
					}
				} else {
					// Check if first character is a valid option that takes a value
					firstFlag := string(flags[0])
					option := cmd.FindOption(firstFlag)
					if option != nil && option.Type != OptionTypeBoolean {
						// Parse as flag with value: -fvalue -> -f value
						value := flags[1:]
						tokens = append(tokens, Token{Type: TokenShortOption, Value: firstFlag, Raw: "-" + firstFlag})
						tokens = append(tokens, Token{Type: TokenOptionValue, Value: value, Raw: value})
					} else {
						// Fallback: treat as multiple flags even if some are unknown
						for _, flag := range flags {
							tokens = append(tokens, Token{Type: TokenShortOption, Value: string(flag), Raw: "-" + string(flag)})
						}
					}
				}
			}
		} else {
			// Regular argument
			tokens = append(tokens, Token{Type: TokenArgument, Value: arg, Raw: arg})
		}
	}

	return tokens
}

// canParseAsMultipleFlags determines if a string can be parsed as multiple single-character flags
func (p *Parser) canParseAsMultipleFlags(flags string, cmd *Command) bool {
	// Check each character to see if it's a valid short option
	for _, char := range flags {
		flag := string(char)
		found := false
		for _, option := range cmd.Options {
			if option.Short == flag {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

// ParseCommand parses command-line arguments against a command structure
func (p *Parser) ParseCommand(cmd *Command, args []string) (*ParsedCommand, error) {
	// Validate command structure first
	if err := cmd.Validate(); err != nil {
		return nil, fmt.Errorf("invalid command structure: %v", err)
	}

	result := &ParsedCommand{
		Command:   cmd,
		Options:   make(map[string]any),
		Arguments: make([]any, 0),
		Unknown:   make([]string, 0),
	}

	// Initialize options with default values
	for _, option := range cmd.Options {
		if option.Default != nil {
			key := p.getOptionKey(option)
			result.Options[key] = option.Default
		}
	}

	// Tokenize the arguments with command context for better parsing
	tokens := p.Tokenize(args, cmd)

	return p.parseTokens(cmd, tokens, result)
}

// parseTokens processes tokenized arguments
func (p *Parser) parseTokens(cmd *Command, tokens []Token, result *ParsedCommand) (*ParsedCommand, error) {
	argIndex := 0
	doubleDashSeen := false

	for i := 0; i < len(tokens); i++ {
		token := tokens[i]

		switch token.Type {
		case TokenDoubleDash:
			doubleDashSeen = true
			continue

		case TokenArgument:
			// Enhanced subcommand resolution
			if !doubleDashSeen && argIndex == 0 {
				if subCmd := p.resolveSubcommand(cmd, token.Value, tokens[i+1:]); subCmd != nil {
					// Found subcommand, parse remaining tokens with it
					remainingTokens := tokens[i+1:]
					remainingArgs := make([]string, 0, len(remainingTokens))
					for _, t := range remainingTokens {
						remainingArgs = append(remainingArgs, t.Raw)
					}

					// Set up parser configuration from parent command
					p.inheritParentConfiguration(cmd, subCmd)

					// Execute pre-subcommand hook if present
					if cmd.PreSubcommand != nil {
						if err := cmd.PreSubcommand(cmd, subCmd); err != nil {
							return nil, fmt.Errorf("pre-subcommand hook failed: %v", err)
						}
					}

					// Parse with the subcommand
					subResult, err := p.ParseCommand(subCmd, remainingArgs)
					if err != nil {
						return nil, err
					}

					// Update result to reflect subcommand execution
					result.Command = subResult.Command
					result.Options = subResult.Options
					result.Arguments = subResult.Arguments
					result.Unknown = subResult.Unknown

					return result, nil
				}
			}

			// Check for default subcommand if no arguments match and we have a default
			if !doubleDashSeen && argIndex == 0 && cmd.GetDefaultSubcommand() != nil {
				defaultCmd := cmd.GetDefaultSubcommand()

				// Parse all remaining tokens with default command
				remainingArgs := make([]string, 0, len(tokens)-i)
				for j := i; j < len(tokens); j++ {
					remainingArgs = append(remainingArgs, tokens[j].Raw)
				}

				p.inheritParentConfiguration(cmd, defaultCmd)

				// Execute pre-subcommand hook if present
				if cmd.PreSubcommand != nil {
					if err := cmd.PreSubcommand(cmd, defaultCmd); err != nil {
						return nil, fmt.Errorf("pre-subcommand hook failed: %v", err)
					}
				}

				return p.ParseCommand(defaultCmd, remainingArgs)
			}

			// Handle as regular argument
			if err := p.handleArgument(cmd, token.Value, &argIndex, result); err != nil {
				return nil, err
			}

		case TokenShortOption, TokenLongOption:
			if doubleDashSeen {
				// Treat as argument after --
				if err := p.handleArgument(cmd, token.Raw, &argIndex, result); err != nil {
					return nil, err
				}
				continue
			}

			// Handle option
			consumed, err := p.handleOption(cmd, tokens, i, result)
			if err != nil {
				if p.AllowUnknownOptions {
					result.Unknown = append(result.Unknown, token.Raw)
					continue
				}
				return nil, err
			}
			i += consumed - 1 // -1 because loop will increment

		case TokenOptionValue:
			// This should be handled by option parsing
			continue

		default:
			result.Unknown = append(result.Unknown, token.Raw)
		}
	}

	// Post-processing validation
	return p.validateAndFinalize(cmd, result)
}

// handleArgument processes a regular argument with enhanced validation
func (p *Parser) handleArgument(cmd *Command, value string, argIndex *int, result *ParsedCommand) error {
	// Check for positional options first
	if p.EnablePositionalOptions {
		if optionName, exists := p.PositionalOptionMap[*argIndex]; exists {
			// Treat this argument as a positional option
			option := cmd.FindOption(optionName)
			if option != nil {
				key := p.getOptionKey(option)
				parsedValue, err := option.ProcessOptionValue(value, result.Options[key], false)
				if err != nil {
					return fmt.Errorf("invalid positional option value '%s' for option '%s': %v", value, optionName, err)
				}
				result.Options[key] = parsedValue
				*argIndex++
				return nil
			}
		}
	}

	if *argIndex < len(cmd.Arguments) {
		cmdArg := cmd.Arguments[*argIndex]

		// Enhanced validation before parsing
		if err := p.validateArgumentValue(cmdArg, value); err != nil {
			return err
		}

		if cmdArg.Variadic {
			// For variadic arguments, keep adding to the same argument slot
			var currentValue any
			if len(result.Arguments) > *argIndex {
				currentValue = result.Arguments[*argIndex]
			}

			parsedValue, err := cmdArg.ParseValue(value, currentValue)
			if err != nil {
				return fmt.Errorf("invalid argument '%s' for parameter '%s': %v", value, cmdArg.Name, err)
			}

			// Update or append the variadic argument
			if len(result.Arguments) > *argIndex {
				result.Arguments[*argIndex] = parsedValue
			} else {
				// Pad with nil values if necessary
				for len(result.Arguments) < *argIndex {
					result.Arguments = append(result.Arguments, nil)
				}
				result.Arguments = append(result.Arguments, parsedValue)
			}
		} else {
			// Regular argument
			parsedValue, err := cmdArg.ParseValue(value, nil)
			if err != nil {
				return fmt.Errorf("invalid argument '%s' for parameter '%s': %v", value, cmdArg.Name, err)
			}
			result.Arguments = append(result.Arguments, parsedValue)
			*argIndex++
		}
	} else {
		// Enhanced excess argument handling
		if p.ExcessArgumentHandler != nil {
			// Use custom handler for excess arguments
			if err := p.ExcessArgumentHandler([]string{value}); err != nil {
				return err
			}
			result.Unknown = append(result.Unknown, value)
		} else if cmd.AllowExcessArguments {
			result.Unknown = append(result.Unknown, value)
		} else {
			return fmt.Errorf("unexpected argument: %s (expected %d arguments, got %d)",
				value, len(cmd.Arguments), *argIndex+1)
		}
	}

	return nil
}

// validateArgumentValue performs pre-parsing validation on argument values
func (p *Parser) validateArgumentValue(arg *Argument, value string) error {
	// Check for empty values on required arguments
	if arg.Required && strings.TrimSpace(value) == "" {
		return fmt.Errorf("argument '%s' cannot be empty", arg.Name)
	}

	// Validate against choices if specified
	if len(arg.Choices) > 0 {
		found := false
		for _, choice := range arg.Choices {
			if choice == value {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("invalid choice '%s' for argument '%s', expected one of: %s",
				value, arg.Name, strings.Join(arg.Choices, ", "))
		}
	}

	return nil
}

// getOptionKey returns the preferred key for an option
func (p *Parser) getOptionKey(option *Option) string {
	if option.Long != "" {
		return option.Long
	}
	return option.Short
}

// ParseResult provides detailed parsing results with enhanced information
type ParseResult struct {
	*ParsedCommand
	Warnings    []string
	Suggestions []string
}

// NewParseResult creates a new parse result with warnings and suggestions
func NewParseResult(cmd *ParsedCommand) *ParseResult {
	return &ParseResult{
		ParsedCommand: cmd,
		Warnings:      make([]string, 0),
		Suggestions:   make([]string, 0),
	}
}

// AddWarning adds a warning to the parse result
func (pr *ParseResult) AddWarning(warning string) {
	pr.Warnings = append(pr.Warnings, warning)
}

// AddSuggestion adds a suggestion to the parse result
func (pr *ParseResult) AddSuggestion(suggestion string) {
	pr.Suggestions = append(pr.Suggestions, suggestion)
}

// ParseWithEnhancedResult parses command with enhanced result information
func (p *Parser) ParseWithEnhancedResult(cmd *Command, args []string) (*ParseResult, error) {
	parsedCmd, err := p.ParseCommand(cmd, args)
	if err != nil {
		return nil, err
	}

	result := NewParseResult(parsedCmd)

	// Add warnings for deprecated options or unusual usage
	p.addParsingWarnings(cmd, result)

	// Add suggestions for common mistakes
	p.addParsingSuggestions(cmd, args, result)

	return result, nil
}

// addParsingWarnings adds warnings for deprecated or unusual usage
func (p *Parser) addParsingWarnings(cmd *Command, result *ParseResult) {
	// Check for deprecated options
	for _, option := range cmd.Options {
		key := p.getOptionKey(option)
		if _, exists := result.Options[key]; exists && option.Hidden {
			result.AddWarning(fmt.Sprintf("Option '%s' is deprecated", option.Flags))
		}
	}

	// Warn about unknown options if they were collected
	if len(result.Unknown) > 0 && p.AllowUnknownOptions {
		result.AddWarning(fmt.Sprintf("Unknown options ignored: %s", strings.Join(result.Unknown, ", ")))
	}
}

// addParsingSuggestions adds suggestions for common mistakes
func (p *Parser) addParsingSuggestions(cmd *Command, args []string, result *ParseResult) {
	// Suggest similar option names for unknown options
	for _, arg := range args {
		if strings.HasPrefix(arg, "-") && !p.isKnownOption(cmd, arg) {
			if suggestion := p.findSimilarOption(cmd, arg); suggestion != "" {
				result.AddSuggestion(fmt.Sprintf("Did you mean '%s' instead of '%s'?", suggestion, arg))
			}
		}
	}
}

// isKnownOption checks if an option is known to the command
func (p *Parser) isKnownOption(cmd *Command, flag string) bool {
	cleanFlag := strings.TrimLeft(flag, "-")
	for _, option := range cmd.Options {
		if option.Matches(cleanFlag) {
			return true
		}
	}
	return false
}

// findSimilarOption finds a similar option name using simple string matching
func (p *Parser) findSimilarOption(cmd *Command, flag string) string {
	cleanFlag := strings.TrimLeft(flag, "-")

	// Simple similarity check - look for options that start with the same letter
	// or have similar length and characters
	for _, option := range cmd.Options {
		if option.Long != "" {
			if strings.HasPrefix(option.Long, cleanFlag[:1]) && len(option.Long) >= len(cleanFlag)-1 {
				return "--" + option.Long
			}
		}
		if option.Short != "" {
			if option.Short == cleanFlag[:1] {
				return "-" + option.Short
			}
		}
	}

	return ""
}

// resolveSubcommand performs enhanced subcommand resolution with lookahead
func (p *Parser) resolveSubcommand(cmd *Command, name string, remainingTokens []Token) *Command {
	// First, try exact match by name or alias
	if subCmd := cmd.FindSubcommandByNameOrAlias(name); subCmd != nil {
		return subCmd
	}

	// Check for default subcommand if no match found and no arguments provided
	if cmd.GetDefaultSubcommand() != nil && len(remainingTokens) == 0 {
		return cmd.GetDefaultSubcommand()
	}

	// If no exact match and we have remaining tokens, check for compound commands
	// This handles cases like "git remote add" where "remote" is a subcommand
	if len(remainingTokens) > 0 {
		for _, subCmd := range cmd.Subcommands {
			if subCmd.Name == name {
				// Check if the next token could be a sub-subcommand
				nextToken := remainingTokens[0]
				if nextToken.Type == TokenArgument {
					if subSubCmd := subCmd.FindSubcommandByNameOrAlias(nextToken.Value); subSubCmd != nil {
						// This is a nested subcommand scenario
						return subCmd
					}
				}
				return subCmd
			}
		}
	}

	return nil
}

// inheritParentConfiguration copies relevant configuration from parent to child command
func (p *Parser) inheritParentConfiguration(parent, child *Command) {
	// Inherit parser configuration
	if parent.AllowUnknownOption {
		p.AllowUnknownOptions = true
	}
	if parent.PassThroughOptions {
		p.PassThroughOptions = true
	}
	if parent.EnablePositionalOptions {
		p.EnablePositionalOptions = true
	}
}

// validateAndFinalize performs final validation and cleanup with enhanced argument validation
func (p *Parser) validateAndFinalize(cmd *Command, result *ParsedCommand) (*ParsedCommand, error) {
	// Enhanced argument validation using ArgumentProcessor
	if len(cmd.Arguments) > 0 {
		if err := p.validateArgumentsEnhanced(cmd, result); err != nil {
			return nil, err
		}
	}

	// Validate required options
	for _, option := range cmd.Options {
		if option.Required {
			key := p.getOptionKey(option)
			if _, exists := result.Options[key]; !exists {
				return nil, fmt.Errorf("missing required option: %s", option.Flags)
			}
		}
	}

	// Enhanced validation for nested commands
	if err := p.validateCommandHierarchy(cmd, result); err != nil {
		return nil, err
	}

	return result, nil
}

// validateArgumentsEnhanced performs enhanced argument validation using ArgumentProcessor
func (p *Parser) validateArgumentsEnhanced(cmd *Command, result *ParsedCommand) error {
	// Create an ArgumentProcessor with the command's arguments
	processor := NewArgumentProcessor(cmd.Arguments)

	// Set the processed values from the parsing result
	processor.values = make([]any, len(result.Arguments))
	copy(processor.values, result.Arguments)

	// Use the enhanced validation logic
	if err := processor.ValidateArguments(); err != nil {
		return fmt.Errorf("argument validation failed: %v", err)
	}

	// Update the result with any default values that were filled
	result.Arguments = processor.GetValues()

	return nil
}

// validateCommandHierarchy validates the command hierarchy and inheritance
func (p *Parser) validateCommandHierarchy(cmd *Command, result *ParsedCommand) error {
	// Check for conflicting options between parent and child commands
	if cmd.Parent != nil {
		parentOptions := make(map[string]*Option)
		for _, opt := range cmd.Parent.Options {
			key := p.getOptionKey(opt)
			parentOptions[key] = opt
		}

		for _, opt := range cmd.Options {
			key := p.getOptionKey(opt)
			if parentOpt, exists := parentOptions[key]; exists {
				// Check for conflicts
				if err := opt.IsCompatibleWith(parentOpt); err != nil {
					return fmt.Errorf("option conflict between parent and child command: %v", err)
				}
			}
		}
	}

	return nil
}

// handleOption processes an option token and its values with enhanced parsing
func (p *Parser) handleOption(cmd *Command, tokens []Token, index int, result *ParsedCommand) (int, error) {
	token := tokens[index]

	// Enhanced option matching with better flag resolution
	option := p.findOptionWithContext(cmd, token.Value, token.Type)
	if option == nil {
		// Handle unknown options with enhanced logic
		if p.PassThroughOptions {
			// Pass through unknown options to the result
			result.Unknown = append(result.Unknown, token.Raw)

			// Check if next token is a value for this unknown option
			consumed := 1
			if index+1 < len(tokens) && tokens[index+1].Type == TokenArgument {
				nextToken := tokens[index+1]
				if !strings.HasPrefix(nextToken.Value, "-") {
					result.Unknown = append(result.Unknown, nextToken.Value)
					consumed = 2
				}
			}
			return consumed, nil
		}

		if p.UnknownOptionHandler != nil {
			// Use custom handler for unknown options
			var value string
			consumed := 1
			if index+1 < len(tokens) && tokens[index+1].Type == TokenArgument {
				nextToken := tokens[index+1]
				if !strings.HasPrefix(nextToken.Value, "-") {
					value = nextToken.Value
					consumed = 2
				}
			}

			if err := p.UnknownOptionHandler(token.Value, value); err != nil {
				return 0, err
			}

			result.Unknown = append(result.Unknown, token.Raw)
			if value != "" {
				result.Unknown = append(result.Unknown, value)
			}
			return consumed, nil
		}

		if p.AllowUnknownOptions {
			result.Unknown = append(result.Unknown, token.Raw)
			return 1, nil
		}

		return 0, fmt.Errorf("unknown option: %s", token.Raw)
	}

	key := p.getOptionKey(option)
	isNegated := option.IsNegated(token.Value)

	// Handle negated boolean options with enhanced logic
	if option.Negatable && isNegated {
		result.Options[key] = false
		return 1, nil
	}

	// Handle boolean options (no value expected)
	if option.Type == OptionTypeBoolean {
		// Check for explicit boolean values
		if index+1 < len(tokens) && tokens[index+1].Type == TokenOptionValue {
			boolValue, err := option.ProcessOptionValue(tokens[index+1].Value, result.Options[key], isNegated)
			if err == nil {
				result.Options[key] = boolValue
				return 2, nil
			}
		}
		// Use ProcessOptionValue for consistent handling
		processedValue, err := option.ProcessOptionValue("", result.Options[key], isNegated)
		if err != nil {
			return 0, fmt.Errorf("error processing boolean option %s: %v", token.Raw, err)
		}
		result.Options[key] = processedValue
		return 1, nil
	}

	// Enhanced value collection for options that expect values
	consumed := 1
	var values []string

	// Collect option values with improved logic
	consumed, values = p.collectOptionValues(tokens, index, option)

	// Validate that required options have values
	if len(values) == 0 && !option.Optional && option.Type != OptionTypeBoolean {
		return 0, fmt.Errorf("option %s requires a value", token.Raw)
	}

	// Process collected values using enhanced processing
	if err := p.processOptionValuesEnhanced(option, values, key, result, token.Raw, isNegated); err != nil {
		return 0, err
	}

	return consumed, nil
}

// findOptionWithContext finds an option with enhanced context-aware matching
func (p *Parser) findOptionWithContext(cmd *Command, flag string, tokenType TokenType) *Option {
	// Direct match first
	for _, opt := range cmd.Options {
		if opt.Matches(flag) {
			return opt
		}
	}

	// For short options, check if it's a negated long option
	if tokenType == TokenShortOption && len(flag) == 1 {
		for _, opt := range cmd.Options {
			if opt.Negatable && opt.Long != "" && flag == "n" && strings.HasPrefix(opt.Long, "no-") {
				return opt
			}
		}
	}

	// Check parent command options if enabled
	if p.EnablePositionalOptions && cmd.Parent != nil {
		return p.findOptionWithContext(cmd.Parent, flag, tokenType)
	}

	return nil
}

// collectOptionValues collects values for an option with enhanced logic
func (p *Parser) collectOptionValues(tokens []Token, index int, option *Option) (int, []string) {
	consumed := 1
	var values []string

	// Check if next token is a direct value (from --flag=value or -fvalue)
	if index+1 < len(tokens) && tokens[index+1].Type == TokenOptionValue {
		values = append(values, tokens[index+1].Value)
		consumed++
	} else if index+1 < len(tokens) && tokens[index+1].Type == TokenArgument {
		// Check if this argument should be consumed as an option value
		nextToken := tokens[index+1]

		// Don't consume if it looks like another option
		if !strings.HasPrefix(nextToken.Value, "-") {
			values = append(values, nextToken.Value)
			consumed++
		}
	}

	// For variadic options, collect additional values
	if option.Variadic && len(values) > 0 {
		for i := index + consumed; i < len(tokens); i++ {
			token := tokens[i]

			// Stop at options or double dash
			if token.Type != TokenArgument || strings.HasPrefix(token.Value, "-") {
				break
			}

			values = append(values, token.Value)
			consumed++
		}
	}

	return consumed, values
}

// processOptionValues processes collected option values
func (p *Parser) processOptionValues(option *Option, values []string, key string, result *ParsedCommand, tokenRaw string) error {
	return p.processOptionValuesEnhanced(option, values, key, result, tokenRaw, false)
}

// processOptionValuesEnhanced processes collected option values with enhanced logic
func (p *Parser) processOptionValuesEnhanced(option *Option, values []string, key string, result *ParsedCommand, tokenRaw string, isNegated bool) error {
	if len(values) == 0 {
		// Handle options without values
		if option.Optional {
			if option.Default != nil {
				result.Options[key] = option.Default
			} else if option.Type == OptionTypeBoolean {
				processedValue, err := option.ProcessOptionValue("", result.Options[key], isNegated)
				if err != nil {
					return fmt.Errorf("error processing option %s: %v", tokenRaw, err)
				}
				result.Options[key] = processedValue
			}
		}
		return nil
	}

	if option.Variadic {
		// Parse all values for variadic option
		var variadicValue any
		if existing, exists := result.Options[key]; exists {
			variadicValue = existing
		}

		for _, value := range values {
			parsed, err := option.ProcessOptionValue(value, variadicValue, isNegated)
			if err != nil {
				return fmt.Errorf("invalid value '%s' for option %s: %v", value, tokenRaw, err)
			}
			variadicValue = parsed
		}
		result.Options[key] = variadicValue
	} else {
		// Parse single value (use first value if multiple provided)
		parsed, err := option.ProcessOptionValue(values[0], result.Options[key], isNegated)
		if err != nil {
			return fmt.Errorf("invalid value '%s' for option %s: %v", values[0], tokenRaw, err)
		}
		result.Options[key] = parsed

		// Warn about extra values for non-variadic options
		if len(values) > 1 && !p.AllowUnknownOptions {
			return fmt.Errorf("option %s does not accept multiple values", tokenRaw)
		}
	}

	return nil
}
