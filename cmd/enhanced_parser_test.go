package cmd

import (
	"fmt"
	"testing"
)

func TestEnhancedParserCreation(t *testing.T) {
	parser := NewParser()

	if parser == nil {
		t.Error("Expected non-nil parser")
	}

	// Test default values
	if parser.AllowUnknownOptions {
		t.Error("Expected AllowUnknownOptions to default to false")
	}

	if parser.StopAtFirstUnknown {
		t.Error("Expected StopAtFirstUnknown to default to false")
	}

	if parser.EnablePositionalOptions {
		t.Error("Expected EnablePositionalOptions to default to false")
	}

	if parser.PassThroughOptions {
		t.Error("Expected PassThroughOptions to default to false")
	}

	if !parser.CombineFlagAndOptionalValue {
		t.Error("Expected CombineFlagAndOptionalValue to default to true")
	}

	if parser.PositionalOptionMap == nil {
		t.Error("Expected PositionalOptionMap to be initialized")
	}
}

func TestPositionalOptionMapping(t *testing.T) {
	parser := NewParser()

	// Test setting positional options
	parser.SetPositionalOption(0, "input")
	parser.SetPositionalOption(1, "output")

	if parser.PositionalOptionMap[0] != "input" {
		t.Errorf("Expected position 0 to map to 'input', got %s", parser.PositionalOptionMap[0])
	}

	if parser.PositionalOptionMap[1] != "output" {
		t.Errorf("Expected position 1 to map to 'output', got %s", parser.PositionalOptionMap[1])
	}
}

func TestComplexCommandParsing(t *testing.T) {
	parser := NewParser()

	// Create a complex command structure
	rootCmd := NewCommand("myapp")
	rootCmd.AddOption(NewBooleanOption("-v, --verbose", "verbose output"))
	rootCmd.AddOption(NewOption("-f, --file <path>", "input file"))
	rootCmd.AddArgument(NewRequiredArgument("<action>", "action to perform"))

	buildCmd := NewCommand("build")
	buildCmd.AddOption(NewBooleanOption("-w, --watch", "watch for changes"))
	buildCmd.AddOption(NewOption("-o, --output <dir>", "output directory"))
	buildCmd.AddArgument(NewOptionalArgument("[target]", "build target", "all"))

	rootCmd.AddSubcommand(buildCmd)

	tests := []struct {
		name          string
		args          []string
		expectedCmd   string
		expectedOpts  map[string]any
		expectedArgs  []any
		expectedError bool
	}{
		{
			name:        "root command with options",
			args:        []string{"-v", "--file", "input.txt", "deploy"},
			expectedCmd: "myapp",
			expectedOpts: map[string]any{
				"verbose": true,
				"file":    "input.txt",
			},
			expectedArgs: []any{"deploy"},
		},
		{
			name:        "subcommand with options",
			args:        []string{"build", "-w", "--output", "dist", "production"},
			expectedCmd: "build",
			expectedOpts: map[string]any{
				"watch":  true,
				"output": "dist",
			},
			expectedArgs: []any{"production"},
		},
		{
			name:        "subcommand with default argument",
			args:        []string{"build", "-w"},
			expectedCmd: "build",
			expectedOpts: map[string]any{
				"watch": true,
			},
			expectedArgs: []any{"all"}, // default value
		},
		{
			name:          "missing required argument",
			args:          []string{"-v"},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := parser.ParseCommand(rootCmd, tt.args)

			if tt.expectedError && err == nil {
				t.Error("Expected error but got none")
				return
			}

			if !tt.expectedError && err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !tt.expectedError {
				if result.Command.Name != tt.expectedCmd {
					t.Errorf("Expected command %s, got %s", tt.expectedCmd, result.Command.Name)
				}

				// Check options
				for key, expected := range tt.expectedOpts {
					if actual, exists := result.Options[key]; !exists {
						t.Errorf("Expected option %s not found", key)
					} else if actual != expected {
						t.Errorf("Option %s: expected %v, got %v", key, expected, actual)
					}
				}

				// Check arguments
				if len(result.Arguments) != len(tt.expectedArgs) {
					t.Errorf("Expected %d arguments, got %d", len(tt.expectedArgs), len(result.Arguments))
				} else {
					for i, expected := range tt.expectedArgs {
						if result.Arguments[i] != expected {
							t.Errorf("Argument %d: expected %v, got %v", i, expected, result.Arguments[i])
						}
					}
				}
			}
		})
	}
}

func TestAdvancedParsingFeatures(t *testing.T) {
	tests := []struct {
		name           string
		setupParser    func(*Parser)
		setupCommand   func(*Command)
		args           []string
		expectedResult func(*ParsedCommand) bool
		expectedError  bool
	}{
		{
			name: "pass through options",
			setupParser: func(p *Parser) {
				p.PassThroughOptions = true
			},
			setupCommand: func(cmd *Command) {
				cmd.AddOption(NewBooleanOption("-v, --verbose", "verbose"))
			},
			args: []string{"-v", "--unknown", "value", "arg1"},
			expectedResult: func(result *ParsedCommand) bool {
				return result.Options["verbose"] == true && len(result.Unknown) >= 2
			},
		},
		{
			name: "allow unknown options",
			setupParser: func(p *Parser) {
				p.AllowUnknownOptions = true
			},
			setupCommand: func(cmd *Command) {
				cmd.AddOption(NewBooleanOption("-v, --verbose", "verbose"))
			},
			args: []string{"-v", "--unknown", "arg1"},
			expectedResult: func(result *ParsedCommand) bool {
				return result.Options["verbose"] == true && len(result.Unknown) > 0
			},
		},
		{
			name: "positional options",
			setupParser: func(p *Parser) {
				p.EnablePositionalOptions = true
				p.SetPositionalOption(0, "file")
			},
			setupCommand: func(cmd *Command) {
				cmd.AddOption(NewOption("-f, --file <path>", "input file"))
			},
			args: []string{"input.txt"},
			expectedResult: func(result *ParsedCommand) bool {
				return result.Options["file"] == "input.txt"
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parser := NewParser()
			if tt.setupParser != nil {
				tt.setupParser(parser)
			}

			cmd := NewCommand("test")
			if tt.setupCommand != nil {
				tt.setupCommand(cmd)
			}

			result, err := parser.ParseCommand(cmd, tt.args)

			if tt.expectedError && err == nil {
				t.Error("Expected error but got none")
				return
			}

			if !tt.expectedError && err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !tt.expectedError && tt.expectedResult != nil && !tt.expectedResult(result) {
				t.Errorf("Result validation failed for args %v", tt.args)
			}
		})
	}
}

func TestTokenizationEnhancements(t *testing.T) {
	parser := NewParser()

	cmd := NewCommand("test")
	cmd.AddOption(NewBooleanOption("-a", "option a"))
	cmd.AddOption(NewBooleanOption("-b", "option b"))
	cmd.AddOption(NewBooleanOption("-c", "option c"))
	cmd.AddOption(NewOption("-f, --file <path>", "input file"))

	tests := []struct {
		name           string
		args           []string
		expectedTokens int
		description    string
	}{
		{
			name:           "combined short flags",
			args:           []string{"-abc"},
			expectedTokens: 3, // Should tokenize as -a, -b, -c
			description:    "Combined short flags should be split",
		},
		{
			name:           "flag with attached value",
			args:           []string{"-ftest.txt"},
			expectedTokens: 2, // Should tokenize as -f, test.txt
			description:    "Flag with attached value should be split",
		},
		{
			name:           "long flag with equals",
			args:           []string{"--file=test.txt"},
			expectedTokens: 2, // Should tokenize as --file, test.txt
			description:    "Long flag with equals should be split",
		},
		{
			name:           "double dash separator",
			args:           []string{"--", "-v", "file"},
			expectedTokens: 3, // Should tokenize as --, -v (as arg), file (as arg)
			description:    "Double dash should stop option parsing",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tokens := parser.Tokenize(tt.args, cmd)

			if len(tokens) != tt.expectedTokens {
				t.Errorf("%s: expected %d tokens, got %d", tt.description, tt.expectedTokens, len(tokens))
				for i, token := range tokens {
					t.Logf("Token %d: Type=%d, Value=%s, Raw=%s", i, token.Type, token.Value, token.Raw)
				}
			}
		})
	}
}

func TestErrorHandlingEnhancements(t *testing.T) {
	parser := NewParser()

	cmd := NewCommand("test")
	cmd.AddOption(CreateRequiredOption("-f, --file <path>", "required file"))
	cmd.AddArgument(NewRequiredArgument("<input>", "input argument"))

	tests := []struct {
		name        string
		args        []string
		expectError bool
		errorType   string
	}{
		{
			name:        "missing required option",
			args:        []string{"input.txt"},
			expectError: true,
			errorType:   "required option",
		},
		{
			name:        "missing required argument",
			args:        []string{"-f", "file.txt"},
			expectError: true,
			errorType:   "required argument",
		},
		{
			name:        "invalid option value",
			args:        []string{"-f", "", "input.txt"},
			expectError: true,
			errorType:   "invalid option",
		},
		{
			name:        "valid input",
			args:        []string{"-f", "file.txt", "input.txt"},
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := parser.ParseCommand(cmd, tt.args)

			if tt.expectError && err == nil {
				t.Errorf("Expected error for %s but got none", tt.errorType)
			}

			if !tt.expectError && err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

func TestParserConfigurationValidation(t *testing.T) {
	parser := NewParser()

	// Test that configuration changes are applied correctly
	parser.AllowUnknownOptions = true
	parser.EnablePositionalOptions = true
	parser.PassThroughOptions = true
	parser.CombineFlagAndOptionalValue = false

	if !parser.AllowUnknownOptions {
		t.Error("Failed to set AllowUnknownOptions")
	}

	if !parser.EnablePositionalOptions {
		t.Error("Failed to set EnablePositionalOptions")
	}

	if !parser.PassThroughOptions {
		t.Error("Failed to set PassThroughOptions")
	}

	if parser.CombineFlagAndOptionalValue {
		t.Error("Failed to set CombineFlagAndOptionalValue to false")
	}
}

func TestParserPerformance(t *testing.T) {
	parser := NewParser()

	// Create a command with many options
	cmd := NewCommand("perf-test")
	for i := 0; i < 100; i++ {
		cmd.AddOption(NewBooleanOption(fmt.Sprintf("--option%d", i), fmt.Sprintf("option %d", i)))
	}

	// Create arguments with many flags
	args := make([]string, 100)
	for i := 0; i < 100; i++ {
		args[i] = fmt.Sprintf("--option%d", i)
	}

	// This should complete without timeout
	_, err := parser.ParseCommand(cmd, args)
	if err != nil {
		t.Errorf("Performance test failed: %v", err)
	}
}

func TestParserMemoryManagement(t *testing.T) {
	parser := NewParser()

	// Test that parser doesn't leak memory with repeated parsing
	cmd := NewCommand("memory-test")
	cmd.AddOption(NewBooleanOption("-v, --verbose", "verbose"))
	cmd.AddArgument(NewOptionalArgument("[file]", "input file", "default.txt"))

	args := []string{"-v", "test.txt"}

	// Parse multiple times to check for memory leaks
	for i := 0; i < 1000; i++ {
		result, err := parser.ParseCommand(cmd, args)
		if err != nil {
			t.Errorf("Parse failed on iteration %d: %v", i, err)
			break
		}

		// Verify result is consistent
		if result.Options["verbose"] != true {
			t.Errorf("Inconsistent result on iteration %d", i)
			break
		}
	}
}

func TestParserEdgeCases(t *testing.T) {
	parser := NewParser()

	tests := []struct {
		name        string
		setupCmd    func() *Command
		args        []string
		expectError bool
		description string
	}{
		{
			name: "empty command",
			setupCmd: func() *Command {
				return NewCommand("empty")
			},
			args:        []string{},
			expectError: false,
			description: "Empty command should parse successfully",
		},
		{
			name: "command with only help option",
			setupCmd: func() *Command {
				cmd := NewCommand("help-only")
				// NewCommand automatically adds help option
				return cmd
			},
			args:        []string{"--help"},
			expectError: false,
			description: "Help option should be handled",
		},
		{
			name: "very long argument list",
			setupCmd: func() *Command {
				cmd := NewCommand("long-args")
				cmd.AddArgument(NewVariadicArgument("<files...>", "input files", false))
				return cmd
			},
			args:        make([]string, 1000), // 1000 arguments
			expectError: false,
			description: "Very long argument list should be handled",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cmd := tt.setupCmd()

			// Initialize long args test
			if tt.name == "very long argument list" {
				for i := range tt.args {
					tt.args[i] = fmt.Sprintf("file%d.txt", i)
				}
			}

			_, err := parser.ParseCommand(cmd, tt.args)

			if tt.expectError && err == nil {
				t.Errorf("%s: expected error but got none", tt.description)
			}

			if !tt.expectError && err != nil {
				t.Errorf("%s: unexpected error: %v", tt.description, err)
			}
		})
	}
}

// Benchmark tests for parser performance
func BenchmarkBasicParsing(b *testing.B) {
	parser := NewParser()
	cmd := NewCommand("bench")
	cmd.AddOption(NewBooleanOption("-v, --verbose", "verbose"))
	cmd.AddOption(NewOption("-f, --file <path>", "file"))
	cmd.AddArgument(NewRequiredArgument("<input>", "input"))

	args := []string{"-v", "--file", "test.txt", "input.txt"}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parser.ParseCommand(cmd, args)
	}
}

func BenchmarkComplexParsing(b *testing.B) {
	parser := NewParser()
	cmd := NewCommand("complex")

	// Add many options
	for i := 0; i < 50; i++ {
		cmd.AddOption(NewBooleanOption(fmt.Sprintf("--opt%d", i), fmt.Sprintf("option %d", i)))
	}

	// Create args that use many options
	args := make([]string, 50)
	for i := 0; i < 50; i++ {
		args[i] = fmt.Sprintf("--opt%d", i)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parser.ParseCommand(cmd, args)
	}
}

func BenchmarkTokenization(b *testing.B) {
	parser := NewParser()
	cmd := NewCommand("tokenize")
	cmd.AddOption(NewBooleanOption("-a", "a"))
	cmd.AddOption(NewBooleanOption("-b", "b"))
	cmd.AddOption(NewBooleanOption("-c", "c"))

	args := []string{"-abc", "--file=test.txt", "arg1", "arg2"}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parser.Tokenize(args, cmd)
	}
}
