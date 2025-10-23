package cmd

import (
	"testing"
)

func TestEnhancedTokenization(t *testing.T) {
	parser := NewParser()

	// Create command without default help option to avoid conflicts
	cmd := &Command{
		Name:        "test",
		Options:     make([]*Option, 0),
		Arguments:   make([]*Argument, 0),
		Subcommands: make([]*Command, 0),
		Aliases:     make([]string, 0),
	}

	// Add some options for testing
	cmd.AddOption(NewBooleanOption("-v, --verbose", "verbose output"))
	cmd.AddOption(NewOption("-f, --file <path>", "input file"))
	cmd.AddOption(NewBooleanOption("-a", "option a"))
	cmd.AddOption(NewBooleanOption("-b", "option b"))
	cmd.AddOption(NewBooleanOption("-c", "option c"))

	tests := []struct {
		name     string
		args     []string
		expected int // expected number of tokens
	}{
		{
			name:     "simple flags",
			args:     []string{"-v", "--file", "test.txt"},
			expected: 3,
		},
		{
			name:     "combined short flags",
			args:     []string{"-abc"},
			expected: 3, // Should be tokenized as -a -b -c
		},
		{
			name:     "flag with value",
			args:     []string{"-ftest.txt"},
			expected: 2, // Should be tokenized as -f and test.txt
		},
		{
			name:     "long flag with equals",
			args:     []string{"--file=test.txt"},
			expected: 2, // Should be tokenized as --file and test.txt
		},
		{
			name:     "double dash",
			args:     []string{"--", "-v", "file"},
			expected: 3, // --, -v (as arg), file (as arg)
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tokens := parser.Tokenize(tt.args, cmd)
			if len(tokens) != tt.expected {
				t.Errorf("Expected %d tokens, got %d for args %v", tt.expected, len(tokens), tt.args)
				for i, token := range tokens {
					t.Logf("Token %d: Type=%d, Value=%s, Raw=%s", i, token.Type, token.Value, token.Raw)
				}
			}
		})
	}
}

func TestOptionParsing(t *testing.T) {
	parser := NewParser()

	// Create command without default help option
	cmd := &Command{
		Name:        "test",
		Options:     make([]*Option, 0),
		Arguments:   make([]*Argument, 0),
		Subcommands: make([]*Command, 0),
		Aliases:     make([]string, 0),
	}

	// Add various option types
	cmd.AddOption(NewBooleanOption("-v, --verbose", "verbose output"))

	fileOpt := NewOption("-f, --file <path>", "input file")
	fileOpt.SetRequired(false) // Make it optional for testing
	cmd.AddOption(fileOpt)

	// Create variadic option properly
	variadicOpt := NewOption("-I, --include <dir>", "include directories")
	variadicOpt.SetVariadic(true)
	variadicOpt.SetRequired(false) // Variadic options cannot be required
	cmd.AddOption(variadicOpt)

	cmd.AddOption(CreateNegatableOption("--color", "colorize output"))

	tests := []struct {
		name          string
		args          []string
		expectedOpts  map[string]interface{}
		expectedError bool
	}{
		{
			name: "boolean flag",
			args: []string{"-v"},
			expectedOpts: map[string]interface{}{
				"verbose": true,
			},
		},
		{
			name: "option with value",
			args: []string{"-f", "test.txt"},
			expectedOpts: map[string]interface{}{
				"file": "test.txt",
			},
		},
		{
			name: "negated option",
			args: []string{"--no-color"},
			expectedOpts: map[string]interface{}{
				"color": false,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := parser.ParseCommand(cmd, tt.args)

			if tt.expectedError && err == nil {
				t.Error("Expected error but got none")
				return
			}

			if !tt.expectedError && err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !tt.expectedError {
				for key, expectedValue := range tt.expectedOpts {
					if actualValue, exists := result.Options[key]; !exists {
						t.Errorf("Expected option %s not found", key)
					} else {
						// Simple comparison for test purposes
						if actualValue != expectedValue {
							t.Errorf("Expected option %s to be %v, got %v", key, expectedValue, actualValue)
						}
					}
				}
			}
		})
	}
}

func TestArgumentParsing(t *testing.T) {
	parser := NewParser()

	// Create command without default help option
	cmd := &Command{
		Name:        "test",
		Options:     make([]*Option, 0),
		Arguments:   make([]*Argument, 0),
		Subcommands: make([]*Command, 0),
		Aliases:     make([]string, 0),
	}

	// Add arguments in correct order: required first, then optional, then variadic
	cmd.AddArgument(NewArgument("<source>", "source file"))

	// Create variadic argument and make it optional
	variadicArg := NewArgument("<files...>", "additional files")
	variadicArg.SetRequired(false)
	cmd.AddArgument(variadicArg)

	tests := []struct {
		name          string
		args          []string
		expectedArgs  int
		expectedError bool
	}{
		{
			name:         "required argument only",
			args:         []string{"source.txt"},
			expectedArgs: 1,
		},
		{
			name:         "with variadic",
			args:         []string{"source.txt", "file1.txt", "file2.txt"},
			expectedArgs: 2, // source, [file1.txt, file2.txt]
		},
		{
			name:          "missing required",
			args:          []string{},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := parser.ParseCommand(cmd, tt.args)

			if tt.expectedError && err == nil {
				t.Error("Expected error but got none")
				return
			}

			if !tt.expectedError && err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !tt.expectedError && len(result.Arguments) != tt.expectedArgs {
				t.Errorf("Expected %d arguments, got %d", tt.expectedArgs, len(result.Arguments))
			}
		})
	}
}

func TestEnhancedArgumentValidation(t *testing.T) {
	parser := NewParser()

	// Create command for testing enhanced argument validation
	cmd := &Command{
		Name:        "test",
		Options:     make([]*Option, 0),
		Arguments:   make([]*Argument, 0),
		Subcommands: make([]*Command, 0),
		Aliases:     make([]string, 0),
	}

	// Add choice argument
	choiceArg := NewChoiceArgument("<level>", "log level", []string{"debug", "info", "warn"}, true)
	cmd.AddArgument(choiceArg)

	// Add optional argument with default
	optionalArg := NewOptionalArgument("[output]", "output file", "default.txt")
	cmd.AddArgument(optionalArg)

	tests := []struct {
		name          string
		args          []string
		expectedError bool
		checkResult   func(*ParsedCommand) bool
	}{
		{
			name: "valid choice argument",
			args: []string{"info"},
			checkResult: func(result *ParsedCommand) bool {
				return len(result.Arguments) == 2 && result.Arguments[0] == "info" && result.Arguments[1] == "default.txt"
			},
		},
		{
			name:          "invalid choice argument",
			args:          []string{"invalid"},
			expectedError: true,
		},
		{
			name: "choice with custom output",
			args: []string{"debug", "custom.txt"},
			checkResult: func(result *ParsedCommand) bool {
				return len(result.Arguments) == 2 && result.Arguments[0] == "debug" && result.Arguments[1] == "custom.txt"
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := parser.ParseCommand(cmd, tt.args)

			if tt.expectedError && err == nil {
				t.Error("Expected error but got none")
				return
			}

			if !tt.expectedError && err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !tt.expectedError && tt.checkResult != nil && !tt.checkResult(result) {
				t.Errorf("Result validation failed for arguments: %v", result.Arguments)
			}
		})
	}
}
