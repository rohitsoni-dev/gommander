package cmd

import (
	"testing"
)

func TestOptionTypes(t *testing.T) {
	tests := []struct {
		name         string
		createOption func() *Option
		expectedType OptionType
	}{
		{
			name:         "boolean option",
			createOption: func() *Option { return NewBooleanOption("-v, --verbose", "verbose output") },
			expectedType: OptionTypeBoolean,
		},
		{
			name:         "string option",
			createOption: func() *Option { return NewOption("-f, --file <path>", "input file") },
			expectedType: OptionTypeString,
		},
		{
			name:         "variadic option",
			createOption: func() *Option { return NewVariadicOption("-I, --include <dirs...>", "include directories") },
			expectedType: OptionTypeVariadic,
		},
		{
			name:         "negatable option",
			createOption: func() *Option { return CreateNegatableOption("--color", "colorize output") },
			expectedType: OptionTypeBoolean,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			option := tt.createOption()
			if option.Type != tt.expectedType {
				t.Errorf("Expected option type %d, got %d", tt.expectedType, option.Type)
			}
		})
	}
}

func TestNegatableOptions(t *testing.T) {
	option := CreateNegatableOption("--color", "colorize output")

	if !option.Negatable {
		t.Error("Expected option to be negatable")
	}

	if !option.Matches("color") {
		t.Error("Expected option to match 'color'")
	}

	if !option.Matches("no-color") {
		t.Error("Expected option to match 'no-color'")
	}

	if !option.IsNegated("no-color") {
		t.Error("Expected 'no-color' to be recognized as negated")
	}

	if option.IsNegated("color") {
		t.Error("Expected 'color' to not be recognized as negated")
	}
}

func TestOptionValueProcessing(t *testing.T) {
	tests := []struct {
		name          string
		option        *Option
		value         string
		isNegated     bool
		expected      any
		expectedError bool
	}{
		{
			name:      "boolean true",
			option:    NewBooleanOption("-v, --verbose", "verbose"),
			value:     "",
			isNegated: false,
			expected:  true,
		},
		{
			name:      "boolean negated",
			option:    CreateNegatableOption("--color", "colorize"),
			value:     "",
			isNegated: true,
			expected:  false,
		},
		{
			name:     "string value",
			option:   NewOption("-f, --file <path>", "file"),
			value:    "test.txt",
			expected: "test.txt",
		},
		{
			name:     "number value",
			option:   CreateNumberOption("-p, --port <number>", "port"),
			value:    "8080",
			expected: 8080,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := tt.option.ProcessOptionValue(tt.value, nil, tt.isNegated)

			if tt.expectedError && err == nil {
				t.Error("Expected error but got none")
				return
			}

			if !tt.expectedError && err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !tt.expectedError && result != tt.expected {
				t.Errorf("Expected %v, got %v", tt.expected, result)
			}
		})
	}
}

func TestVariadicOptions(t *testing.T) {
	option := NewVariadicOption("-I, --include <dirs...>", "include directories")

	// Test first value
	result1, err := option.ProcessOptionValue("dir1", nil, false)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	// Test second value (should append to first)
	result2, err := option.ProcessOptionValue("dir2", result1, false)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	// Check that we have a slice with both values
	if slice, ok := result2.([]any); ok {
		if len(slice) != 2 {
			t.Errorf("Expected 2 values, got %d", len(slice))
		}
		if slice[0] != "dir1" || slice[1] != "dir2" {
			t.Errorf("Expected [dir1, dir2], got %v", slice)
		}
	} else {
		t.Errorf("Expected slice, got %T", result2)
	}
}

func TestOptionProcessor(t *testing.T) {
	processor := NewOptionProcessor()

	// Add some options
	boolOpt := NewBooleanOption("-v, --verbose", "verbose")
	fileOpt := NewOption("-f, --file <path>", "file")
	negatableOpt := CreateNegatableOption("--color", "colorize")

	processor.AddOption(boolOpt)
	processor.AddOption(fileOpt)
	processor.AddOption(negatableOpt)

	// Test processing
	err := processor.ProcessOption("verbose", "")
	if err != nil {
		t.Errorf("Unexpected error processing boolean option: %v", err)
	}

	err = processor.ProcessOption("file", "test.txt")
	if err != nil {
		t.Errorf("Unexpected error processing file option: %v", err)
	}

	err = processor.ProcessOption("no-color", "")
	if err != nil {
		t.Errorf("Unexpected error processing negated option: %v", err)
	}

	// Validate results
	values := processor.GetValues()

	if values["verbose"] != true {
		t.Errorf("Expected verbose to be true, got %v", values["verbose"])
	}

	if values["file"] != "test.txt" {
		t.Errorf("Expected file to be 'test.txt', got %v", values["file"])
	}

	if values["color"] != false {
		t.Errorf("Expected color to be false, got %v", values["color"])
	}
}

func TestOptionChoices(t *testing.T) {
	option := CreateChoiceOption("-l, --level <level>", "log level", []string{"debug", "info", "warn", "error"})

	// Test valid choice
	result, err := option.ProcessOptionValue("info", nil, false)
	if err != nil {
		t.Errorf("Unexpected error with valid choice: %v", err)
	}
	if result != "info" {
		t.Errorf("Expected 'info', got %v", result)
	}

	// Test invalid choice
	_, err = option.ProcessOptionValue("invalid", nil, false)
	if err == nil {
		t.Error("Expected error with invalid choice")
	}
}

func TestCustomOptionParser(t *testing.T) {
	option := NewOption("-n, --number <num>", "number")

	// Set custom parser that multiplies by 2
	option.SetParser(func(value string, previous any) (any, error) {
		if num, err := DefaultIntParser(value, previous); err == nil {
			return num.(int) * 2, nil
		} else {
			return nil, err
		}
	})

	result, err := option.ProcessOptionValue("5", nil, false)
	if err != nil {
		t.Errorf("Unexpected error with custom parser: %v", err)
	}
	if result != 10 {
		t.Errorf("Expected 10 (5*2), got %v", result)
	}
}
