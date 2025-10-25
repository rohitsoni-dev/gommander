//go:build wasm

package main

import (
	"fmt"
	"os"
	"syscall/js"

	"github.com/rohitsoni007/gocommander/cmd"
)

var (
	commands = make(map[string]*cmd.Command)
	nextID   = 1
)

// WASMError represents an error that can be serialized to JavaScript
type WASMError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Type    string `json:"type"`
}

// WASMResult represents a standardized result format for WASM functions
type WASMResult struct {
	Success bool       `json:"success"`
	Data    any        `json:"data,omitempty"`
	Error   *WASMError `json:"error,omitempty"`
}

func main() {
	// Keep the program running
	c := make(chan struct{})

	// Export functions to JavaScript with enhanced error handling
	js.Global().Set("gocommander", js.ValueOf(map[string]any{
		// Core command operations
		"createCommand":  wrapFunction(createCommand),
		"destroyCommand": wrapFunction(destroyCommand),
		"cloneCommand":   wrapFunction(cloneCommand),

		// Option management
		"addOption":          wrapFunction(addOption),
		"addBooleanOption":   wrapFunction(addBooleanOption),
		"addVariadicOption":  wrapFunction(addVariadicOption),
		"addNegatableOption": wrapFunction(addNegatableOption),
		"addRequiredOption":  wrapFunction(addRequiredOption),
		"removeOption":       wrapFunction(removeOption),
		"getOption":          wrapFunction(getOption),
		"setOptionParser":    wrapFunction(setOptionParser),
		"setOptionChoices":   wrapFunction(setOptionChoices),
		"setOptionEnv":       wrapFunction(setOptionEnv),
		"setOptionConflicts": wrapFunction(setOptionConflicts),
		"setOptionImplies":   wrapFunction(setOptionImplies),

		// Enhanced option processing
		"processOptionWithEnhancements": wrapFunction(processOptionWithEnhancements),
		"validateOptionGroups":          wrapFunction(validateOptionGroups),
		"getOptionProcessingSummary":    wrapFunction(getOptionProcessingSummary),

		// Argument management
		"addArgument":    wrapFunction(addArgument),
		"removeArgument": wrapFunction(removeArgument),
		"getArgument":    wrapFunction(getArgument),

		// Subcommand management
		"addSubcommand":           wrapFunction(addSubcommand),
		"removeSubcommand":        wrapFunction(removeSubcommand),
		"findSubcommand":          wrapFunction(findSubcommand),
		"setExecutableSubcommand": wrapFunction(setExecutableSubcommand),
		"setDefaultSubcommand":    wrapFunction(setDefaultSubcommand),
		"addCommandAlias":         wrapFunction(addCommandAlias),
		"setCommandAliases":       wrapFunction(setCommandAliases),
		"getSubcommandInfo":       wrapFunction(getSubcommandInfo),

		// Parsing and execution
		"parseArguments":  wrapFunction(parseArguments),
		"validateCommand": wrapFunction(validateCommand),

		// Action and lifecycle
		"setAction":        wrapFunction(setAction),
		"setAsyncAction":   wrapFunction(setAsyncAction),
		"setPreAction":     wrapFunction(setPreAction),
		"setPostAction":    wrapFunction(setPostAction),
		"setPreSubcommand": wrapFunction(setPreSubcommand),
		"addHook":          wrapFunction(addHook),
		"removeHook":       wrapFunction(removeHook),
		"executeAction":    wrapFunction(executeAction),
		"executeHooks":     wrapFunction(executeHooks),
		"getHookInfo":      wrapFunction(getHookInfo),

		// Command information
		"getCommandInfo": wrapFunction(getCommandInfo),
		"getCommandTree": wrapFunction(getCommandTree),
		"getUsage":       wrapFunction(getUsage),
		"getHelp":        wrapFunction(getHelp),

		// Configuration
		"setCommandConfig":         wrapFunction(setCommandConfig),
		"getCommandConfig":         wrapFunction(getCommandConfig),
		"setParsingConfig":         wrapFunction(setParsingConfig),
		"getParsingConfig":         wrapFunction(getParsingConfig),
		"setPositionalOption":      wrapFunction(setPositionalOption),
		"setUnknownOptionHandler":  wrapFunction(setUnknownOptionHandler),
		"setExcessArgumentHandler": wrapFunction(setExcessArgumentHandler),
		"configureOutput":          wrapFunction(configureOutput),
		"configureError":           wrapFunction(configureError),
		"setExitOverride":          wrapFunction(setExitOverride),
		"generateSuggestion":       wrapFunction(generateSuggestion),

		// Version and metadata
		"setVersion": wrapFunction(setVersion),
		"getVersion": wrapFunction(getVersion),

		// Utility functions
		"getAllCommands":   wrapFunction(getAllCommands),
		"clearAllCommands": wrapFunction(clearAllCommands),

		// Memory management functions
		"allocateString":   js.FuncOf(allocateString),
		"freeMemory":       js.FuncOf(freeMemory),
		"readString":       js.FuncOf(readString),
		"createObjectRef":  js.FuncOf(createObjectRef),
		"releaseObjectRef": js.FuncOf(releaseObjectRef),
		"getMemoryStats":   js.FuncOf(getMemoryStats),
		"cleanup":          js.FuncOf(cleanup),

		// Type conversion functions
		"convertGoToJS":  js.FuncOf(convertGoToJS),
		"convertJSToGo":  js.FuncOf(convertJSToGo),
		"serializeError": js.FuncOf(serializeError),
	}))

	<-c
}

// wrapFunction wraps a WASM function with standardized error handling and result formatting
func wrapFunction(fn func([]js.Value) (any, error)) js.Func {
	return js.FuncOf(func(this js.Value, args []js.Value) any {
		result, err := fn(args)

		if err != nil {
			// Use the enhanced error serialization
			serializedError := SerializeError(err)

			// Convert to WASMError format for consistency
			wasmErr := &WASMError{
				Code:    "COMMAND_ERROR",
				Message: err.Error(),
				Type:    "CommanderError",
			}

			if serializedError != nil {
				if code, ok := serializedError["code"].(string); ok {
					wasmErr.Code = code
				}
				if errorType, ok := serializedError["type"].(string); ok {
					wasmErr.Type = errorType
				}
			}

			wasmResult := WASMResult{
				Success: false,
				Error:   wasmErr,
			}

			// Convert result to JS using type converter
			jsResult, convertErr := globalTypeConverter.GoToJS(wasmResult)
			if convertErr != nil {
				// Fallback to basic conversion
				return js.ValueOf(wasmResult)
			}

			return jsResult
		}

		wasmResult := WASMResult{
			Success: true,
			Data:    result,
		}

		// Convert result to JS using type converter
		jsResult, convertErr := globalTypeConverter.GoToJS(wasmResult)
		if convertErr != nil {
			// Fallback to basic conversion
			return js.ValueOf(wasmResult)
		}

		return jsResult
	})
}

// createCommand creates a new command and returns its ID
func createCommand(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("name is required")
	}

	name := args[0].String()
	description := ""
	if len(args) > 1 && !args[1].IsUndefined() {
		description = args[1].String()
	}

	command := cmd.NewCommand(name)
	command.Description = description

	id := generateID()
	commands[id] = command

	return map[string]any{
		"id":          id,
		"name":        name,
		"description": description,
	}, nil
}

// destroyCommand removes a command from memory
func destroyCommand(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	if _, exists := commands[commandID]; !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	delete(commands, commandID)

	return map[string]any{
		"destroyed": true,
		"id":        commandID,
	}, nil
}

// cloneCommand creates a copy of an existing command
func cloneCommand(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	sourceID := args[0].String()
	newName := ""
	if len(args) > 1 && !args[1].IsUndefined() {
		newName = args[1].String()
	}

	sourceCommand, exists := commands[sourceID]
	if !exists {
		return nil, fmt.Errorf("source command not found: %s", sourceID)
	}

	// Create a deep copy of the command
	clonedCommand := cloneCommandDeep(sourceCommand)
	if newName != "" {
		clonedCommand.Name = newName
	}

	newID := generateID()
	commands[newID] = clonedCommand

	return map[string]any{
		"id":       newID,
		"name":     clonedCommand.Name,
		"sourceId": sourceID,
	}, nil
}

// addOption adds an option to a command
func addOption(args []js.Value) (any, error) {
	if len(args) < 3 {
		return nil, fmt.Errorf("commandId, flags, and description are required")
	}

	commandID := args[0].String()
	flags := args[1].String()
	description := args[2].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	option := cmd.NewOption(flags, description)

	// Handle optional parameters
	if len(args) > 3 && !args[3].IsUndefined() {
		defaultValue := jsValueToGo(args[3])
		option.SetDefault(defaultValue)
	}

	if len(args) > 4 && !args[4].IsUndefined() {
		required := args[4].Bool()
		option.SetRequired(required)
	}

	command.AddOption(option)

	return map[string]any{
		"optionFlags": flags,
		"added":       true,
	}, nil
}

// removeOption removes an option from a command
func removeOption(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and optionFlag are required")
	}

	commandID := args[0].String()
	optionFlag := args[1].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Find and remove the option
	for i, option := range command.Options {
		if option.Matches(optionFlag) {
			// Remove option from slice
			command.Options = append(command.Options[:i], command.Options[i+1:]...)
			return map[string]any{
				"removed":     true,
				"optionFlags": option.Flags,
			}, nil
		}
	}

	return nil, fmt.Errorf("option not found: %s", optionFlag)
}

// getOption retrieves information about a specific option
func getOption(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and optionFlag are required")
	}

	commandID := args[0].String()
	optionFlag := args[1].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	for _, option := range command.Options {
		if option.Matches(optionFlag) {
			return serializeOption(option), nil
		}
	}

	return nil, fmt.Errorf("option not found: %s", optionFlag)
}

// addArgument adds an argument to a command
func addArgument(args []js.Value) (any, error) {
	if len(args) < 3 {
		return nil, fmt.Errorf("commandId, name, and description are required")
	}

	commandID := args[0].String()
	name := args[1].String()
	description := args[2].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	argument := cmd.NewArgument(name, description)

	// Handle optional parameters
	if len(args) > 3 && !args[3].IsUndefined() {
		required := args[3].Bool()
		argument.SetRequired(required)
	}

	if len(args) > 4 && !args[4].IsUndefined() {
		variadic := args[4].Bool()
		argument.SetVariadic(variadic)
	}

	command.AddArgument(argument)

	return map[string]any{
		"argumentName": name,
		"added":        true,
	}, nil
}

// removeArgument removes an argument from a command
func removeArgument(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and argumentName are required")
	}

	commandID := args[0].String()
	argumentName := args[1].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Find and remove the argument
	for i, arg := range command.Arguments {
		if arg.Name == argumentName {
			// Remove argument from slice
			command.Arguments = append(command.Arguments[:i], command.Arguments[i+1:]...)
			return map[string]any{
				"removed":      true,
				"argumentName": argumentName,
			}, nil
		}
	}

	return nil, fmt.Errorf("argument not found: %s", argumentName)
}

// getArgument retrieves information about a specific argument
func getArgument(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and argumentName are required")
	}

	commandID := args[0].String()
	argumentName := args[1].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	for _, arg := range command.Arguments {
		if arg.Name == argumentName {
			return serializeArgument(arg), nil
		}
	}

	return nil, fmt.Errorf("argument not found: %s", argumentName)
}

// addSubcommand adds a subcommand to a command
func addSubcommand(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("parentId and childId are required")
	}

	parentID := args[0].String()
	childID := args[1].String()

	parent, exists := commands[parentID]
	if !exists {
		return nil, fmt.Errorf("parent command not found: %s", parentID)
	}

	child, exists := commands[childID]
	if !exists {
		return nil, fmt.Errorf("child command not found: %s", childID)
	}

	parent.AddSubcommand(child)

	return map[string]any{
		"parentId": parentID,
		"childId":  childID,
		"added":    true,
	}, nil
}

// removeSubcommand removes a subcommand from a command
func removeSubcommand(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("parentId and subcommandName are required")
	}

	parentID := args[0].String()
	subcommandName := args[1].String()

	parent, exists := commands[parentID]
	if !exists {
		return nil, fmt.Errorf("parent command not found: %s", parentID)
	}

	// Find and remove the subcommand
	for i, sub := range parent.Subcommands {
		if sub.Name == subcommandName {
			// Remove subcommand from slice
			parent.Subcommands = append(parent.Subcommands[:i], parent.Subcommands[i+1:]...)
			// Clear parent reference
			sub.Parent = nil
			return map[string]any{
				"removed":        true,
				"subcommandName": subcommandName,
			}, nil
		}
	}

	return nil, fmt.Errorf("subcommand not found: %s", subcommandName)
}

// findSubcommand finds a subcommand by name or alias
func findSubcommand(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and subcommandName are required")
	}

	commandID := args[0].String()
	subcommandName := args[1].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	subcommand := command.FindSubcommand(subcommandName)
	if subcommand == nil {
		return nil, fmt.Errorf("subcommand not found: %s", subcommandName)
	}

	// Find the ID of the subcommand
	var subcommandID string
	for id, cmd := range commands {
		if cmd == subcommand {
			subcommandID = id
			break
		}
	}

	return map[string]any{
		"id":   subcommandID,
		"name": subcommand.Name,
		"info": serializeCommand(subcommand),
	}, nil
}

// parseArguments parses command-line arguments
func parseArguments(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and arguments are required")
	}

	commandID := args[0].String()
	jsArgs := args[1]

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Convert JavaScript array to Go slice
	argSlice := make([]string, jsArgs.Length())
	for i := 0; i < jsArgs.Length(); i++ {
		argSlice[i] = jsArgs.Index(i).String()
	}

	parser := cmd.NewParser()
	result, err := parser.ParseCommand(command, argSlice)
	if err != nil {
		return nil, fmt.Errorf("parse error: %v", err)
	}

	// Convert result to JavaScript-friendly format
	return map[string]any{
		"command":    result.Command.Name,
		"options":    result.Options,
		"arguments":  result.Arguments,
		"unknown":    result.Unknown,
		"subcommand": getSubcommandInfoFromParsed(result),
		"rawArgs":    argSlice,
	}, nil
}

// validateCommand validates a command structure
func validateCommand(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	err := command.Validate()
	if err != nil {
		return map[string]any{
			"valid": false,
			"error": err.Error(),
		}, nil
	}

	return map[string]any{
		"valid": true,
	}, nil
}

// setAction sets the action handler for a command
func setAction(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Store a placeholder action handler
	// In a full implementation, this would store a reference to the JS function
	command.SetAction(func(args []string, opts map[string]any) error {
		// This would call back to JavaScript
		return nil
	})

	return map[string]any{
		"actionSet": true,
	}, nil
}

// setPreAction sets the pre-action hook for a command
func setPreAction(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Store a placeholder pre-action handler
	command.PreAction = func(thisCommand *cmd.Command, actionCommand *cmd.Command) error {
		// This would call back to JavaScript
		return nil
	}

	return map[string]any{
		"preActionSet": true,
	}, nil
}

// setPostAction sets the post-action hook for a command
func setPostAction(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Store a placeholder post-action handler
	command.PostAction = func(thisCommand *cmd.Command, actionCommand *cmd.Command) error {
		// This would call back to JavaScript
		return nil
	}

	return map[string]any{
		"postActionSet": true,
	}, nil
}

// setPreSubcommand sets the pre-subcommand hook for a command
func setPreSubcommand(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Store a placeholder pre-subcommand handler
	command.PreSubcommand = func(thisCommand *cmd.Command, subcommand *cmd.Command) error {
		// This would call back to JavaScript
		return nil
	}

	return map[string]any{
		"preSubcommandSet": true,
	}, nil
}

// executeAction executes the action for a command
func executeAction(args []js.Value) (any, error) {
	if len(args) < 3 {
		return nil, fmt.Errorf("commandId, arguments, and options are required")
	}

	commandID := args[0].String()
	jsArgs := args[1]
	jsOpts := args[2]

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	if command.Action == nil {
		return nil, fmt.Errorf("no action handler set for command: %s", command.Name)
	}

	// Convert JavaScript arguments to Go slice
	argSlice := make([]string, jsArgs.Length())
	for i := 0; i < jsArgs.Length(); i++ {
		argSlice[i] = jsArgs.Index(i).String()
	}

	// Convert JavaScript options to Go map
	optsMap := jsObjectToGoMap(jsOpts)

	// Execute the action
	err := command.Action(argSlice, optsMap)
	if err != nil {
		return nil, fmt.Errorf("action execution failed: %v", err)
	}

	return map[string]any{
		"executed": true,
	}, nil
}

// getCommandInfo returns information about a command
func getCommandInfo(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	return serializeCommand(command), nil
}

// getCommandTree returns the full command tree structure
func getCommandTree(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	return serializeCommandTree(command), nil
}

// getUsage returns usage information for a command
func getUsage(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	usage := generateUsage(command)

	return map[string]any{
		"usage":    usage,
		"command":  command.Name,
		"fullName": command.GetFullName(),
	}, nil
}

// getHelp returns help information for a command
func getHelp(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	help := generateHelp(command)

	return map[string]any{
		"help":     help,
		"command":  command.Name,
		"fullName": command.GetFullName(),
	}, nil
}

// Configuration functions
func setCommandConfig(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and config are required")
	}

	commandID := args[0].String()
	jsConfig := args[1]

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Apply configuration from JavaScript object
	config := jsObjectToGoMap(jsConfig)
	applyCommandConfig(command, config)

	return map[string]any{
		"configApplied": true,
	}, nil
}

func getCommandConfig(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	return getCommandConfigMap(command), nil
}

// Version functions
func setVersion(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and version are required")
	}

	commandID := args[0].String()
	version := args[1].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	command.Version = version

	return map[string]any{
		"versionSet": true,
		"version":    version,
	}, nil
}

func getVersion(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	return map[string]any{
		"version": command.Version,
	}, nil
}

// Utility functions
func getAllCommands(args []js.Value) (any, error) {
	result := make(map[string]any)

	for id, command := range commands {
		result[id] = map[string]any{
			"name":        command.Name,
			"description": command.Description,
			"hasParent":   command.Parent != nil,
		}
	}

	return result, nil
}

func clearAllCommands(args []js.Value) (any, error) {
	commands = make(map[string]*cmd.Command)
	nextID = 1

	return map[string]any{
		"cleared": true,
	}, nil
}

// Helper functions

func generateID() string {
	id := fmt.Sprintf("cmd_%d", nextID)
	nextID++
	return id
}

func jsValueToGo(val js.Value) any {
	result, err := globalTypeConverter.JSToGo(val)
	if err != nil {
		// Fallback to basic conversion for compatibility
		switch val.Type() {
		case js.TypeBoolean:
			return val.Bool()
		case js.TypeNumber:
			return val.Float()
		case js.TypeString:
			return val.String()
		case js.TypeUndefined, js.TypeNull:
			return nil
		default:
			return nil
		}
	}
	return result
}

func jsObjectToGoMap(val js.Value) map[string]any {
	if val.Type() != js.TypeObject || val.IsNull() {
		return make(map[string]any)
	}

	result, err := globalTypeConverter.jsObjectToGoMap(val)
	if err != nil {
		// Fallback to basic conversion
		obj := make(map[string]any)
		keys := js.Global().Get("Object").Call("keys", val)
		for i := 0; i < keys.Length(); i++ {
			key := keys.Index(i).String()
			obj[key] = jsValueToGo(val.Get(key))
		}
		return obj
	}
	return result
}

func serializeOption(option *cmd.Option) map[string]any {
	return map[string]any{
		"flags":       option.Flags,
		"description": option.Description,
		"required":    option.Required,
		"variadic":    option.Variadic,
		"default":     option.Default,
		"choices":     option.Choices,
		"short":       option.Short,
		"long":        option.Long,
		"type":        getOptionTypeString(option.Type),
		"negatable":   option.Negatable,
		"hidden":      option.Hidden,
		"env":         option.Env,
	}
}

func serializeArgument(arg *cmd.Argument) map[string]any {
	return map[string]any{
		"name":        arg.Name,
		"description": arg.Description,
		"required":    arg.Required,
		"variadic":    arg.Variadic,
		"default":     arg.Default,
		"choices":     arg.Choices,
	}
}

func serializeCommand(command *cmd.Command) map[string]any {
	options := make([]map[string]any, len(command.Options))
	for i, opt := range command.Options {
		options[i] = serializeOption(opt)
	}

	arguments := make([]map[string]any, len(command.Arguments))
	for i, arg := range command.Arguments {
		arguments[i] = serializeArgument(arg)
	}

	subcommands := make([]string, len(command.Subcommands))
	for i, sub := range command.Subcommands {
		subcommands[i] = sub.Name
	}

	return map[string]any{
		"name":                        command.Name,
		"description":                 command.Description,
		"options":                     options,
		"arguments":                   arguments,
		"subcommands":                 subcommands,
		"aliases":                     command.Aliases,
		"hidden":                      command.Hidden,
		"version":                     command.Version,
		"usage":                       command.Usage,
		"summary":                     command.Summary,
		"allowUnknownOption":          command.AllowUnknownOption,
		"allowExcessArguments":        command.AllowExcessArguments,
		"enablePositionalOptions":     command.EnablePositionalOptions,
		"passThroughOptions":          command.PassThroughOptions,
		"storeOptionsAsProperties":    command.StoreOptionsAsProperties,
		"combineFlagAndOptionalValue": command.CombineFlagAndOptionalValue,
		"showHelpAfterError":          command.ShowHelpAfterError,
		"showSuggestionAfterError":    command.ShowSuggestionAfterError,
		"hasAction":                   command.Action != nil,
		"hasPreAction":                command.PreAction != nil,
		"hasPostAction":               command.PostAction != nil,
		"fullName":                    command.GetFullName(),
		"isExecutable":                command.IsExecutable(),
	}
}

func serializeCommandTree(command *cmd.Command) map[string]any {
	result := serializeCommand(command)

	if len(command.Subcommands) > 0 {
		subcommandTrees := make([]map[string]any, len(command.Subcommands))
		for i, sub := range command.Subcommands {
			subcommandTrees[i] = serializeCommandTree(sub)
		}
		result["subcommandTrees"] = subcommandTrees
	}

	return result
}

func cloneCommandDeep(source *cmd.Command) *cmd.Command {
	clone := cmd.NewCommand(source.Name)
	clone.Description = source.Description
	clone.Version = source.Version
	clone.Usage = source.Usage
	clone.Summary = source.Summary
	clone.Hidden = source.Hidden

	// Copy configuration
	clone.AllowUnknownOption = source.AllowUnknownOption
	clone.AllowExcessArguments = source.AllowExcessArguments
	clone.EnablePositionalOptions = source.EnablePositionalOptions
	clone.PassThroughOptions = source.PassThroughOptions
	clone.StoreOptionsAsProperties = source.StoreOptionsAsProperties
	clone.CombineFlagAndOptionalValue = source.CombineFlagAndOptionalValue
	clone.ShowHelpAfterError = source.ShowHelpAfterError
	clone.ShowSuggestionAfterError = source.ShowSuggestionAfterError

	// Copy aliases
	clone.Aliases = make([]string, len(source.Aliases))
	copy(clone.Aliases, source.Aliases)

	// Clone options (excluding default help option)
	clone.Options = make([]*cmd.Option, 0)
	for _, opt := range source.Options {
		if opt != source.HelpOption {
			clonedOpt := cloneOption(opt)
			clone.Options = append(clone.Options, clonedOpt)
		}
	}

	// Clone arguments
	for _, arg := range source.Arguments {
		clonedArg := cloneArgument(arg)
		clone.Arguments = append(clone.Arguments, clonedArg)
	}

	return clone
}

func cloneOption(source *cmd.Option) *cmd.Option {
	clone := cmd.NewOption(source.Flags, source.Description)
	clone.Required = source.Required
	clone.Variadic = source.Variadic
	clone.Default = source.Default
	clone.Type = source.Type
	clone.Negatable = source.Negatable
	clone.Hidden = source.Hidden
	clone.Env = source.Env

	if len(source.Choices) > 0 {
		clone.Choices = make([]string, len(source.Choices))
		copy(clone.Choices, source.Choices)
	}

	return clone
}

func cloneArgument(source *cmd.Argument) *cmd.Argument {
	clone := cmd.NewArgument(source.Name, source.Description)
	clone.Required = source.Required
	clone.Variadic = source.Variadic
	clone.Default = source.Default

	if len(source.Choices) > 0 {
		clone.Choices = make([]string, len(source.Choices))
		copy(clone.Choices, source.Choices)
	}

	return clone
}

func getSubcommandInfoFromResult(result *cmd.ParseResult) map[string]any {
	if result.Command == nil {
		return nil
	}

	return map[string]any{
		"name":        result.Command.Name,
		"description": result.Command.Description,
		"fullName":    result.Command.GetFullName(),
	}
}

func getSubcommandInfoFromParsed(result *cmd.ParsedCommand) map[string]any {
	if result.Command == nil {
		return nil
	}

	return map[string]any{
		"name":        result.Command.Name,
		"description": result.Command.Description,
		"fullName":    result.Command.GetFullName(),
	}
}

func generateUsage(command *cmd.Command) string {
	usage := command.GetFullName()

	// Add options placeholder
	if len(command.Options) > 0 {
		usage += " [options]"
	}

	// Add arguments
	for _, arg := range command.Arguments {
		if arg.Required {
			if arg.Variadic {
				usage += fmt.Sprintf(" <%s...>", arg.Name)
			} else {
				usage += fmt.Sprintf(" <%s>", arg.Name)
			}
		} else {
			if arg.Variadic {
				usage += fmt.Sprintf(" [%s...]", arg.Name)
			} else {
				usage += fmt.Sprintf(" [%s]", arg.Name)
			}
		}
	}

	// Add subcommands placeholder
	if len(command.Subcommands) > 0 {
		usage += " [command]"
	}

	return usage
}

func generateHelp(command *cmd.Command) string {
	help := fmt.Sprintf("Usage: %s\n", generateUsage(command))

	if command.Description != "" {
		help += fmt.Sprintf("\n%s\n", command.Description)
	}

	// Add options help
	if len(command.Options) > 0 {
		help += "\nOptions:\n"
		for _, opt := range command.Options {
			if !opt.Hidden {
				help += fmt.Sprintf("  %s  %s\n", opt.Flags, opt.Description)
			}
		}
	}

	// Add arguments help
	if len(command.Arguments) > 0 {
		help += "\nArguments:\n"
		for _, arg := range command.Arguments {
			help += fmt.Sprintf("  %s  %s\n", arg.Name, arg.Description)
		}
	}

	// Add subcommands help
	if len(command.Subcommands) > 0 {
		help += "\nCommands:\n"
		for _, sub := range command.Subcommands {
			if !sub.Hidden {
				help += fmt.Sprintf("  %s  %s\n", sub.Name, sub.Description)
			}
		}
	}

	return help
}

func getOptionTypeString(optType cmd.OptionType) string {
	switch optType {
	case cmd.OptionTypeBoolean:
		return "boolean"
	case cmd.OptionTypeString:
		return "string"
	case cmd.OptionTypeNumber:
		return "number"
	case cmd.OptionTypeVariadic:
		return "variadic"
	default:
		return "unknown"
	}
}

func applyCommandConfig(command *cmd.Command, config map[string]any) {
	if val, ok := config["allowUnknownOption"]; ok {
		if boolVal, ok := val.(bool); ok {
			command.AllowUnknownOption = boolVal
		}
	}

	if val, ok := config["allowExcessArguments"]; ok {
		if boolVal, ok := val.(bool); ok {
			command.AllowExcessArguments = boolVal
		}
	}

	if val, ok := config["enablePositionalOptions"]; ok {
		if boolVal, ok := val.(bool); ok {
			command.EnablePositionalOptions = boolVal
		}
	}

	if val, ok := config["passThroughOptions"]; ok {
		if boolVal, ok := val.(bool); ok {
			command.PassThroughOptions = boolVal
		}
	}

	if val, ok := config["storeOptionsAsProperties"]; ok {
		if boolVal, ok := val.(bool); ok {
			command.StoreOptionsAsProperties = boolVal
		}
	}

	if val, ok := config["showHelpAfterError"]; ok {
		if boolVal, ok := val.(bool); ok {
			command.ShowHelpAfterError = boolVal
		}
	}

	if val, ok := config["showSuggestionAfterError"]; ok {
		if boolVal, ok := val.(bool); ok {
			command.ShowSuggestionAfterError = boolVal
		}
	}
}

func getCommandConfigMap(command *cmd.Command) map[string]any {
	return map[string]any{
		"allowUnknownOption":          command.AllowUnknownOption,
		"allowExcessArguments":        command.AllowExcessArguments,
		"enablePositionalOptions":     command.EnablePositionalOptions,
		"passThroughOptions":          command.PassThroughOptions,
		"storeOptionsAsProperties":    command.StoreOptionsAsProperties,
		"combineFlagAndOptionalValue": command.CombineFlagAndOptionalValue,
		"showHelpAfterError":          command.ShowHelpAfterError,
		"showSuggestionAfterError":    command.ShowSuggestionAfterError,
	}
}

// addBooleanOption adds a boolean option to a command
func addBooleanOption(args []js.Value) (any, error) {
	if len(args) < 3 {
		return nil, fmt.Errorf("commandId, flags, and description are required")
	}

	commandID := args[0].String()
	flags := args[1].String()
	description := args[2].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	option := cmd.NewBooleanOption(flags, description)

	// Handle optional parameters
	if len(args) > 3 && !args[3].IsUndefined() {
		defaultValue := args[3].Bool()
		option.SetDefault(defaultValue)
	}

	command.AddOption(option)

	return map[string]any{
		"optionFlags": flags,
		"type":        "boolean",
		"added":       true,
	}, nil
}

// addVariadicOption adds a variadic option to a command
func addVariadicOption(args []js.Value) (any, error) {
	if len(args) < 3 {
		return nil, fmt.Errorf("commandId, flags, and description are required")
	}

	commandID := args[0].String()
	flags := args[1].String()
	description := args[2].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	option := cmd.NewVariadicOption(flags, description)

	command.AddOption(option)

	return map[string]any{
		"optionFlags": flags,
		"type":        "variadic",
		"added":       true,
	}, nil
}

// addNegatableOption adds a negatable boolean option to a command
func addNegatableOption(args []js.Value) (any, error) {
	if len(args) < 3 {
		return nil, fmt.Errorf("commandId, flags, and description are required")
	}

	commandID := args[0].String()
	flags := args[1].String()
	description := args[2].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	option := cmd.CreateNegatableOption(flags, description)

	command.AddOption(option)

	return map[string]any{
		"optionFlags": flags,
		"type":        "negatable",
		"added":       true,
	}, nil
}

// addRequiredOption adds a required option to a command
func addRequiredOption(args []js.Value) (any, error) {
	if len(args) < 3 {
		return nil, fmt.Errorf("commandId, flags, and description are required")
	}

	commandID := args[0].String()
	flags := args[1].String()
	description := args[2].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	option := cmd.CreateRequiredOption(flags, description)

	// Handle optional default value
	if len(args) > 3 && !args[3].IsUndefined() {
		defaultValue := jsValueToGo(args[3])
		option.SetDefault(defaultValue)
	}

	command.AddOption(option)

	return map[string]any{
		"optionFlags": flags,
		"required":    true,
		"added":       true,
	}, nil
}

// setOptionParser sets a custom parser for an option (placeholder for now)
func setOptionParser(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and optionFlag are required")
	}

	commandID := args[0].String()
	optionFlag := args[1].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Find the option
	var targetOption *cmd.Option
	for _, option := range command.Options {
		if option.Matches(optionFlag) {
			targetOption = option
			break
		}
	}

	if targetOption == nil {
		return nil, fmt.Errorf("option not found: %s", optionFlag)
	}

	// For now, just acknowledge that a parser was set
	// In a full implementation, this would store a reference to the JS function
	// and create a Go wrapper that calls back to JavaScript

	return map[string]any{
		"parserSet": true,
		"option":    optionFlag,
	}, nil
}

// setOptionChoices sets choices for an option
func setOptionChoices(args []js.Value) (any, error) {
	if len(args) < 3 {
		return nil, fmt.Errorf("commandId, optionFlag, and choices are required")
	}

	commandID := args[0].String()
	optionFlag := args[1].String()
	jsChoices := args[2]

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Find the option
	var targetOption *cmd.Option
	for _, option := range command.Options {
		if option.Matches(optionFlag) {
			targetOption = option
			break
		}
	}

	if targetOption == nil {
		return nil, fmt.Errorf("option not found: %s", optionFlag)
	}

	// Convert JavaScript array to Go slice
	if !jsChoices.InstanceOf(js.Global().Get("Array")) {
		return nil, fmt.Errorf("choices must be an array")
	}

	choices := make([]string, jsChoices.Length())
	for i := 0; i < jsChoices.Length(); i++ {
		choices[i] = jsChoices.Index(i).String()
	}

	targetOption.SetChoices(choices)

	return map[string]any{
		"choicesSet": true,
		"option":     optionFlag,
		"choices":    choices,
	}, nil
}

// setOptionEnv sets environment variable for an option
func setOptionEnv(args []js.Value) (any, error) {
	if len(args) < 3 {
		return nil, fmt.Errorf("commandId, optionFlag, and envVar are required")
	}

	commandID := args[0].String()
	optionFlag := args[1].String()
	envVar := args[2].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Find the option
	var targetOption *cmd.Option
	for _, option := range command.Options {
		if option.Matches(optionFlag) {
			targetOption = option
			break
		}
	}

	if targetOption == nil {
		return nil, fmt.Errorf("option not found: %s", optionFlag)
	}

	targetOption.SetEnv(envVar)

	return map[string]any{
		"envSet": true,
		"option": optionFlag,
		"envVar": envVar,
	}, nil
}

// setOptionConflicts sets conflicting options
func setOptionConflicts(args []js.Value) (any, error) {
	if len(args) < 3 {
		return nil, fmt.Errorf("commandId, optionFlag, and conflicts are required")
	}

	commandID := args[0].String()
	optionFlag := args[1].String()
	jsConflicts := args[2]

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Find the option
	var targetOption *cmd.Option
	for _, option := range command.Options {
		if option.Matches(optionFlag) {
			targetOption = option
			break
		}
	}

	if targetOption == nil {
		return nil, fmt.Errorf("option not found: %s", optionFlag)
	}

	// Convert JavaScript array to Go slice
	if !jsConflicts.InstanceOf(js.Global().Get("Array")) {
		return nil, fmt.Errorf("conflicts must be an array")
	}

	conflicts := make([]string, jsConflicts.Length())
	for i := 0; i < jsConflicts.Length(); i++ {
		conflicts[i] = jsConflicts.Index(i).String()
	}

	targetOption.SetConflicts(conflicts)

	return map[string]any{
		"conflictsSet": true,
		"option":       optionFlag,
		"conflicts":    conflicts,
	}, nil
}

// setOptionImplies sets implied options
func setOptionImplies(args []js.Value) (any, error) {
	if len(args) < 3 {
		return nil, fmt.Errorf("commandId, optionFlag, and implies are required")
	}

	commandID := args[0].String()
	optionFlag := args[1].String()
	jsImplies := args[2]

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Find the option
	var targetOption *cmd.Option
	for _, option := range command.Options {
		if option.Matches(optionFlag) {
			targetOption = option
			break
		}
	}

	if targetOption == nil {
		return nil, fmt.Errorf("option not found: %s", optionFlag)
	}

	// Convert JavaScript array to Go slice
	if !jsImplies.InstanceOf(js.Global().Get("Array")) {
		return nil, fmt.Errorf("implies must be an array")
	}

	implies := make([]string, jsImplies.Length())
	for i := 0; i < jsImplies.Length(); i++ {
		implies[i] = jsImplies.Index(i).String()
	}

	targetOption.SetImplies(implies)

	return map[string]any{
		"impliesSet": true,
		"option":     optionFlag,
		"implies":    implies,
	}, nil
}

// processOptionWithEnhancements processes an option with enhanced features
func processOptionWithEnhancements(args []js.Value) (any, error) {
	if len(args) < 3 {
		return nil, fmt.Errorf("commandId, flag, and value are required")
	}

	commandID := args[0].String()
	flag := args[1].String()
	value := args[2].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Create enhanced option processor
	processor := cmd.NewEnhancedOptionProcessor()

	// Add all command options to processor
	for _, option := range command.Options {
		if err := processor.AddOption(option); err != nil {
			return nil, fmt.Errorf("failed to add option to processor: %v", err)
		}
	}

	// Process the option with enhancements
	if err := processor.ProcessOptionWithEnhancements(flag, value); err != nil {
		return nil, err
	}

	// Validate all options
	if err := processor.ValidateEnhanced(); err != nil {
		return nil, err
	}

	return map[string]any{
		"processed": true,
		"flag":      flag,
		"value":     value,
		"values":    processor.GetValues(),
	}, nil
}

// validateOptionGroups validates option groups for a command
func validateOptionGroups(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Create enhanced option processor
	processor := cmd.NewEnhancedOptionProcessor()

	// Add all command options to processor
	for _, option := range command.Options {
		if err := processor.AddOption(option); err != nil {
			return nil, fmt.Errorf("failed to add option to processor: %v", err)
		}
	}

	// Validate enhanced features
	if err := processor.ValidateEnhanced(); err != nil {
		return map[string]any{
			"valid": false,
			"error": err.Error(),
		}, nil
	}

	return map[string]any{
		"valid": true,
	}, nil
}

// getOptionProcessingSummary returns processing summary
func getOptionProcessingSummary(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Create contextual option processor
	processor := cmd.NewContextualOptionProcessor()

	// Add all command options to processor
	for _, option := range command.Options {
		if err := processor.AddOption(option); err != nil {
			return nil, fmt.Errorf("failed to add option to processor: %v", err)
		}
	}

	summary := processor.GetOptionProcessingSummary()

	return summary, nil
}

// setExecutableSubcommand configures a subcommand as executable
func setExecutableSubcommand(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and executableFile are required")
	}

	commandID := args[0].String()
	executableFile := args[1].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Set executable configuration
	command.SetExecutable(executableFile)

	// Optional executable directory
	if len(args) > 2 && !args[2].IsUndefined() {
		executableDir := args[2].String()
		command.SetExecutableDir(executableDir)
	}

	return map[string]any{
		"executableSet":  true,
		"executableFile": executableFile,
		"executablePath": command.GetExecutablePath(),
	}, nil
}

// setDefaultSubcommand sets a subcommand as the default
func setDefaultSubcommand(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("parentId and subcommandName are required")
	}

	parentID := args[0].String()
	subcommandName := args[1].String()

	parent, exists := commands[parentID]
	if !exists {
		return nil, fmt.Errorf("parent command not found: %s", parentID)
	}

	// Find the subcommand
	subcommand := parent.FindSubcommandByNameOrAlias(subcommandName)
	if subcommand == nil {
		return nil, fmt.Errorf("subcommand not found: %s", subcommandName)
	}

	// Set as default
	subcommand.SetAsDefault()

	return map[string]any{
		"defaultSet":     true,
		"subcommandName": subcommandName,
		"parentId":       parentID,
	}, nil
}

// addCommandAlias adds an alias to a command
func addCommandAlias(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and alias are required")
	}

	commandID := args[0].String()
	alias := args[1].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	command.AddAlias(alias)

	return map[string]any{
		"aliasAdded": true,
		"alias":      alias,
		"aliases":    command.Aliases,
	}, nil
}

// setCommandAliases sets multiple aliases for a command
func setCommandAliases(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and aliases are required")
	}

	commandID := args[0].String()
	jsAliases := args[1]

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Convert JavaScript array to Go slice
	if !jsAliases.InstanceOf(js.Global().Get("Array")) {
		return nil, fmt.Errorf("aliases must be an array")
	}

	aliases := make([]string, jsAliases.Length())
	for i := 0; i < jsAliases.Length(); i++ {
		aliases[i] = jsAliases.Index(i).String()
	}

	command.SetAliases(aliases)

	return map[string]any{
		"aliasesSet": true,
		"aliases":    aliases,
	}, nil
}

// getSubcommandInfo returns detailed information about subcommands
func getSubcommandInfo(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	subcommands := make([]map[string]any, len(command.Subcommands))
	for i, sub := range command.Subcommands {
		subcommands[i] = map[string]any{
			"name":        sub.Name,
			"description": sub.Description,
			"aliases":     sub.Aliases,
			"hidden":      sub.Hidden,
			"executable":  sub.IsExecutableSubcommand(),
			"isDefault":   sub.IsDefault,
			"hasAction":   sub.Action != nil,
		}
	}

	defaultSubcommand := command.GetDefaultSubcommand()
	var defaultInfo map[string]any
	if defaultSubcommand != nil {
		defaultInfo = map[string]any{
			"name":        defaultSubcommand.Name,
			"description": defaultSubcommand.Description,
		}
	}

	return map[string]any{
		"subcommands":    subcommands,
		"hasSubcommands": command.HasSubcommands(),
		"defaultCommand": defaultInfo,
		"visibleCount":   len(command.GetVisibleSubcommands()),
		"executableDir":  command.ExecutableDir,
	}, nil
}

// setAsyncAction sets an async action handler for a command
func setAsyncAction(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Store a placeholder async action handler
	command.SetAsyncAction(func(args []string, opts map[string]any) <-chan error {
		errChan := make(chan error, 1)
		// This would call back to JavaScript asynchronously
		go func() {
			errChan <- nil
		}()
		return errChan
	})

	return map[string]any{
		"asyncActionSet": true,
	}, nil
}

// addHook adds a lifecycle hook to a command
func addHook(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and hookType are required")
	}

	commandID := args[0].String()
	hookType := args[1].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Convert string to HookEvent
	var event cmd.HookEvent
	switch hookType {
	case "preAction":
		event = cmd.HookEventPreAction
	case "postAction":
		event = cmd.HookEventPostAction
	case "preSubcommand":
		event = cmd.HookEventPreSubcommand
	default:
		return nil, fmt.Errorf("invalid hook type: %s", hookType)
	}

	// Add a placeholder hook handler
	handler := func(thisCommand *cmd.Command, actionCommand *cmd.Command) error {
		// This would call back to JavaScript
		return nil
	}

	command.AddHook(event, handler)

	return map[string]any{
		"hookAdded": true,
		"hookType":  hookType,
		"hookCount": command.GetHookCount(event),
	}, nil
}

// removeHook removes all hooks of a specific type from a command
func removeHook(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and hookType are required")
	}

	commandID := args[0].String()
	hookType := args[1].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Convert string to HookEvent
	var event cmd.HookEvent
	switch hookType {
	case "preAction":
		event = cmd.HookEventPreAction
	case "postAction":
		event = cmd.HookEventPostAction
	case "preSubcommand":
		event = cmd.HookEventPreSubcommand
	default:
		return nil, fmt.Errorf("invalid hook type: %s", hookType)
	}

	command.RemoveHook(event)

	return map[string]any{
		"hookRemoved": true,
		"hookType":    hookType,
		"hookCount":   command.GetHookCount(event),
	}, nil
}

// executeHooks executes all hooks of a specific type
func executeHooks(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and hookType are required")
	}

	commandID := args[0].String()
	hookType := args[1].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Convert string to HookEvent
	var event cmd.HookEvent
	switch hookType {
	case "preAction":
		event = cmd.HookEventPreAction
	case "postAction":
		event = cmd.HookEventPostAction
	case "preSubcommand":
		event = cmd.HookEventPreSubcommand
	default:
		return nil, fmt.Errorf("invalid hook type: %s", hookType)
	}

	// Determine action command (could be self or a subcommand)
	actionCommand := command
	if len(args) > 2 && !args[2].IsUndefined() {
		actionCommandID := args[2].String()
		if actionCmd, exists := commands[actionCommandID]; exists {
			actionCommand = actionCmd
		}
	}

	// Execute the hooks
	err := command.ExecuteHooks(event, actionCommand)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"hooksExecuted": true,
		"hookType":      hookType,
		"hookCount":     command.GetHookCount(event),
	}, nil
}

// getHookInfo returns information about hooks for a command
func getHookInfo(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	return map[string]any{
		"hasHooks":           command.HasHooks(),
		"preActionCount":     command.GetHookCount(cmd.HookEventPreAction),
		"postActionCount":    command.GetHookCount(cmd.HookEventPostAction),
		"preSubcommandCount": command.GetHookCount(cmd.HookEventPreSubcommand),
		"hasAsyncAction":     command.AsyncAction != nil,
		"hasAction":          command.Action != nil,
	}, nil
}

// setParsingConfig sets advanced parsing configuration for a command
func setParsingConfig(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and config are required")
	}

	commandID := args[0].String()
	jsConfig := args[1]

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Apply parsing configuration from JavaScript object
	config := jsObjectToGoMap(jsConfig)

	if val, ok := config["enablePositionalOptions"]; ok {
		if boolVal, ok := val.(bool); ok {
			command.EnablePositionalOptions = boolVal
		}
	}

	if val, ok := config["passThroughOptions"]; ok {
		if boolVal, ok := val.(bool); ok {
			command.PassThroughOptions = boolVal
		}
	}

	if val, ok := config["combineFlagAndOptionalValue"]; ok {
		if boolVal, ok := val.(bool); ok {
			command.CombineFlagAndOptionalValue = boolVal
		}
	}

	return map[string]any{
		"parsingConfigSet": true,
		"config":           config,
	}, nil
}

// getParsingConfig returns the current parsing configuration for a command
func getParsingConfig(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	return map[string]any{
		"enablePositionalOptions":     command.EnablePositionalOptions,
		"passThroughOptions":          command.PassThroughOptions,
		"combineFlagAndOptionalValue": command.CombineFlagAndOptionalValue,
		"allowUnknownOption":          command.AllowUnknownOption,
		"allowExcessArguments":        command.AllowExcessArguments,
	}, nil
}

// setPositionalOption maps a position to an option name for positional parsing
func setPositionalOption(args []js.Value) (any, error) {
	if len(args) < 3 {
		return nil, fmt.Errorf("commandId, position, and optionName are required")
	}

	commandID := args[0].String()
	position := int(args[1].Float())
	optionName := args[2].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// For now, store this configuration in the command
	// In a full implementation, this would be passed to the parser
	if command.PassThroughArgs == nil {
		command.PassThroughArgs = make([]string, 0)
	}

	// Store positional option mapping (simplified for this implementation)
	positionConfig := fmt.Sprintf("pos:%d=%s", position, optionName)
	command.PassThroughArgs = append(command.PassThroughArgs, positionConfig)

	return map[string]any{
		"positionalOptionSet": true,
		"position":            position,
		"optionName":          optionName,
	}, nil
}

// setUnknownOptionHandler sets a custom handler for unknown options
func setUnknownOptionHandler(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// For now, just mark that a custom handler is set
	// In a full implementation, this would store a reference to the JS function
	if command.UnknownOptions == nil {
		command.UnknownOptions = make([]string, 0)
	}
	command.UnknownOptions = append(command.UnknownOptions, "custom_handler_set")

	return map[string]any{
		"unknownOptionHandlerSet": true,
	}, nil
}

// setExcessArgumentHandler sets a custom handler for excess arguments
func setExcessArgumentHandler(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// For now, just mark that a custom handler is set
	// In a full implementation, this would store a reference to the JS function
	if command.PassThroughArgs == nil {
		command.PassThroughArgs = make([]string, 0)
	}
	command.PassThroughArgs = append(command.PassThroughArgs, "excess_handler_set")

	return map[string]any{
		"excessArgumentHandlerSet": true,
	}, nil
}

// configureOutput sets output configuration for a command
func configureOutput(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and config are required")
	}

	commandID := args[0].String()
	jsConfig := args[1]

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Apply output configuration from JavaScript object
	config := jsObjectToGoMap(jsConfig)

	// Create output configuration
	outputConfig := &cmd.OutputConfiguration{}

	// For now, use placeholder functions that would call back to JavaScript
	outputConfig.WriteOut = func(str string) {
		// This would call back to JavaScript writeOut function
		fmt.Print(str)
	}

	outputConfig.WriteErr = func(str string) {
		// This would call back to JavaScript writeErr function
		fmt.Fprint(os.Stderr, str)
	}

	outputConfig.OutputError = func(str string, write func(string)) {
		// This would call back to JavaScript outputError function
		write(str)
	}

	outputConfig.GetOutHelpWidth = func() int {
		// This would call back to JavaScript getOutHelpWidth function
		return 80 // Default width
	}

	outputConfig.GetErrHelpWidth = func() int {
		// This would call back to JavaScript getErrHelpWidth function
		return 80 // Default width
	}

	outputConfig.GetOutHasColors = func() bool {
		// This would call back to JavaScript getOutHasColors function
		return false // Default no colors
	}

	outputConfig.GetErrHasColors = func() bool {
		// This would call back to JavaScript getErrHasColors function
		return false // Default no colors
	}

	outputConfig.StripColor = func(str string) string {
		// This would call back to JavaScript stripColor function
		return str // Default no stripping
	}

	command.ConfigureOutput(outputConfig)

	return map[string]any{
		"outputConfigured": true,
		"config":           config,
	}, nil
}

// configureError sets error configuration for a command
func configureError(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and config are required")
	}

	commandID := args[0].String()
	jsConfig := args[1]

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Apply error configuration from JavaScript object
	config := jsObjectToGoMap(jsConfig)

	// Create error configuration
	errorConfig := &cmd.ErrorConfiguration{}

	if val, ok := config["showHelpAfterError"]; ok {
		if boolVal, ok := val.(bool); ok {
			errorConfig.ShowHelpAfterError = boolVal
		}
	}

	if val, ok := config["showSuggestionAfterError"]; ok {
		if boolVal, ok := val.(bool); ok {
			errorConfig.ShowSuggestionAfterError = boolVal
		}
	}

	// Set placeholder suggestion generator
	errorConfig.SuggestionGenerator = func(unknownCommand string, availableCommands []string) string {
		// This would call back to JavaScript suggestion generator
		return command.GenerateSuggestion(unknownCommand)
	}

	command.ConfigureError(errorConfig)

	return map[string]any{
		"errorConfigured": true,
		"config":          config,
	}, nil
}

// setExitOverride sets a custom exit handler for a command
func setExitOverride(args []js.Value) (any, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("commandId is required")
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	// Set placeholder exit override handler
	command.SetExitOverride(func(err error) {
		// This would call back to JavaScript exit override function
		// For now, just log the error
		fmt.Fprintf(os.Stderr, "Exit override: %v\n", err)
	})

	return map[string]any{
		"exitOverrideSet": true,
	}, nil
}

// generateSuggestion generates a suggestion for an unknown command
func generateSuggestion(args []js.Value) (any, error) {
	if len(args) < 2 {
		return nil, fmt.Errorf("commandId and unknownCommand are required")
	}

	commandID := args[0].String()
	unknownCommand := args[1].String()

	command, exists := commands[commandID]
	if !exists {
		return nil, fmt.Errorf("command not found: %s", commandID)
	}

	suggestion := command.GenerateSuggestion(unknownCommand)

	return map[string]any{
		"suggestion":     suggestion,
		"unknownCommand": unknownCommand,
	}, nil
}
