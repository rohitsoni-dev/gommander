package cmd

import (
	"fmt"
	"runtime"
	"sync"
	"testing"
	"time"
)

// TestStressCommandCreation tests creating many commands concurrently
func TestStressCommandCreation(t *testing.T) {
	const numCommands = 1000
	const numGoroutines = 10

	var wg sync.WaitGroup
	commands := make([]*Command, numCommands)
	errors := make([]error, numCommands)

	commandsPerGoroutine := numCommands / numGoroutines

	for g := 0; g < numGoroutines; g++ {
		wg.Add(1)
		go func(goroutineID int) {
			defer wg.Done()

			start := goroutineID * commandsPerGoroutine
			end := start + commandsPerGoroutine
			if goroutineID == numGoroutines-1 {
				end = numCommands // Handle remainder
			}

			for i := start; i < end; i++ {
				cmd := NewCommand(fmt.Sprintf("cmd%d", i))
				cmd.Description = fmt.Sprintf("Command %d description", i)

				// Add some options and arguments
				cmd.AddOption(NewBooleanOption("-v, --verbose", "verbose output"))
				cmd.AddOption(NewOption("-f, --file <path>", "input file"))
				cmd.AddArgument(NewRequiredArgument("<input>", "input argument"))

				commands[i] = cmd

				// Validate the command
				if err := cmd.Validate(); err != nil {
					errors[i] = err
				}
			}
		}(g)
	}

	wg.Wait()

	// Check for errors
	for i, err := range errors {
		if err != nil {
			t.Errorf("Command %d validation failed: %v", i, err)
		}
	}

	// Verify all commands were created
	for i, cmd := range commands {
		if cmd == nil {
			t.Errorf("Command %d was not created", i)
		} else if cmd.Name != fmt.Sprintf("cmd%d", i) {
			t.Errorf("Command %d has wrong name: expected cmd%d, got %s", i, i, cmd.Name)
		}
	}
}

// TestStressOptionProcessing tests processing many options concurrently
func TestStressOptionProcessing(t *testing.T) {
	const numOptions = 500
	const numProcessors = 5

	var wg sync.WaitGroup
	results := make([]map[string]any, numProcessors)
	errors := make([]error, numProcessors)

	for p := 0; p < numProcessors; p++ {
		wg.Add(1)
		go func(processorID int) {
			defer wg.Done()

			processor := NewOptionProcessor()

			// Add many options
			for i := 0; i < numOptions; i++ {
				optName := fmt.Sprintf("opt%d_%d", processorID, i)
				option := NewBooleanOption(fmt.Sprintf("--%s", optName), fmt.Sprintf("Option %s", optName))
				processor.AddOption(option)
			}

			// Process all options
			for i := 0; i < numOptions; i++ {
				optName := fmt.Sprintf("opt%d_%d", processorID, i)
				if err := processor.ProcessOption(optName, ""); err != nil {
					errors[processorID] = err
					return
				}
			}

			results[processorID] = processor.GetValues()
		}(p)
	}

	wg.Wait()

	// Check for errors
	for i, err := range errors {
		if err != nil {
			t.Errorf("Processor %d failed: %v", i, err)
		}
	}

	// Verify results
	for i, result := range results {
		if len(result) != numOptions {
			t.Errorf("Processor %d: expected %d options, got %d", i, numOptions, len(result))
		}

		// Verify all options are true (boolean options)
		for key, value := range result {
			if value != true {
				t.Errorf("Processor %d: option %s should be true, got %v", i, key, value)
			}
		}
	}
}

// TestStressArgumentProcessing tests processing many arguments
func TestStressArgumentProcessing(t *testing.T) {
	const numArguments = 1000

	// Create arguments
	arguments := make([]*Argument, numArguments)
	for i := 0; i < numArguments; i++ {
		if i%3 == 0 {
			arguments[i] = NewRequiredArgument(fmt.Sprintf("<arg%d>", i), fmt.Sprintf("Argument %d", i))
		} else if i%3 == 1 {
			arguments[i] = NewOptionalArgument(fmt.Sprintf("[arg%d]", i), fmt.Sprintf("Argument %d", i), fmt.Sprintf("default%d", i))
		} else {
			arguments[i] = NewChoiceArgument(fmt.Sprintf("<choice%d>", i), fmt.Sprintf("Choice %d", i), []string{"a", "b", "c"}, true)
		}
	}

	// Create processor
	processor := NewArgumentProcessor(arguments)

	// Process arguments
	values := make([]string, numArguments)
	for i := 0; i < numArguments; i++ {
		if i%3 == 2 { // Choice arguments
			values[i] = "a" // Valid choice
		} else {
			values[i] = fmt.Sprintf("value%d", i)
		}

		if err := processor.ProcessArgument(values[i]); err != nil {
			t.Errorf("Failed to process argument %d: %v", i, err)
		}
	}

	// Validate
	if err := processor.ValidateArguments(); err != nil {
		t.Errorf("Argument validation failed: %v", err)
	}

	// Check results
	results := processor.GetValues()
	if len(results) != numArguments {
		t.Errorf("Expected %d results, got %d", numArguments, len(results))
	}
}

// TestStressParsingLargeCommandLine tests parsing very large command lines
func TestStressParsingLargeCommandLine(t *testing.T) {
	const numArgs = 10000

	parser := NewParser()
	cmd := NewCommand("stress")

	// Add variadic argument to handle many args
	cmd.AddArgument(NewVariadicArgument("<files...>", "input files", false))

	// Create large argument list
	args := make([]string, numArgs)
	for i := 0; i < numArgs; i++ {
		args[i] = fmt.Sprintf("file%d.txt", i)
	}

	start := time.Now()
	result, err := parser.ParseCommand(cmd, args)
	duration := time.Since(start)

	if err != nil {
		t.Errorf("Failed to parse large command line: %v", err)
	}

	if len(result.Arguments) != 1 {
		t.Errorf("Expected 1 argument (variadic), got %d", len(result.Arguments))
	}

	// Check that all files are in the variadic argument
	files, ok := result.Arguments[0].([]any)
	if !ok {
		t.Error("Expected variadic argument to be slice")
	} else if len(files) != numArgs {
		t.Errorf("Expected %d files, got %d", numArgs, len(files))
	}

	t.Logf("Parsed %d arguments in %v", numArgs, duration)

	// Performance check - should complete within reasonable time
	if duration > 5*time.Second {
		t.Errorf("Parsing took too long: %v", duration)
	}
}

// TestStressMemoryUsage tests memory usage under stress
func TestStressMemoryUsage(t *testing.T) {
	const iterations = 1000

	// Get initial memory stats
	var initialStats runtime.MemStats
	runtime.ReadMemStats(&initialStats)

	for i := 0; i < iterations; i++ {
		// Create command with many components
		cmd := NewCommand(fmt.Sprintf("stress%d", i))

		// Add many options
		for j := 0; j < 50; j++ {
			cmd.AddOption(NewBooleanOption(fmt.Sprintf("--opt%d", j), fmt.Sprintf("Option %d", j)))
		}

		// Add many arguments
		for j := 0; j < 20; j++ {
			cmd.AddArgument(NewOptionalArgument(fmt.Sprintf("[arg%d]", j), fmt.Sprintf("Argument %d", j), "default"))
		}

		// Add subcommands
		for j := 0; j < 10; j++ {
			sub := NewCommand(fmt.Sprintf("sub%d", j))
			sub.AddOption(NewBooleanOption("-v, --verbose", "verbose"))
			cmd.AddSubcommand(sub)
		}

		// Parse some arguments
		parser := NewParser()
		args := []string{"--opt0", "--opt1", "value1", "value2"}
		_, err := parser.ParseCommand(cmd, args)
		if err != nil {
			t.Errorf("Iteration %d failed: %v", i, err)
		}

		// Force garbage collection periodically
		if i%100 == 0 {
			runtime.GC()
		}
	}

	// Final garbage collection
	runtime.GC()
	runtime.GC() // Call twice to ensure cleanup

	// Get final memory stats
	var finalStats runtime.MemStats
	runtime.ReadMemStats(&finalStats)

	// Check memory growth
	memoryGrowth := finalStats.Alloc - initialStats.Alloc
	t.Logf("Memory growth: %d bytes", memoryGrowth)

	// Allow for some memory growth, but not excessive
	if memoryGrowth > 50*1024*1024 { // 50MB threshold
		t.Errorf("Excessive memory growth: %d bytes", memoryGrowth)
	}
}

// TestStressConcurrentParsing tests concurrent parsing operations
func TestStressConcurrentParsing(t *testing.T) {
	const numGoroutines = 20
	const parsesPerGoroutine = 100

	// Create a shared command
	cmd := NewCommand("concurrent")
	cmd.AddOption(NewBooleanOption("-v, --verbose", "verbose"))
	cmd.AddOption(NewOption("-f, --file <path>", "file"))
	cmd.AddArgument(NewRequiredArgument("<input>", "input"))

	var wg sync.WaitGroup
	errors := make(chan error, numGoroutines*parsesPerGoroutine)

	for g := 0; g < numGoroutines; g++ {
		wg.Add(1)
		go func(goroutineID int) {
			defer wg.Done()

			parser := NewParser()
			args := []string{"-v", "--file", fmt.Sprintf("file%d.txt", goroutineID), fmt.Sprintf("input%d", goroutineID)}

			for i := 0; i < parsesPerGoroutine; i++ {
				result, err := parser.ParseCommand(cmd, args)
				if err != nil {
					errors <- fmt.Errorf("goroutine %d, iteration %d: %v", goroutineID, i, err)
					return
				}

				// Verify result
				if result.Options["verbose"] != true {
					errors <- fmt.Errorf("goroutine %d, iteration %d: verbose should be true", goroutineID, i)
					return
				}

				expectedFile := fmt.Sprintf("file%d.txt", goroutineID)
				if result.Options["file"] != expectedFile {
					errors <- fmt.Errorf("goroutine %d, iteration %d: expected file %s, got %v", goroutineID, i, expectedFile, result.Options["file"])
					return
				}
			}
		}(g)
	}

	wg.Wait()
	close(errors)

	// Check for errors
	for err := range errors {
		t.Error(err)
	}
}

// TestStressComplexCommandHierarchy tests deeply nested command structures
func TestStressComplexCommandHierarchy(t *testing.T) {
	const maxDepth = 10
	const childrenPerLevel = 5

	// Create deeply nested command structure
	root := NewCommand("root")

	var createLevel func(*Command, int)
	createLevel = func(parent *Command, depth int) {
		if depth >= maxDepth {
			return
		}

		for i := 0; i < childrenPerLevel; i++ {
			child := NewCommand(fmt.Sprintf("level%d_child%d", depth, i))
			child.Description = fmt.Sprintf("Child %d at level %d", i, depth)

			// Add some options and arguments
			child.AddOption(NewBooleanOption(fmt.Sprintf("--opt%d", i), fmt.Sprintf("Option %d", i)))
			child.AddArgument(NewOptionalArgument(fmt.Sprintf("[arg%d]", i), fmt.Sprintf("Argument %d", i), "default"))

			parent.AddSubcommand(child)

			// Recurse to next level
			createLevel(child, depth+1)
		}
	}

	createLevel(root, 0)

	// Validate the entire hierarchy
	if err := root.Validate(); err != nil {
		t.Errorf("Complex hierarchy validation failed: %v", err)
	}

	// Test finding commands at various levels
	parser := NewParser()

	// Test parsing at different levels
	testCases := []struct {
		args     []string
		expected string
	}{
		{[]string{"level0_child0"}, "level0_child0"},
		{[]string{"level0_child0", "level1_child1"}, "level1_child1"},
		{[]string{"level0_child0", "level1_child1", "level2_child2"}, "level2_child2"},
	}

	for _, tc := range testCases {
		result, err := parser.ParseCommand(root, tc.args)
		if err != nil {
			t.Errorf("Failed to parse %v: %v", tc.args, err)
		} else if result.Command.Name != tc.expected {
			t.Errorf("Expected command %s, got %s", tc.expected, result.Command.Name)
		}
	}

	// Count total commands created
	var countCommands func(*Command) int
	countCommands = func(cmd *Command) int {
		count := 1
		for _, sub := range cmd.Subcommands {
			count += countCommands(sub)
		}
		return count
	}

	totalCommands := countCommands(root)
	t.Logf("Created %d commands in hierarchy", totalCommands)
}

// TestStressOptionValidation tests validation of many options with complex rules
func TestStressOptionValidation(t *testing.T) {
	const numOptions = 200

	cmd := NewCommand("validation-stress")

	// Add many options with various validation rules
	for i := 0; i < numOptions; i++ {
		var option *Option

		switch i % 5 {
		case 0:
			option = NewBooleanOption(fmt.Sprintf("--bool%d", i), fmt.Sprintf("Boolean option %d", i))
		case 1:
			option = CreateRequiredOption(fmt.Sprintf("--req%d <value>", i), fmt.Sprintf("Required option %d", i))
		case 2:
			option = CreateChoiceOption(fmt.Sprintf("--choice%d <val>", i), fmt.Sprintf("Choice option %d", i), []string{"a", "b", "c"})
		case 3:
			option = NewVariadicOption(fmt.Sprintf("--var%d <vals...>", i), fmt.Sprintf("Variadic option %d", i))
		case 4:
			option = CreateNegatableOption(fmt.Sprintf("--neg%d", i), fmt.Sprintf("Negatable option %d", i))
		}

		cmd.AddOption(option)
	}

	// Validate command structure
	if err := cmd.Validate(); err != nil {
		t.Errorf("Command validation failed: %v", err)
	}

	// Test parsing with many options
	parser := NewParser()
	args := make([]string, 0, numOptions*2)

	// Build argument list
	for i := 0; i < numOptions; i++ {
		switch i % 5 {
		case 0:
			args = append(args, fmt.Sprintf("--bool%d", i))
		case 1:
			args = append(args, fmt.Sprintf("--req%d", i), fmt.Sprintf("value%d", i))
		case 2:
			args = append(args, fmt.Sprintf("--choice%d", i), "a")
		case 3:
			args = append(args, fmt.Sprintf("--var%d", i), "val1", "val2")
		case 4:
			args = append(args, fmt.Sprintf("--neg%d", i))
		}
	}

	start := time.Now()
	result, err := parser.ParseCommand(cmd, args)
	duration := time.Since(start)

	if err != nil {
		t.Errorf("Failed to parse stress options: %v", err)
	}

	t.Logf("Parsed %d options in %v", numOptions, duration)

	// Verify some results
	if len(result.Options) < numOptions {
		t.Errorf("Expected at least %d options, got %d", numOptions, len(result.Options))
	}

	// Performance check
	if duration > 2*time.Second {
		t.Errorf("Option parsing took too long: %v", duration)
	}
}

// TestStressErrorHandling tests error handling under stress conditions
func TestStressErrorHandling(t *testing.T) {
	const numIterations = 1000

	cmd := NewCommand("error-stress")
	cmd.AddOption(CreateRequiredOption("-r, --required <value>", "required option"))
	cmd.AddArgument(NewRequiredArgument("<input>", "required input"))

	parser := NewParser()

	// Test various error conditions repeatedly
	errorTests := []struct {
		name string
		args []string
	}{
		{"missing required option", []string{"input"}},
		{"missing required argument", []string{"-r", "value"}},
		{"invalid option", []string{"--invalid", "input"}},
		{"missing option value", []string{"-r", "input"}},
	}

	for _, test := range errorTests {
		for i := 0; i < numIterations; i++ {
			_, err := parser.ParseCommand(cmd, test.args)
			if err == nil {
				t.Errorf("Iteration %d of %s: expected error but got none", i, test.name)
			}
		}
	}
}

// Benchmark tests for stress testing
func BenchmarkStressCommandCreation(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		cmd := NewCommand(fmt.Sprintf("bench%d", i))
		cmd.AddOption(NewBooleanOption("-v, --verbose", "verbose"))
		cmd.AddOption(NewOption("-f, --file <path>", "file"))
		cmd.AddArgument(NewRequiredArgument("<input>", "input"))
		cmd.Validate()
	}
}

func BenchmarkStressOptionProcessing(b *testing.B) {
	processor := NewOptionProcessor()

	// Pre-add options
	for i := 0; i < 100; i++ {
		option := NewBooleanOption(fmt.Sprintf("--opt%d", i), fmt.Sprintf("Option %d", i))
		processor.AddOption(option)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		optName := fmt.Sprintf("opt%d", i%100)
		processor.ProcessOption(optName, "")
	}
}

func BenchmarkStressParsing(b *testing.B) {
	parser := NewParser()
	cmd := NewCommand("bench")

	// Add many options
	for i := 0; i < 50; i++ {
		cmd.AddOption(NewBooleanOption(fmt.Sprintf("--opt%d", i), fmt.Sprintf("Option %d", i)))
	}

	args := make([]string, 50)
	for i := 0; i < 50; i++ {
		args[i] = fmt.Sprintf("--opt%d", i)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parser.ParseCommand(cmd, args)
	}
}
