//go:build wasm

package main

import (
	"syscall/js"

	"github.com/gocommander/gocommander/cmd"
)

var (
	commands = make(map[string]*cmd.Command)
	nextID   = 1
)

func main() {
	// Keep the program running
	c := make(chan struct{}, 0)

	// Export functions to JavaScript
	js.Global().Set("gocommander", js.ValueOf(map[string]interface{}{
		"createCommand":  js.FuncOf(createCommand),
		"addOption":      js.FuncOf(addOption),
		"addArgument":    js.FuncOf(addArgument),
		"addSubcommand":  js.FuncOf(addSubcommand),
		"parseArguments": js.FuncOf(parseArguments),
		"setAction":      js.FuncOf(setAction),
		"getCommandInfo": js.FuncOf(getCommandInfo),
	}))

	<-c
}

// createCommand creates a new command and returns its ID
func createCommand(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return map[string]interface{}{"error": "name is required"}
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

	return map[string]interface{}{
		"id":   id,
		"name": name,
	}
}

// addOption adds an option to a command
func addOption(this js.Value, args []js.Value) interface{} {
	if len(args) < 3 {
		return map[string]interface{}{"error": "commandId, flags, and description are required"}
	}

	commandID := args[0].String()
	flags := args[1].String()
	description := args[2].String()

	command, exists := commands[commandID]
	if !exists {
		return map[string]interface{}{"error": "command not found"}
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

	return map[string]interface{}{"success": true}
}

// addArgument adds an argument to a command
func addArgument(this js.Value, args []js.Value) interface{} {
	if len(args) < 3 {
		return map[string]interface{}{"error": "commandId, name, and description are required"}
	}

	commandID := args[0].String()
	name := args[1].String()
	description := args[2].String()

	command, exists := commands[commandID]
	if !exists {
		return map[string]interface{}{"error": "command not found"}
	}

	argument := cmd.NewArgument(name, description)

	// Handle optional parameters
	if len(args) > 3 && !args[3].IsUndefined() {
		required := args[3].Bool()
		argument.SetRequired(required)
	}

	command.AddArgument(argument)

	return map[string]interface{}{"success": true}
}

// addSubcommand adds a subcommand to a command
func addSubcommand(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return map[string]interface{}{"error": "parentId and childId are required"}
	}

	parentID := args[0].String()
	childID := args[1].String()

	parent, exists := commands[parentID]
	if !exists {
		return map[string]interface{}{"error": "parent command not found"}
	}

	child, exists := commands[childID]
	if !exists {
		return map[string]interface{}{"error": "child command not found"}
	}

	parent.AddSubcommand(child)

	return map[string]interface{}{"success": true}
}

// parseArguments parses command-line arguments
func parseArguments(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return map[string]interface{}{"error": "commandId and arguments are required"}
	}

	commandID := args[0].String()
	jsArgs := args[1]

	command, exists := commands[commandID]
	if !exists {
		return map[string]interface{}{"error": "command not found"}
	}

	// Convert JavaScript array to Go slice
	argSlice := make([]string, jsArgs.Length())
	for i := 0; i < jsArgs.Length(); i++ {
		argSlice[i] = jsArgs.Index(i).String()
	}

	parser := cmd.NewParser()
	result, err := parser.ParseCommand(command, argSlice)
	if err != nil {
		return map[string]interface{}{"error": err.Error()}
	}

	// Convert result to JavaScript-friendly format
	return map[string]interface{}{
		"command":   result.Command.Name,
		"options":   result.Options,
		"arguments": result.Arguments,
		"unknown":   result.Unknown,
	}
}

// setAction sets the action handler for a command (placeholder)
func setAction(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return map[string]interface{}{"error": "commandId is required"}
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return map[string]interface{}{"error": "command not found"}
	}

	// For now, just mark that an action was set
	// In a full implementation, this would store a reference to the JS function
	_ = command

	return map[string]interface{}{"success": true}
}

// getCommandInfo returns information about a command
func getCommandInfo(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return map[string]interface{}{"error": "commandId is required"}
	}

	commandID := args[0].String()

	command, exists := commands[commandID]
	if !exists {
		return map[string]interface{}{"error": "command not found"}
	}

	return map[string]interface{}{
		"name":        command.Name,
		"description": command.Description,
		"options":     len(command.Options),
		"arguments":   len(command.Arguments),
		"subcommands": len(command.Subcommands),
	}
}

// Helper functions

func generateID() string {
	id := nextID
	nextID++
	return string(rune('0' + id))
}

func jsValueToGo(val js.Value) interface{} {
	switch val.Type() {
	case js.TypeBoolean:
		return val.Bool()
	case js.TypeNumber:
		return val.Float()
	case js.TypeString:
		return val.String()
	case js.TypeObject:
		if val.InstanceOf(js.Global().Get("Array")) {
			length := val.Length()
			slice := make([]interface{}, length)
			for i := 0; i < length; i++ {
				slice[i] = jsValueToGo(val.Index(i))
			}
			return slice
		}
		// Handle objects
		obj := make(map[string]interface{})
		// Note: In a full implementation, you'd iterate over object properties
		return obj
	default:
		return nil
	}
}
