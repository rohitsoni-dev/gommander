package cmd

import (
	"fmt"
	"strings"
	"testing"
)

func TestCommandCreationAndBasicProperties(t *testing.T) {
	tests := []struct {
		name        string
		commandName string
		description string
	}{
		{"basic command", "test", ""},
		{"command with description", "myapp", "My application"},
		{"empty name", "", ""},
		{"special characters", "test-app_v2", "Test application version 2"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cmd := NewCommand(tt.commandName)
			cmd.Description = tt.description

			if cmd.Name != tt.commandName {
				t.Errorf("Expected name %q, got %q", tt.commandName, cmd.Name)
			}

			if cmd.Description != tt.description {
				t.Errorf("Expected description %q, got %q", tt.description, cmd.Description)
			}

			// Check default initialization
			if cmd.Options == nil {
				t.Error("Options slice should be initialized")
			}
			if cmd.Arguments == nil {
				t.Error("Arguments slice should be initialized")
			}
			if cmd.Subcommands == nil {
				t.Error("Subcommands slice should be initialized")
			}
			if cmd.Aliases == nil {
				t.Error("Aliases slice should be initialized")
			}
			if cmd.Hooks == nil {
				t.Error("Hooks should be initialized")
			}

			// Check default help option is added
			if len(cmd.Options) == 0 {
				t.Error("Default help option should be added")
			}
		})
	}
}

func TestCommandValidation(t *testing.T) {
	tests := []struct {
		name        string
		setupCmd    func() *Command
		expectError bool
		errorMsg    string
	}{
		{
			name: "valid command",
			setupCmd: func() *Command {
				cmd := NewCommand("valid")
				cmd.AddOption(NewOption("-v, --verbose", "verbose output"))
				cmd.AddArgument(NewArgument("<file>", "input file"))
				return cmd
			},
			expectError: false,
		},
		{
			name: "empty command name",
			setupCmd: func() *Command {
				return NewCommand("")
			},
			expectError: true,
			errorMsg:    "command name cannot be empty",
		},
		{
			name: "duplicate short flags",
			setupCmd: func() *Command {
				cmd := NewCommand("test")
				cmd.AddOption(NewOption("-v, --verbose", "verbose"))
				cmd.AddOption(NewOption("-v, --version", "version"))
				return cmd
			},
			expectError: true,
			errorMsg:    "duplicate short flag",
		},
		{
			name: "duplicate long flags",
			setupCmd: func() *Command {
				cmd := NewCommand("test")
				cmd.AddOption(NewOption("-a, --all", "all items"))
				cmd.AddOption(NewOption("-b, --all", "all again"))
				return cmd
			},
			expectError: true,
			errorMsg:    "duplicate long flag",
		},
		{
			name: "required argument after optional",
			setupCmd: func() *Command {
				cmd := NewCommand("test")
				optional := NewArgument("[optional]", "optional arg")
				optional.Required = false
				cmd.AddArgument(optional)
				cmd.AddArgument(NewArgument("<required>", "required arg"))
				return cmd
			},
			expectError: true,
			errorMsg:    "required argument",
		},
		{
			name: "argument after variadic",
			setupCmd: func() *Command {
				cmd := NewCommand("test")
				variadic := NewArgument("<files...>", "files")
				variadic.Variadic = true
				cmd.AddArgument(variadic)
				cmd.AddArgument(NewArgument("<output>", "output"))
				return cmd
			},
			expectError: true,
			errorMsg:    "variadic argument must be the last",
		},
		{
			name: "duplicate subcommand names",
			setupCmd: func() *Command {
				cmd := NewCommand("parent")
				sub1 := NewCommand("duplicate")
				sub2 := NewCommand("duplicate")
				cmd.AddSubcommand(sub1)
				cmd.AddSubcommand(sub2)
				return cmd
			},
			expectError: true,
			errorMsg:    "duplicate subcommand name",
		},
		{
			name: "duplicate subcommand aliases",
			setupCmd: func() *Command {
				cmd := NewCommand("parent")
				sub1 := NewCommand("build")
				sub1.AddAlias("b")
				sub2 := NewCommand("bootstrap")
				sub2.AddAlias("b")
				cmd.AddSubcommand(sub1)
				cmd.AddSubcommand(sub2)
				return cmd
			},
			expectError: true,
			errorMsg:    "duplicate subcommand alias",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cmd := tt.setupCmd()
			err := cmd.Validate()

			if tt.expectError {
				if err == nil {
					t.Error("Expected validation error but got none")
				} else if !strings.Contains(err.Error(), tt.errorMsg) {
					t.Errorf("Expected error containing %q, got %q", tt.errorMsg, err.Error())
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected validation error: %v", err)
				}
			}
		})
	}
}

func TestCommandHierarchy(t *testing.T) {
	parent := NewCommand("parent")
	child1 := NewCommand("child1")
	child2 := NewCommand("child2")
	grandchild := NewCommand("grandchild")

	parent.AddSubcommand(child1)
	parent.AddSubcommand(child2)
	child1.AddSubcommand(grandchild)

	// Test parent-child relationships
	if child1.Parent != parent {
		t.Error("Child1 parent should be parent command")
	}
	if child2.Parent != parent {
		t.Error("Child2 parent should be parent command")
	}
	if grandchild.Parent != child1 {
		t.Error("Grandchild parent should be child1 command")
	}

	// Test command path
	path := grandchild.GetCommandPath()
	expectedPath := []*Command{parent, child1, grandchild}
	if len(path) != len(expectedPath) {
		t.Errorf("Expected path length %d, got %d", len(expectedPath), len(path))
	}
	for i, cmd := range expectedPath {
		if path[i] != cmd {
			t.Errorf("Path element %d: expected %s, got %s", i, cmd.Name, path[i].Name)
		}
	}

	// Test full name
	expectedFullName := "parent child1 grandchild"
	if grandchild.GetFullName() != expectedFullName {
		t.Errorf("Expected full name %q, got %q", expectedFullName, grandchild.GetFullName())
	}
}

func TestCommandAliases(t *testing.T) {
	cmd := NewCommand("build")

	// Test adding single alias
	cmd.AddAlias("b")
	if len(cmd.Aliases) != 1 || cmd.Aliases[0] != "b" {
		t.Error("Failed to add single alias")
	}

	// Test adding duplicate alias (should not duplicate)
	cmd.AddAlias("b")
	if len(cmd.Aliases) != 1 {
		t.Error("Duplicate alias should not be added")
	}

	// Test setting multiple aliases
	cmd.SetAliases([]string{"build-cmd", "compile", "make"})
	expected := []string{"build-cmd", "compile", "make"}
	if len(cmd.Aliases) != len(expected) {
		t.Errorf("Expected %d aliases, got %d", len(expected), len(cmd.Aliases))
	}
	for i, alias := range expected {
		if cmd.Aliases[i] != alias {
			t.Errorf("Alias %d: expected %q, got %q", i, alias, cmd.Aliases[i])
		}
	}
}

func TestCommandFinding(t *testing.T) {
	parent := NewCommand("parent")

	// Add subcommands with aliases
	build := NewCommand("build")
	build.AddAlias("b")
	build.AddAlias("compile")

	test := NewCommand("test")
	test.AddAlias("t")

	deploy := NewCommand("deploy")
	deploy.Hidden = true

	parent.AddSubcommand(build)
	parent.AddSubcommand(test)
	parent.AddSubcommand(deploy)

	tests := []struct {
		name     string
		search   string
		expected *Command
	}{
		{"find by name", "build", build},
		{"find by alias", "b", build},
		{"find by second alias", "compile", build},
		{"find test by name", "test", test},
		{"find test by alias", "t", test},
		{"find hidden command", "deploy", deploy},
		{"not found", "nonexistent", nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parent.FindSubcommand(tt.search)
			if result != tt.expected {
				if tt.expected == nil {
					t.Errorf("Expected nil, got command %q", result.Name)
				} else if result == nil {
					t.Errorf("Expected command %q, got nil", tt.expected.Name)
				} else {
					t.Errorf("Expected command %q, got %q", tt.expected.Name, result.Name)
				}
			}
		})
	}

	// Test visible subcommands
	visible := parent.GetVisibleSubcommands()
	if len(visible) != 2 {
		t.Errorf("Expected 2 visible subcommands, got %d", len(visible))
	}

	// Test has subcommands
	if !parent.HasSubcommands() {
		t.Error("Parent should have subcommands")
	}

	empty := NewCommand("empty")
	if empty.HasSubcommands() {
		t.Error("Empty command should not have subcommands")
	}
}

func TestCommandConfiguration(t *testing.T) {
	cmd := NewCommand("test")

	// Test default configuration
	if cmd.AllowUnknownOption {
		t.Error("AllowUnknownOption should default to false")
	}
	if !cmd.AllowExcessArguments {
		t.Error("AllowExcessArguments should default to true")
	}
	if cmd.EnablePositionalOptions {
		t.Error("EnablePositionalOptions should default to false")
	}

	// Test configuration changes
	cmd.AllowUnknownOption = true
	cmd.AllowExcessArguments = false
	cmd.EnablePositionalOptions = true
	cmd.PassThroughOptions = true
	cmd.StoreOptionsAsProperties = true
	cmd.ShowHelpAfterError = true
	cmd.ShowSuggestionAfterError = false

	if !cmd.AllowUnknownOption {
		t.Error("Failed to set AllowUnknownOption")
	}
	if cmd.AllowExcessArguments {
		t.Error("Failed to set AllowExcessArguments")
	}
	if !cmd.EnablePositionalOptions {
		t.Error("Failed to set EnablePositionalOptions")
	}
	if !cmd.PassThroughOptions {
		t.Error("Failed to set PassThroughOptions")
	}
	if !cmd.StoreOptionsAsProperties {
		t.Error("Failed to set StoreOptionsAsProperties")
	}
	if !cmd.ShowHelpAfterError {
		t.Error("Failed to set ShowHelpAfterError")
	}
	if cmd.ShowSuggestionAfterError {
		t.Error("Failed to set ShowSuggestionAfterError")
	}
}

func TestCommandInheritance(t *testing.T) {
	parent := NewCommand("parent")
	parent.AllowUnknownOption = true
	parent.AllowExcessArguments = false
	parent.EnablePositionalOptions = true
	parent.PassThroughOptions = true
	parent.StoreOptionsAsProperties = true
	parent.ShowHelpAfterError = true
	parent.ShowSuggestionAfterError = false
	parent.ExecutableDir = "/usr/local/bin"

	child := NewCommand("child")
	child.CopyInheritedSettings(parent)

	// Test that settings were copied
	if child.AllowUnknownOption != parent.AllowUnknownOption {
		t.Error("AllowUnknownOption not inherited")
	}
	if child.AllowExcessArguments != parent.AllowExcessArguments {
		t.Error("AllowExcessArguments not inherited")
	}
	if child.EnablePositionalOptions != parent.EnablePositionalOptions {
		t.Error("EnablePositionalOptions not inherited")
	}
	if child.PassThroughOptions != parent.PassThroughOptions {
		t.Error("PassThroughOptions not inherited")
	}
	if child.StoreOptionsAsProperties != parent.StoreOptionsAsProperties {
		t.Error("StoreOptionsAsProperties not inherited")
	}
	if child.ShowHelpAfterError != parent.ShowHelpAfterError {
		t.Error("ShowHelpAfterError not inherited")
	}
	if child.ShowSuggestionAfterError != parent.ShowSuggestionAfterError {
		t.Error("ShowSuggestionAfterError not inherited")
	}
	if child.ExecutableDir != parent.ExecutableDir {
		t.Error("ExecutableDir not inherited")
	}
}

func TestExecutableCommands(t *testing.T) {
	cmd := NewCommand("build")

	// Test default state
	if cmd.IsExecutableSubcommand() {
		t.Error("Command should not be executable by default")
	}

	// Test setting as executable
	cmd.SetExecutable("build-script")
	if !cmd.ExecutableHandler {
		t.Error("ExecutableHandler should be true")
	}
	if cmd.ExecutableFile != "build-script" {
		t.Errorf("Expected ExecutableFile %q, got %q", "build-script", cmd.ExecutableFile)
	}
	if !cmd.IsExecutableSubcommand() {
		t.Error("Command should be executable after SetExecutable")
	}

	// Test executable path
	cmd.SetExecutableDir("/usr/local/bin")
	expectedPath := "/usr/local/bin/build-script"
	if cmd.GetExecutablePath() != expectedPath {
		t.Errorf("Expected executable path %q, got %q", expectedPath, cmd.GetExecutablePath())
	}

	// Test without directory
	cmd.ExecutableDir = ""
	if cmd.GetExecutablePath() != "build-script" {
		t.Errorf("Expected executable path %q, got %q", "build-script", cmd.GetExecutablePath())
	}
}

func TestDefaultSubcommands(t *testing.T) {
	parent := NewCommand("parent")
	serve := NewCommand("serve")
	build := NewCommand("build")

	parent.AddSubcommand(serve)
	parent.AddSubcommand(build)

	// Test setting default subcommand
	serve.SetAsDefault()
	if !serve.IsDefault {
		t.Error("Serve command should be marked as default")
	}
	if parent.DefaultCommand != serve {
		t.Error("Parent should have serve as default command")
	}
	if parent.GetDefaultSubcommand() != serve {
		t.Error("GetDefaultSubcommand should return serve")
	}
}

func TestCommandActions(t *testing.T) {
	cmd := NewCommand("test")

	// Test default state
	if cmd.IsExecutable() {
		t.Error("Command should not be executable without action")
	}

	// Test setting action
	actionCalled := false
	cmd.SetAction(func(args []string, opts map[string]any) error {
		actionCalled = true
		return nil
	})

	if !cmd.IsExecutable() {
		t.Error("Command should be executable with action")
	}

	// Test executing action
	err := cmd.Action([]string{"arg1", "arg2"}, map[string]any{"verbose": true})
	if err != nil {
		t.Errorf("Unexpected error executing action: %v", err)
	}
	if !actionCalled {
		t.Error("Action should have been called")
	}
}

func TestCommandLifecycleHooks(t *testing.T) {
	cmd := NewCommand("test")

	// Test default state
	if cmd.HasHooks() {
		t.Error("Command should not have hooks by default")
	}

	// Test adding hooks
	preActionCalled := false
	postActionCalled := false
	preSubcommandCalled := false

	cmd.AddHook(HookEventPreAction, func(thisCmd, actionCmd *Command) error {
		preActionCalled = true
		return nil
	})

	cmd.AddHook(HookEventPostAction, func(thisCmd, actionCmd *Command) error {
		postActionCalled = true
		return nil
	})

	cmd.AddHook(HookEventPreSubcommand, func(thisCmd, actionCmd *Command) error {
		preSubcommandCalled = true
		return nil
	})

	if !cmd.HasHooks() {
		t.Error("Command should have hooks after adding them")
	}

	// Test hook counts
	if cmd.GetHookCount(HookEventPreAction) != 1 {
		t.Errorf("Expected 1 pre-action hook, got %d", cmd.GetHookCount(HookEventPreAction))
	}
	if cmd.GetHookCount(HookEventPostAction) != 1 {
		t.Errorf("Expected 1 post-action hook, got %d", cmd.GetHookCount(HookEventPostAction))
	}
	if cmd.GetHookCount(HookEventPreSubcommand) != 1 {
		t.Errorf("Expected 1 pre-subcommand hook, got %d", cmd.GetHookCount(HookEventPreSubcommand))
	}

	// Test executing hooks
	err := cmd.ExecuteHooks(HookEventPreAction, cmd)
	if err != nil {
		t.Errorf("Unexpected error executing pre-action hooks: %v", err)
	}
	if !preActionCalled {
		t.Error("Pre-action hook should have been called")
	}

	err = cmd.ExecuteHooks(HookEventPostAction, cmd)
	if err != nil {
		t.Errorf("Unexpected error executing post-action hooks: %v", err)
	}
	if !postActionCalled {
		t.Error("Post-action hook should have been called")
	}

	err = cmd.ExecuteHooks(HookEventPreSubcommand, cmd)
	if err != nil {
		t.Errorf("Unexpected error executing pre-subcommand hooks: %v", err)
	}
	if !preSubcommandCalled {
		t.Error("Pre-subcommand hook should have been called")
	}

	// Test removing hooks
	cmd.RemoveHook(HookEventPreAction)
	if cmd.GetHookCount(HookEventPreAction) != 0 {
		t.Error("Pre-action hooks should be removed")
	}
}

func TestCommandWithHooksExecution(t *testing.T) {
	cmd := NewCommand("test")

	preActionCalled := false
	postActionCalled := false
	actionCalled := false

	cmd.AddHook(HookEventPreAction, func(thisCmd, actionCmd *Command) error {
		preActionCalled = true
		return nil
	})

	cmd.AddHook(HookEventPostAction, func(thisCmd, actionCmd *Command) error {
		postActionCalled = true
		return nil
	})

	cmd.SetAction(func(args []string, opts map[string]any) error {
		actionCalled = true
		return nil
	})

	// Test execution with hooks
	err := cmd.ExecuteWithHooks([]string{"arg1"}, map[string]any{"verbose": true})
	if err != nil {
		t.Errorf("Unexpected error executing with hooks: %v", err)
	}

	if !preActionCalled {
		t.Error("Pre-action hook should have been called")
	}
	if !actionCalled {
		t.Error("Action should have been called")
	}
	if !postActionCalled {
		t.Error("Post-action hook should have been called")
	}
}

func TestCommandHookErrors(t *testing.T) {
	cmd := NewCommand("test")

	// Test hook that returns error
	cmd.AddHook(HookEventPreAction, func(thisCmd, actionCmd *Command) error {
		return fmt.Errorf("hook error")
	})

	err := cmd.ExecuteHooks(HookEventPreAction, cmd)
	if err == nil {
		t.Error("Expected error from hook execution")
	}
	if !strings.Contains(err.Error(), "hook error") {
		t.Errorf("Expected error containing 'hook error', got %q", err.Error())
	}
}

func TestCommandOutputConfiguration(t *testing.T) {
	cmd := NewCommand("test")

	// Test default output (should not panic)
	cmd.WriteOut("test output")
	cmd.WriteErr("test error")
	cmd.OutputError("test error message")

	// Test custom output configuration
	var outBuffer, errBuffer strings.Builder

	config := &OutputConfiguration{
		WriteOut: func(str string) {
			outBuffer.WriteString(str)
		},
		WriteErr: func(str string) {
			errBuffer.WriteString(str)
		},
		OutputError: func(str string, write func(string)) {
			write("ERROR: " + str)
		},
	}

	cmd.ConfigureOutput(config)

	cmd.WriteOut("test output")
	cmd.WriteErr("test error")
	cmd.OutputError("test error message")

	if outBuffer.String() != "test output" {
		t.Errorf("Expected output %q, got %q", "test output", outBuffer.String())
	}
	if errBuffer.String() != "test errorERROR: test error message" {
		t.Errorf("Expected error output %q, got %q", "test errorERROR: test error message", errBuffer.String())
	}
}

func TestCommandSuggestionGeneration(t *testing.T) {
	parent := NewCommand("parent")
	parent.AddSubcommand(NewCommand("build"))
	parent.AddSubcommand(NewCommand("test"))
	parent.AddSubcommand(NewCommand("deploy"))

	tests := []struct {
		name     string
		unknown  string
		expected string
	}{
		{"similar command", "buil", "build"},
		{"first letter match", "t", "test"},
		{"no match", "xyz", "Available commands"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			suggestion := parent.GenerateSuggestion(tt.unknown)
			if !strings.Contains(suggestion, tt.expected) {
				t.Errorf("Expected suggestion containing %q, got %q", tt.expected, suggestion)
			}
		})
	}

	// Test custom suggestion generator
	parent.ErrorConfiguration = &ErrorConfiguration{
		SuggestionGenerator: func(unknownCommand string, availableCommands []string) string {
			return fmt.Sprintf("Custom suggestion for %s", unknownCommand)
		},
	}

	suggestion := parent.GenerateSuggestion("unknown")
	expected := "Custom suggestion for unknown"
	if suggestion != expected {
		t.Errorf("Expected custom suggestion %q, got %q", expected, suggestion)
	}
}

func TestCommandHelpGeneration(t *testing.T) {
	cmd := NewCommand("myapp")
	cmd.Description = "My application"
	cmd.AddOption(NewOption("-v, --verbose", "verbose output"))
	cmd.AddArgument(NewArgument("<file>", "input file"))
	cmd.AddSubcommand(NewCommand("build"))

	help := cmd.GenerateHelp()

	// Check that help contains expected elements
	expectedElements := []string{
		"Usage: myapp",
		"My application",
		"Options:",
		"--verbose",
		"Arguments:",
		"file",
		"Commands:",
		"build",
	}

	for _, element := range expectedElements {
		if !strings.Contains(help, element) {
			t.Errorf("Help should contain %q, got:\n%s", element, help)
		}
	}
}

func TestCommandStringRepresentation(t *testing.T) {
	tests := []struct {
		name        string
		commandName string
		description string
		expected    string
	}{
		{"name only", "test", "", "test"},
		{"name and description", "myapp", "My application", "myapp (My application)"},
		{"empty name", "", "description", " (description)"},
		{"empty both", "", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cmd := NewCommand(tt.commandName)
			cmd.Description = tt.description

			result := cmd.String()
			if result != tt.expected {
				t.Errorf("Expected string representation %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestCommandErrorHandling(t *testing.T) {
	cmd := NewCommand("test")

	// Test default error handling (should not panic)
	testErr := fmt.Errorf("test error")

	// This would normally exit, so we can't test it directly
	// But we can test that the method exists and doesn't panic when called
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("HandleError should not panic: %v", r)
		}
	}()

	// Test with exit override
	var capturedError error
	cmd.SetExitOverride(func(err error) {
		capturedError = err
	})

	cmd.HandleError(testErr)

	if capturedError != testErr {
		t.Errorf("Expected captured error %v, got %v", testErr, capturedError)
	}
}

func TestCommandAsyncActions(t *testing.T) {
	cmd := NewCommand("test")

	// Test setting async action
	cmd.SetAsyncAction(func(args []string, opts map[string]any) <-chan error {
		errChan := make(chan error, 1)
		errChan <- nil
		return errChan
	})

	if cmd.AsyncAction == nil {
		t.Error("AsyncAction should be set")
	}

	// Test executing async action through ExecuteWithHooks
	err := cmd.ExecuteWithHooks([]string{"arg1"}, map[string]any{"test": true})
	if err != nil {
		t.Errorf("Unexpected error executing async action: %v", err)
	}
}

func TestCommandComplexScenarios(t *testing.T) {
	// Test complex command hierarchy with multiple levels
	root := NewCommand("myapp")
	root.Description = "My application"
	root.Version = "1.0.0"

	// Add global options
	root.AddOption(NewOption("-v, --verbose", "verbose output"))
	root.AddOption(NewOption("--config <file>", "config file"))

	// Add subcommands
	docker := NewCommand("docker")
	docker.Description = "Docker commands"
	root.AddSubcommand(docker)

	container := NewCommand("container")
	container.Description = "Container commands"
	docker.AddSubcommand(container)

	run := NewCommand("run")
	run.Description = "Run container"
	run.AddArgument(NewArgument("<image>", "container image"))
	run.AddOption(NewOption("-d, --detach", "run in background"))
	container.AddSubcommand(run)

	// Test validation of complex hierarchy
	err := root.Validate()
	if err != nil {
		t.Errorf("Complex command hierarchy should be valid: %v", err)
	}

	// Test full name generation
	expectedFullName := "myapp docker container run"
	if run.GetFullName() != expectedFullName {
		t.Errorf("Expected full name %q, got %q", expectedFullName, run.GetFullName())
	}

	// Test finding nested commands
	foundContainer := docker.FindSubcommand("container")
	if foundContainer != container {
		t.Error("Should find container subcommand")
	}

	foundRun := container.FindSubcommand("run")
	if foundRun != run {
		t.Error("Should find run subcommand")
	}

	// Test command path
	path := run.GetCommandPath()
	expectedPath := []*Command{root, docker, container, run}
	if len(path) != len(expectedPath) {
		t.Errorf("Expected path length %d, got %d", len(expectedPath), len(path))
	}
}
