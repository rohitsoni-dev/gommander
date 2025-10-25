//go:build wasm

package main

import (
	"fmt"
	"syscall/js"
	"testing"

	"github.com/rohitsoni007/gocommander/cmd"
)

func TestCreateCommand(t *testing.T) {
	// Clear commands before test
	commands = make(map[string]*cmd.Command)
	nextID = 1

	tests := []struct {
		name        string
		args        []js.Value
		expectError bool
		checkResult func(any) bool
	}{
		{
			name: "create command with name only",
			args: []js.Value{js.ValueOf("test")},
			checkResult: func(result any) bool {
				r := result.(map[string]any)
				return r["name"] == "test" && r["description"] == ""
			},
		},
		{
			name: "create command with name and description",
			args: []js.Value{js.ValueOf("myapp"), js.ValueOf("My application")},
			checkResult: func(result any) bool {
				r := result.(map[string]any)
				return r["name"] == "myapp" && r["description"] == "My application"
			},
		},
		{
			name:        "create command without name",
			args:        []js.Value{},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := createCommand(tt.args)

			if tt.expectError && err == nil {
				t.Error("Expected error but got none")
				return
			}

			if !tt.expectError && err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !tt.expectError && tt.checkResult != nil && !tt.checkResult(result) {
				t.Errorf("Result validation failed: %v", result)
			}
		})
	}
}

func TestCommandLifecycle(t *testing.T) {
	// Clear commands before test
	commands = make(map[string]*cmd.Command)
	nextID = 1

	// Create a command
	result, err := createCommand([]js.Value{js.ValueOf("test")})
	if err != nil {
		t.Fatalf("Failed to create command: %v", err)
	}

	commandID := result.(map[string]any)["id"].(string)

	// Test adding options
	_, err = addOption([]js.Value{
		js.ValueOf(commandID),
		js.ValueOf("-v, --verbose"),
		js.ValueOf("verbose output"),
	})
	if err != nil {
		t.Errorf("Failed to add option: %v", err)
	}

	// Test adding arguments
	_, err = addArgument([]js.Value{
		js.ValueOf(commandID),
		js.ValueOf("<file>"),
		js.ValueOf("input file"),
	})
	if err != nil {
		t.Errorf("Failed to add argument: %v", err)
	}

	// Test getting command info
	info, err := getCommandInfo([]js.Value{js.ValueOf(commandID)})
	if err != nil {
		t.Errorf("Failed to get command info: %v", err)
	}

	infoMap := info.(map[string]any)
	if infoMap["name"] != "test" {
		t.Errorf("Expected command name 'test', got %v", infoMap["name"])
	}

	// Test destroying command
	_, err = destroyCommand([]js.Value{js.ValueOf(commandID)})
	if err != nil {
		t.Errorf("Failed to destroy command: %v", err)
	}

	// Verify command is destroyed
	_, err = getCommandInfo([]js.Value{js.ValueOf(commandID)})
	if err == nil {
		t.Error("Expected error after destroying command")
	}
}

func TestOptionManagement(t *testing.T) {
	// Clear commands before test
	commands = make(map[string]*cmd.Command)
	nextID = 1

	// Create a command
	result, err := createCommand([]js.Value{js.ValueOf("test")})
	if err != nil {
		t.Fatalf("Failed to create command: %v", err)
	}

	commandID := result.(map[string]any)["id"].(string)

	tests := []struct {
		name        string
		optionType  string
		flags       string
		description string
		expectError bool
	}{
		{
			name:        "boolean option",
			optionType:  "boolean",
			flags:       "-v, --verbose",
			description: "verbose output",
		},
		{
			name:        "variadic option",
			optionType:  "variadic",
			flags:       "-I, --include <dirs...>",
			description: "include directories",
		},
		{
			name:        "negatable option",
			optionType:  "negatable",
			flags:       "--color",
			description: "colorize output",
		},
		{
			name:        "required option",
			optionType:  "required",
			flags:       "-f, --file <path>",
			description: "input file",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var result any
			var err error

			switch tt.optionType {
			case "boolean":
				result, err = addBooleanOption([]js.Value{
					js.ValueOf(commandID),
					js.ValueOf(tt.flags),
					js.ValueOf(tt.description),
				})
			case "variadic":
				result, err = addVariadicOption([]js.Value{
					js.ValueOf(commandID),
					js.ValueOf(tt.flags),
					js.ValueOf(tt.description),
				})
			case "negatable":
				result, err = addNegatableOption([]js.Value{
					js.ValueOf(commandID),
					js.ValueOf(tt.flags),
					js.ValueOf(tt.description),
				})
			case "required":
				result, err = addRequiredOption([]js.Value{
					js.ValueOf(commandID),
					js.ValueOf(tt.flags),
					js.ValueOf(tt.description),
				})
			}

			if tt.expectError && err == nil {
				t.Error("Expected error but got none")
				return
			}

			if !tt.expectError && err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !tt.expectError {
				resultMap := result.(map[string]any)
				if resultMap["optionFlags"] != tt.flags {
					t.Errorf("Expected flags %s, got %v", tt.flags, resultMap["optionFlags"])
				}
			}
		})
	}
}

func TestArgumentParsing(t *testing.T) {
	// Clear commands before test
	commands = make(map[string]*cmd.Command)
	nextID = 1

	// Create a command with options and arguments
	result, err := createCommand([]js.Value{js.ValueOf("test")})
	if err != nil {
		t.Fatalf("Failed to create command: %v", err)
	}

	commandID := result.(map[string]any)["id"].(string)

	// Add a boolean option
	_, err = addBooleanOption([]js.Value{
		js.ValueOf(commandID),
		js.ValueOf("-v, --verbose"),
		js.ValueOf("verbose output"),
	})
	if err != nil {
		t.Fatalf("Failed to add option: %v", err)
	}

	// Add an argument
	_, err = addArgument([]js.Value{
		js.ValueOf(commandID),
		js.ValueOf("<file>"),
		js.ValueOf("input file"),
		js.ValueOf(true), // required
	})
	if err != nil {
		t.Fatalf("Failed to add argument: %v", err)
	}

	tests := []struct {
		name        string
		args        []string
		expectError bool
		checkResult func(any) bool
	}{
		{
			name: "parse with option and argument",
			args: []string{"-v", "test.txt"},
			checkResult: func(result any) bool {
				r := result.(map[string]any)
				options := r["options"].(map[string]any)
				arguments := r["arguments"].([]any)
				return options["verbose"] == true && len(arguments) == 1 && arguments[0] == "test.txt"
			},
		},
		{
			name: "parse with long option",
			args: []string{"--verbose", "test.txt"},
			checkResult: func(result any) bool {
				r := result.(map[string]any)
				options := r["options"].(map[string]any)
				return options["verbose"] == true
			},
		},
		{
			name:        "parse missing required argument",
			args:        []string{"-v"},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Convert args to JS array
			jsArgs := js.Global().Get("Array").New(len(tt.args))
			for i, arg := range tt.args {
				jsArgs.SetIndex(i, js.ValueOf(arg))
			}

			result, err := parseArguments([]js.Value{
				js.ValueOf(commandID),
				jsArgs,
			})

			if tt.expectError && err == nil {
				t.Error("Expected error but got none")
				return
			}

			if !tt.expectError && err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !tt.expectError && tt.checkResult != nil && !tt.checkResult(result) {
				t.Errorf("Result validation failed: %v", result)
			}
		})
	}
}

func TestSubcommandManagement(t *testing.T) {
	// Clear commands before test
	commands = make(map[string]*cmd.Command)
	nextID = 1

	// Create parent command
	parentResult, err := createCommand([]js.Value{js.ValueOf("parent")})
	if err != nil {
		t.Fatalf("Failed to create parent command: %v", err)
	}
	parentID := parentResult.(map[string]any)["id"].(string)

	// Create child command
	childResult, err := createCommand([]js.Value{js.ValueOf("child")})
	if err != nil {
		t.Fatalf("Failed to create child command: %v", err)
	}
	childID := childResult.(map[string]any)["id"].(string)

	// Add child to parent
	_, err = addSubcommand([]js.Value{
		js.ValueOf(parentID),
		js.ValueOf(childID),
	})
	if err != nil {
		t.Errorf("Failed to add subcommand: %v", err)
	}

	// Test finding subcommand
	foundResult, err := findSubcommand([]js.Value{
		js.ValueOf(parentID),
		js.ValueOf("child"),
	})
	if err != nil {
		t.Errorf("Failed to find subcommand: %v", err)
	}

	foundMap := foundResult.(map[string]any)
	if foundMap["name"] != "child" {
		t.Errorf("Expected subcommand name 'child', got %v", foundMap["name"])
	}

	// Test adding alias
	_, err = addCommandAlias([]js.Value{
		js.ValueOf(childID),
		js.ValueOf("c"),
	})
	if err != nil {
		t.Errorf("Failed to add alias: %v", err)
	}

	// Test finding by alias
	foundByAlias, err := findSubcommand([]js.Value{
		js.ValueOf(parentID),
		js.ValueOf("c"),
	})
	if err != nil {
		t.Errorf("Failed to find subcommand by alias: %v", err)
	}

	aliasMap := foundByAlias.(map[string]any)
	if aliasMap["name"] != "child" {
		t.Errorf("Expected subcommand name 'child' when found by alias, got %v", aliasMap["name"])
	}
}

func TestCommandValidation(t *testing.T) {
	// Clear commands before test
	commands = make(map[string]*cmd.Command)
	nextID = 1

	// Create a valid command
	result, err := createCommand([]js.Value{js.ValueOf("test")})
	if err != nil {
		t.Fatalf("Failed to create command: %v", err)
	}

	commandID := result.(map[string]any)["id"].(string)

	// Add valid option
	_, err = addOption([]js.Value{
		js.ValueOf(commandID),
		js.ValueOf("-v, --verbose"),
		js.ValueOf("verbose output"),
	})
	if err != nil {
		t.Fatalf("Failed to add option: %v", err)
	}

	// Test validation
	validationResult, err := validateCommand([]js.Value{js.ValueOf(commandID)})
	if err != nil {
		t.Errorf("Unexpected error during validation: %v", err)
	}

	validationMap := validationResult.(map[string]any)
	if !validationMap["valid"].(bool) {
		t.Errorf("Expected command to be valid, got: %v", validationMap)
	}
}

func TestHookManagement(t *testing.T) {
	// Clear commands before test
	commands = make(map[string]*cmd.Command)
	nextID = 1

	// Create a command
	result, err := createCommand([]js.Value{js.ValueOf("test")})
	if err != nil {
		t.Fatalf("Failed to create command: %v", err)
	}

	commandID := result.(map[string]any)["id"].(string)

	// Test adding hooks
	hookTypes := []string{"preAction", "postAction", "preSubcommand"}

	for _, hookType := range hookTypes {
		_, err = addHook([]js.Value{
			js.ValueOf(commandID),
			js.ValueOf(hookType),
		})
		if err != nil {
			t.Errorf("Failed to add %s hook: %v", hookType, err)
		}
	}

	// Test getting hook info
	hookInfo, err := getHookInfo([]js.Value{js.ValueOf(commandID)})
	if err != nil {
		t.Errorf("Failed to get hook info: %v", err)
	}

	hookInfoMap := hookInfo.(map[string]any)
	if !hookInfoMap["hasHooks"].(bool) {
		t.Error("Expected command to have hooks")
	}

	// Test executing hooks
	for _, hookType := range hookTypes {
		_, err = executeHooks([]js.Value{
			js.ValueOf(commandID),
			js.ValueOf(hookType),
		})
		if err != nil {
			t.Errorf("Failed to execute %s hooks: %v", hookType, err)
		}
	}

	// Test removing hooks
	for _, hookType := range hookTypes {
		_, err = removeHook([]js.Value{
			js.ValueOf(commandID),
			js.ValueOf(hookType),
		})
		if err != nil {
			t.Errorf("Failed to remove %s hook: %v", hookType, err)
		}
	}
}

func TestConfigurationManagement(t *testing.T) {
	// Clear commands before test
	commands = make(map[string]*cmd.Command)
	nextID = 1

	// Create a command
	result, err := createCommand([]js.Value{js.ValueOf("test")})
	if err != nil {
		t.Fatalf("Failed to create command: %v", err)
	}

	commandID := result.(map[string]any)["id"].(string)

	// Test setting command configuration
	configObj := js.Global().Get("Object").New()
	configObj.Set("allowUnknownOption", true)
	configObj.Set("showHelpAfterError", false)

	_, err = setCommandConfig([]js.Value{
		js.ValueOf(commandID),
		configObj,
	})
	if err != nil {
		t.Errorf("Failed to set command config: %v", err)
	}

	// Test getting command configuration
	configResult, err := getCommandConfig([]js.Value{js.ValueOf(commandID)})
	if err != nil {
		t.Errorf("Failed to get command config: %v", err)
	}

	configMap := configResult.(map[string]any)
	if !configMap["allowUnknownOption"].(bool) {
		t.Error("Expected allowUnknownOption to be true")
	}

	// Test setting parsing configuration
	parsingConfigObj := js.Global().Get("Object").New()
	parsingConfigObj.Set("enablePositionalOptions", true)
	parsingConfigObj.Set("passThroughOptions", true)

	_, err = setParsingConfig([]js.Value{
		js.ValueOf(commandID),
		parsingConfigObj,
	})
	if err != nil {
		t.Errorf("Failed to set parsing config: %v", err)
	}

	// Test getting parsing configuration
	parsingResult, err := getParsingConfig([]js.Value{js.ValueOf(commandID)})
	if err != nil {
		t.Errorf("Failed to get parsing config: %v", err)
	}

	parsingMap := parsingResult.(map[string]any)
	if !parsingMap["enablePositionalOptions"].(bool) {
		t.Error("Expected enablePositionalOptions to be true")
	}
}

func TestUtilityFunctions(t *testing.T) {
	// Clear commands before test
	commands = make(map[string]*cmd.Command)
	nextID = 1

	// Create multiple commands
	for i := 0; i < 3; i++ {
		_, err := createCommand([]js.Value{js.ValueOf(fmt.Sprintf("test%d", i))})
		if err != nil {
			t.Fatalf("Failed to create command %d: %v", i, err)
		}
	}

	// Test getting all commands
	allCommands, err := getAllCommands([]js.Value{})
	if err != nil {
		t.Errorf("Failed to get all commands: %v", err)
	}

	allCommandsMap := allCommands.(map[string]any)
	if len(allCommandsMap) != 3 {
		t.Errorf("Expected 3 commands, got %d", len(allCommandsMap))
	}

	// Test clearing all commands
	_, err = clearAllCommands([]js.Value{})
	if err != nil {
		t.Errorf("Failed to clear all commands: %v", err)
	}

	// Verify commands are cleared
	allCommandsAfter, err := getAllCommands([]js.Value{})
	if err != nil {
		t.Errorf("Failed to get all commands after clear: %v", err)
	}

	allCommandsAfterMap := allCommandsAfter.(map[string]any)
	if len(allCommandsAfterMap) != 0 {
		t.Errorf("Expected 0 commands after clear, got %d", len(allCommandsAfterMap))
	}
}

func TestErrorHandling(t *testing.T) {
	// Clear commands before test
	commands = make(map[string]*cmd.Command)
	nextID = 1

	tests := []struct {
		name     string
		function func() (any, error)
	}{
		{
			name: "get non-existent command",
			function: func() (any, error) {
				return getCommandInfo([]js.Value{js.ValueOf("nonexistent")})
			},
		},
		{
			name: "add option to non-existent command",
			function: func() (any, error) {
				return addOption([]js.Value{
					js.ValueOf("nonexistent"),
					js.ValueOf("-v"),
					js.ValueOf("verbose"),
				})
			},
		},
		{
			name: "parse with non-existent command",
			function: func() (any, error) {
				jsArgs := js.Global().Get("Array").New(0)
				return parseArguments([]js.Value{
					js.ValueOf("nonexistent"),
					jsArgs,
				})
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := tt.function()
			if err == nil {
				t.Error("Expected error but got none")
			}
		})
	}
}
