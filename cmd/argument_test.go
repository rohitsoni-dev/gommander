package cmd

import (
	"testing"
)

func TestArgumentCreation(t *testing.T) {
	tests := []struct {
		name     string
		argName  string
		expected struct {
			required bool
			variadic bool
		}
	}{
		{
			name:    "required argument",
			argName: "<file>",
			expected: struct {
				required bool
				variadic bool
			}{true, false},
		},
		{
			name:    "optional argument",
			argName: "[file]",
			expected: struct {
				required bool
				variadic bool
			}{false, false},
		},
		{
			name:    "variadic required",
			argName: "<files...>",
			expected: struct {
				required bool
				variadic bool
			}{true, true},
		},
		{
			name:    "variadic optional",
			argName: "[files...]",
			expected: struct {
				required bool
				variadic bool
			}{false, true},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			arg := NewArgument(tt.argName, "test argument")

			if arg.Required != tt.expected.required {
				t.Errorf("Expected required=%v, got %v", tt.expected.required, arg.Required)
			}

			if arg.Variadic != tt.expected.variadic {
				t.Errorf("Expected variadic=%v, got %v", tt.expected.variadic, arg.Variadic)
			}
		})
	}
}

func TestArgumentValidation(t *testing.T) {
	tests := []struct {
		name          string
		arg           *Argument
		value         any
		expectedError bool
	}{
		{
			name:          "required argument with value",
			arg:           NewRequiredArgument("<file>", "input file"),
			value:         "test.txt",
			expectedError: false,
		},
		{
			name:          "required argument without value",
			arg:           NewRequiredArgument("<file>", "input file"),
			value:         nil,
			expectedError: true,
		},
		{
			name:          "optional argument without value",
			arg:           NewOptionalArgument("[file]", "input file", "default.txt"),
			value:         nil,
			expectedError: false,
		},
		{
			name:          "choice argument valid",
			arg:           NewChoiceArgument("<level>", "log level", []string{"debug", "info", "warn"}, true),
			value:         "info",
			expectedError: false,
		},
		{
			name:          "choice argument invalid",
			arg:           NewChoiceArgument("<level>", "log level", []string{"debug", "info", "warn"}, true),
			value:         "invalid",
			expectedError: true,
		},
		{
			name:          "variadic argument with array",
			arg:           NewVariadicArgument("<files...>", "input files", true),
			value:         []any{"file1.txt", "file2.txt"},
			expectedError: false,
		},
		{
			name:          "required variadic argument with empty array",
			arg:           NewVariadicArgument("<files...>", "input files", true),
			value:         []any{},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.arg.Validate(tt.value)

			if tt.expectedError && err == nil {
				t.Error("Expected error but got none")
			}

			if !tt.expectedError && err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

func TestEnhancedArgumentParsing(t *testing.T) {
	tests := []struct {
		name          string
		arg           *Argument
		value         string
		previous      any
		expected      any
		expectedError bool
	}{
		{
			name:     "simple string parsing",
			arg:      NewRequiredArgument("<file>", "input file"),
			value:    "test.txt",
			expected: "test.txt",
		},
		{
			name:     "choice validation success",
			arg:      NewChoiceArgument("<level>", "log level", []string{"debug", "info"}, true),
			value:    "debug",
			expected: "debug",
		},
		{
			name:          "choice validation failure",
			arg:           NewChoiceArgument("<level>", "log level", []string{"debug", "info"}, true),
			value:         "invalid",
			expectedError: true,
		},
		{
			name:     "variadic first value",
			arg:      NewVariadicArgument("<files...>", "input files", false),
			value:    "file1.txt",
			expected: []any{"file1.txt"},
		},
		{
			name:     "variadic additional value",
			arg:      NewVariadicArgument("<files...>", "input files", false),
			value:    "file2.txt",
			previous: []any{"file1.txt"},
			expected: []any{"file1.txt", "file2.txt"},
		},
		{
			name:          "empty required argument",
			arg:           NewRequiredArgument("<file>", "input file"),
			value:         "",
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := tt.arg.ParseValue(tt.value, tt.previous)

			if tt.expectedError && err == nil {
				t.Error("Expected error but got none")
			}

			if !tt.expectedError && err != nil {
				t.Errorf("Unexpected error: %v", err)
			}

			if !tt.expectedError && !compareValues(result, tt.expected) {
				t.Errorf("Expected %v, got %v", tt.expected, result)
			}
		})
	}
}

func TestArgumentProcessor(t *testing.T) {
	tests := []struct {
		name          string
		arguments     []*Argument
		values        []string
		expectedArgs  []any
		expectedError bool
	}{
		{
			name: "single required argument",
			arguments: []*Argument{
				NewRequiredArgument("<file>", "input file"),
			},
			values:       []string{"test.txt"},
			expectedArgs: []any{"test.txt"},
		},
		{
			name: "required and optional arguments",
			arguments: []*Argument{
				NewRequiredArgument("<input>", "input file"),
				NewOptionalArgument("[output]", "output file", "output.txt"),
			},
			values:       []string{"input.txt"},
			expectedArgs: []any{"input.txt", "output.txt"}, // default filled
		},
		{
			name: "variadic argument",
			arguments: []*Argument{
				NewRequiredArgument("<command>", "command name"),
				NewVariadicArgument("<args...>", "command arguments", false),
			},
			values:       []string{"build", "--verbose", "--output", "dist"},
			expectedArgs: []any{"build", []any{"--verbose", "--output", "dist"}},
		},
		{
			name: "choice argument validation",
			arguments: []*Argument{
				NewChoiceArgument("<level>", "log level", []string{"debug", "info", "warn"}, true),
			},
			values:       []string{"info"},
			expectedArgs: []any{"info"},
		},
		{
			name: "invalid choice",
			arguments: []*Argument{
				NewChoiceArgument("<level>", "log level", []string{"debug", "info"}, true),
			},
			values:        []string{"invalid"},
			expectedError: true,
		},
		{
			name: "missing required argument",
			arguments: []*Argument{
				NewRequiredArgument("<file>", "input file"),
			},
			values:        []string{},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			processor := NewArgumentProcessor(tt.arguments)

			// Process all values
			for _, value := range tt.values {
				if err := processor.ProcessArgument(value); err != nil {
					if !tt.expectedError {
						t.Errorf("Unexpected error processing argument: %v", err)
					}
					return
				}
			}

			// Validate arguments
			if err := processor.ValidateArguments(); err != nil {
				if !tt.expectedError {
					t.Errorf("Unexpected validation error: %v", err)
				}
				return
			}

			if tt.expectedError {
				t.Error("Expected error but got none")
				return
			}

			// Check results
			results := processor.GetValues()
			if len(results) != len(tt.expectedArgs) {
				t.Errorf("Expected %d arguments, got %d", len(tt.expectedArgs), len(results))
				return
			}

			for i, expected := range tt.expectedArgs {
				if !compareValues(results[i], expected) {
					t.Errorf("Argument %d: expected %v, got %v", i, expected, results[i])
				}
			}
		})
	}
}

func TestCustomArgumentParsers(t *testing.T) {
	tests := []struct {
		name          string
		parser        ArgumentParser
		value         string
		expected      any
		expectedError bool
	}{
		{
			name:     "integer parser valid",
			parser:   IntArgumentParser,
			value:    "42",
			expected: 42,
		},
		{
			name:          "integer parser invalid",
			parser:        IntArgumentParser,
			value:         "not-a-number",
			expectedError: true,
		},
		{
			name:     "float parser valid",
			parser:   FloatArgumentParser,
			value:    "3.14",
			expected: 3.14,
		},
		{
			name:          "float parser invalid",
			parser:        FloatArgumentParser,
			value:         "not-a-float",
			expectedError: true,
		},
		{
			name:     "bool parser true",
			parser:   BoolArgumentParser,
			value:    "true",
			expected: true,
		},
		{
			name:     "bool parser false",
			parser:   BoolArgumentParser,
			value:    "no",
			expected: false,
		},
		{
			name:          "bool parser invalid",
			parser:        BoolArgumentParser,
			value:         "maybe",
			expectedError: true,
		},
		{
			name:     "path parser valid",
			parser:   PathArgumentParser,
			value:    "/path/to/file",
			expected: "/path/to/file",
		},
		{
			name:          "path parser empty",
			parser:        PathArgumentParser,
			value:         "",
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := tt.parser(tt.value, nil)

			if tt.expectedError && err == nil {
				t.Error("Expected error but got none")
			}

			if !tt.expectedError && err != nil {
				t.Errorf("Unexpected error: %v", err)
			}

			if !tt.expectedError && result != tt.expected {
				t.Errorf("Expected %v, got %v", tt.expected, result)
			}
		})
	}
}

func TestArgumentStructureValidation(t *testing.T) {
	tests := []struct {
		name          string
		arguments     []*Argument
		expectedError bool
	}{
		{
			name: "valid structure",
			arguments: []*Argument{
				NewRequiredArgument("<input>", "input file"),
				NewOptionalArgument("[output]", "output file", "default.txt"),
			},
			expectedError: false,
		},
		{
			name: "required after optional",
			arguments: []*Argument{
				NewOptionalArgument("[input]", "input file", "default.txt"),
				NewRequiredArgument("<output>", "output file"),
			},
			expectedError: true,
		},
		{
			name: "argument after variadic",
			arguments: []*Argument{
				NewVariadicArgument("<files...>", "input files", false),
				NewRequiredArgument("<output>", "output file"),
			},
			expectedError: true,
		},
		{
			name: "valid with variadic at end",
			arguments: []*Argument{
				NewRequiredArgument("<command>", "command name"),
				NewVariadicArgument("<args...>", "command arguments", false),
			},
			expectedError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateArgumentStructure(tt.arguments)

			if tt.expectedError && err == nil {
				t.Error("Expected error but got none")
			}

			if !tt.expectedError && err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

// Helper function to compare values, handling slices properly
func compareValues(a, b any) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}

	// Handle slice comparison
	if sliceA, okA := a.([]any); okA {
		if sliceB, okB := b.([]any); okB {
			if len(sliceA) != len(sliceB) {
				return false
			}
			for i := range sliceA {
				if sliceA[i] != sliceB[i] {
					return false
				}
			}
			return true
		}
		return false
	}

	return a == b
}
