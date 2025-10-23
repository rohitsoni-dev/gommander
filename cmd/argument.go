package cmd

import (
	"fmt"
	"os"
	"regexp"
	"strings"
)

// ArgumentParser represents a function that parses argument values
type ArgumentParser func(value string, previous any) (any, error)

// Argument represents a command-line argument
type Argument struct {
	Name        string
	Description string
	Required    bool
	Variadic    bool
	Default     any
	Choices     []string
	Parser      ArgumentParser

	// Commander.js compatibility fields
	ArgRequired bool
	ArgOptional bool
}

// NewArgument creates a new argument with the given name and description
func NewArgument(name, description string) *Argument {
	arg := &Argument{
		Name:        name,
		Description: description,
		Required:    true, // Arguments are required by default
		ArgRequired: true,
		ArgOptional: false,
	}

	// Parse argument specification from name
	arg.parseName()
	return arg
}

// parseName parses the argument name to extract type information
func (a *Argument) parseName() {
	name := strings.TrimSpace(a.Name)

	// Handle variadic arguments: <files...> or [files...]
	if strings.HasSuffix(name, "...>") || strings.HasSuffix(name, "...]") {
		a.Variadic = true
		// Remove the ... suffix
		if strings.HasSuffix(name, "...>") {
			name = name[:len(name)-4] + ">"
		} else {
			name = name[:len(name)-4] + "]"
		}
	}

	// Handle optional arguments: [name]
	if strings.HasPrefix(name, "[") && strings.HasSuffix(name, "]") {
		a.Required = false
		a.ArgRequired = false
		a.ArgOptional = true
		a.Name = strings.Trim(name, "[]")
	} else if strings.HasPrefix(name, "<") && strings.HasSuffix(name, ">") {
		// Required arguments: <name>
		a.Required = true
		a.ArgRequired = true
		a.ArgOptional = false
		a.Name = strings.Trim(name, "<>")
	} else {
		// Plain name, assume required
		a.Name = name
	}
}

// SetRequired marks the argument as required
func (a *Argument) SetRequired(required bool) *Argument {
	a.Required = required
	return a
}

// SetVariadic marks the argument as accepting multiple values
func (a *Argument) SetVariadic(variadic bool) *Argument {
	a.Variadic = variadic
	return a
}

// SetDefault sets the default value for the argument
func (a *Argument) SetDefault(defaultValue any) *Argument {
	a.Default = defaultValue
	// If a default is set, the argument becomes optional
	if defaultValue != nil {
		a.Required = false
		a.ArgOptional = true
	}
	return a
}

// SetChoices sets the allowed choices for the argument
func (a *Argument) SetChoices(choices []string) *Argument {
	a.Choices = choices
	return a
}

// SetParser sets a custom parser function for the argument
func (a *Argument) SetParser(parser ArgumentParser) *Argument {
	a.Parser = parser
	return a
}

// ParseValue parses a string value using the argument's parser or default parsing
func (a *Argument) ParseValue(value string, previous any) (any, error) {
	// Enhanced validation before parsing
	if err := a.validateValueFormat(value); err != nil {
		return nil, err
	}

	// Use custom parser if provided
	if a.Parser != nil {
		parsed, err := a.Parser(value, previous)
		if err != nil {
			return nil, fmt.Errorf("custom parser failed for argument '%s': %v", a.Name, err)
		}

		// Validate parsed value against choices if specified
		if err := a.validateChoices(parsed); err != nil {
			return nil, err
		}

		return parsed, nil
	}

	// Validate against choices if specified (before parsing for better error messages)
	if len(a.Choices) > 0 {
		found := false
		for _, choice := range a.Choices {
			if choice == value {
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("invalid choice '%s' for argument '%s', expected one of: %s",
				value, a.Name, strings.Join(a.Choices, ", "))
		}
	}

	// Handle variadic arguments with enhanced processing
	if a.Variadic {
		return a.parseVariadicValue(value, previous)
	}

	// Default parsing for non-variadic arguments
	return a.parseScalarValue(value)
}

// validateValueFormat performs basic format validation on the raw value
func (a *Argument) validateValueFormat(value string) error {
	// Check for empty values on required arguments
	if a.Required && strings.TrimSpace(value) == "" {
		return fmt.Errorf("argument '%s' cannot be empty", a.Name)
	}

	// Additional format validations can be added here
	return nil
}

// validateChoices validates a parsed value against the choices constraint
func (a *Argument) validateChoices(value any) error {
	if len(a.Choices) == 0 {
		return nil
	}

	valueStr := fmt.Sprintf("%v", value)
	for _, choice := range a.Choices {
		if choice == valueStr {
			return nil
		}
	}

	return fmt.Errorf("invalid choice '%s' for argument '%s', expected one of: %s",
		valueStr, a.Name, strings.Join(a.Choices, ", "))
}

// parseScalarValue handles parsing of non-variadic argument values
func (a *Argument) parseScalarValue(value string) (any, error) {
	// For now, return as string - can be extended for type-specific parsing
	return value, nil
}

// parseVariadicValue handles parsing for variadic arguments with enhanced array handling
func (a *Argument) parseVariadicValue(value string, previous any) (any, error) {
	var values []any

	// Initialize or get existing values with proper type checking
	if previous != nil {
		switch prev := previous.(type) {
		case []any:
			values = make([]any, len(prev))
			copy(values, prev)
		case []string:
			// Convert string slice to any slice for consistency
			values = make([]any, len(prev))
			for i, v := range prev {
				values[i] = v
			}
		default:
			// If previous is a single value, convert to slice
			values = []any{prev}
		}
	}

	// Parse the new value using scalar parsing logic
	parsedValue, err := a.parseScalarValue(value)
	if err != nil {
		return nil, fmt.Errorf("failed to parse variadic value '%s' for argument '%s': %v",
			value, a.Name, err)
	}

	// Validate the parsed value against choices if specified
	if err := a.validateChoices(parsedValue); err != nil {
		return nil, err
	}

	// Append to the values array
	values = append(values, parsedValue)
	return values, nil
}

// Validate validates the argument value against all constraints with enhanced validation
func (a *Argument) Validate(value any) error {
	// Check required constraint
	if a.Required {
		if value == nil {
			return fmt.Errorf("argument '%s' is required", a.Name)
		}

		// For variadic arguments, check that array is not empty
		if a.Variadic {
			if slice, ok := value.([]any); ok && len(slice) == 0 {
				return fmt.Errorf("variadic argument '%s' requires at least one value", a.Name)
			}
		}

		// For string values, check that they're not empty
		if str, ok := value.(string); ok && strings.TrimSpace(str) == "" {
			return fmt.Errorf("argument '%s' cannot be empty", a.Name)
		}
	}

	// Skip further validation if value is nil and argument is optional
	if value == nil {
		return nil
	}

	// Validate choices constraint
	if len(a.Choices) > 0 {
		if err := a.validateValueChoices(value); err != nil {
			return err
		}
	}

	// Validate variadic argument structure
	if a.Variadic {
		if err := a.validateVariadicValue(value); err != nil {
			return err
		}
	}

	return nil
}

// validateValueChoices validates a value (scalar or array) against choices
func (a *Argument) validateValueChoices(value any) error {
	if a.Variadic {
		// For variadic arguments, validate each element in the array
		if slice, ok := value.([]any); ok {
			for i, item := range slice {
				itemStr := fmt.Sprintf("%v", item)
				if !a.isValidChoice(itemStr) {
					return fmt.Errorf("invalid choice '%s' at position %d for variadic argument '%s', expected one of: %s",
						itemStr, i, a.Name, strings.Join(a.Choices, ", "))
				}
			}
		} else {
			return fmt.Errorf("variadic argument '%s' should be an array, got %T", a.Name, value)
		}
	} else {
		// For scalar arguments, validate the single value
		valueStr := fmt.Sprintf("%v", value)
		if !a.isValidChoice(valueStr) {
			return fmt.Errorf("invalid choice '%s' for argument '%s', expected one of: %s",
				valueStr, a.Name, strings.Join(a.Choices, ", "))
		}
	}

	return nil
}

// isValidChoice checks if a string value is in the choices list
func (a *Argument) isValidChoice(value string) bool {
	for _, choice := range a.Choices {
		if choice == value {
			return true
		}
	}
	return false
}

// validateVariadicValue validates the structure of a variadic argument value
func (a *Argument) validateVariadicValue(value any) error {
	if _, ok := value.([]any); !ok {
		// Allow single values to be converted to arrays
		return nil
	}

	return nil
}

// ValidateStructure validates the argument structure and configuration
func (a *Argument) ValidateStructure() error {
	if a.Name == "" {
		return fmt.Errorf("argument name cannot be empty")
	}

	// Variadic arguments cannot have a default value
	if a.Variadic && a.Default != nil {
		return fmt.Errorf("variadic argument '%s' cannot have a default value", a.Name)
	}

	return nil
}

// ArgumentProcessor handles complex argument processing scenarios
type ArgumentProcessor struct {
	arguments []*Argument
	values    []any
}

// NewArgumentProcessor creates a new argument processor
func NewArgumentProcessor(arguments []*Argument) *ArgumentProcessor {
	return &ArgumentProcessor{
		arguments: arguments,
		values:    make([]any, 0),
	}
}

// ProcessArgument processes a single argument value with enhanced validation and handling
func (ap *ArgumentProcessor) ProcessArgument(value string) error {
	currentIndex := len(ap.values)

	// Find the appropriate argument definition with enhanced logic
	arg, argIndex, err := ap.findArgumentForValue(currentIndex)
	if err != nil {
		return err
	}

	if arg == nil {
		return fmt.Errorf("unexpected argument: %s (no more arguments expected)", value)
	}

	// Get previous value for variadic arguments
	var previousValue any
	if arg.Variadic && argIndex < len(ap.values) {
		previousValue = ap.values[argIndex]
	}

	// Parse the value with enhanced error context
	parsedValue, err := arg.ParseValue(value, previousValue)
	if err != nil {
		return fmt.Errorf("failed to process argument '%s' for parameter '%s': %v",
			value, arg.Name, err)
	}

	// Store the value with proper array handling
	if err := ap.storeArgumentValue(arg, argIndex, parsedValue); err != nil {
		return fmt.Errorf("failed to store argument value: %v", err)
	}

	return nil
}

// findArgumentForValue finds the appropriate argument definition for the current value
func (ap *ArgumentProcessor) findArgumentForValue(currentIndex int) (*Argument, int, error) {
	if currentIndex < len(ap.arguments) {
		// Normal case: we have more argument definitions
		return ap.arguments[currentIndex], currentIndex, nil
	}

	// Check if the last argument is variadic and can accept more values
	if len(ap.arguments) > 0 {
		lastArg := ap.arguments[len(ap.arguments)-1]
		if lastArg.Variadic {
			return lastArg, len(ap.arguments) - 1, nil
		}
	}

	// No more arguments can be processed
	return nil, -1, nil
}

// storeArgumentValue stores a parsed argument value in the appropriate location
func (ap *ArgumentProcessor) storeArgumentValue(arg *Argument, argIndex int, parsedValue any) error {
	if arg.Variadic {
		// For variadic arguments, update the existing slot or create new one
		if argIndex < len(ap.values) {
			ap.values[argIndex] = parsedValue
		} else {
			// Pad with nil values if necessary to maintain correct indexing
			for len(ap.values) < argIndex {
				ap.values = append(ap.values, nil)
			}
			ap.values = append(ap.values, parsedValue)
		}
	} else {
		// For regular arguments, append to the values array
		if argIndex != len(ap.values) {
			return fmt.Errorf("argument index mismatch: expected %d, got %d", len(ap.values), argIndex)
		}
		ap.values = append(ap.values, parsedValue)
	}

	return nil
}

// ValidateArguments validates all processed arguments with enhanced validation
func (ap *ArgumentProcessor) ValidateArguments() error {
	// First, fill in default values for optional arguments
	ap.FillDefaults()

	// Validate each argument definition against its corresponding value
	for i, arg := range ap.arguments {
		var value any
		hasValue := i < len(ap.values) && ap.values[i] != nil

		if hasValue {
			value = ap.values[i]
		}

		// Enhanced validation with better error messages
		if err := ap.validateSingleArgument(arg, value, i); err != nil {
			return err
		}
	}

	// Perform cross-argument validation
	if err := ap.validateArgumentRelationships(); err != nil {
		return err
	}

	return nil
}

// validateSingleArgument validates a single argument with enhanced logic
func (ap *ArgumentProcessor) validateSingleArgument(arg *Argument, value any, index int) error {
	// Check if required argument is missing
	if arg.Required && value == nil {
		return fmt.Errorf("missing required argument: %s", arg.Name)
	}

	// Skip validation for nil optional arguments
	if value == nil && !arg.Required {
		return nil
	}

	// Validate the argument value using the argument's validation logic
	if err := arg.Validate(value); err != nil {
		return fmt.Errorf("validation failed for argument '%s' at position %d: %v",
			arg.Name, index, err)
	}

	// Additional validation for variadic arguments
	if arg.Variadic {
		if err := ap.validateVariadicArgument(arg, value, index); err != nil {
			return err
		}
	}

	return nil
}

// validateVariadicArgument performs additional validation for variadic arguments
func (ap *ArgumentProcessor) validateVariadicArgument(arg *Argument, value any, index int) error {
	slice, ok := value.([]any)
	if !ok {
		return fmt.Errorf("variadic argument '%s' should be an array, got %T", arg.Name, value)
	}

	// Validate that required variadic arguments have at least one value
	if arg.Required && len(slice) == 0 {
		return fmt.Errorf("required variadic argument '%s' must have at least one value", arg.Name)
	}

	// Validate each element in the variadic array
	for i, item := range slice {
		if item == nil {
			return fmt.Errorf("variadic argument '%s' contains nil value at position %d", arg.Name, i)
		}
	}

	return nil
}

// validateArgumentRelationships performs cross-argument validation
func (ap *ArgumentProcessor) validateArgumentRelationships() error {
	// Check that no required arguments come after optional ones (structural validation)
	foundOptional := false
	for i, arg := range ap.arguments {
		if !arg.Required && !arg.Variadic {
			foundOptional = true
		} else if arg.Required && foundOptional && !arg.Variadic {
			return fmt.Errorf("required argument '%s' at position %d cannot come after optional arguments",
				arg.Name, i)
		}
	}

	// Additional relationship validations can be added here
	return nil
}

// GetValues returns all processed argument values
func (ap *ArgumentProcessor) GetValues() []any {
	result := make([]any, len(ap.values))
	copy(result, ap.values)
	return result
}

// GetValue returns the value for a specific argument index
func (ap *ArgumentProcessor) GetValue(index int) (any, bool) {
	if index < len(ap.values) {
		return ap.values[index], true
	}
	return nil, false
}

// FillDefaults fills in default values for optional arguments with enhanced handling
func (ap *ArgumentProcessor) FillDefaults() {
	for i, arg := range ap.arguments {
		// Only process optional arguments with default values
		if !arg.Required && arg.Default != nil {
			// Check if no value was provided for this argument
			needsDefault := i >= len(ap.values) || ap.values[i] == nil

			if needsDefault {
				// Extend values slice if necessary to maintain proper indexing
				for len(ap.values) <= i {
					ap.values = append(ap.values, nil)
				}

				// Set the default value, handling different types appropriately
				defaultValue := ap.processDefaultValue(arg, arg.Default)
				ap.values[i] = defaultValue
			}
		}
	}
}

// processDefaultValue processes a default value, handling special cases for variadic arguments
func (ap *ArgumentProcessor) processDefaultValue(arg *Argument, defaultValue any) any {
	// For variadic arguments, ensure default is properly formatted as an array
	if arg.Variadic {
		switch def := defaultValue.(type) {
		case []any:
			return def
		case []string:
			// Convert string slice to any slice
			result := make([]any, len(def))
			for i, v := range def {
				result[i] = v
			}
			return result
		default:
			// Convert single value to array
			return []any{def}
		}
	}

	// For non-variadic arguments, return as-is
	return defaultValue
}

// AdvancedArgumentValidator provides advanced argument validation
type AdvancedArgumentValidator struct {
	// Custom validators for specific arguments
	CustomValidators map[string]func(any) error

	// Type validators
	TypeValidators map[string]func(any) error

	// Cross-argument validators
	CrossValidators []func([]any) error
}

// NewAdvancedArgumentValidator creates a new advanced argument validator
func NewAdvancedArgumentValidator() *AdvancedArgumentValidator {
	return &AdvancedArgumentValidator{
		CustomValidators: make(map[string]func(any) error),
		TypeValidators:   make(map[string]func(any) error),
		CrossValidators:  make([]func([]any) error, 0),
	}
}

// RegisterCustomValidator registers a custom validator for a specific argument
func (av *AdvancedArgumentValidator) RegisterCustomValidator(argName string, validator func(any) error) {
	av.CustomValidators[argName] = validator
}

// RegisterTypeValidator registers a validator for a specific type
func (av *AdvancedArgumentValidator) RegisterTypeValidator(typeName string, validator func(any) error) {
	av.TypeValidators[typeName] = validator
}

// RegisterCrossValidator registers a validator that checks multiple arguments
func (av *AdvancedArgumentValidator) RegisterCrossValidator(validator func([]any) error) {
	av.CrossValidators = append(av.CrossValidators, validator)
}

// ValidateArguments validates arguments using advanced rules
func (av *AdvancedArgumentValidator) ValidateArguments(arguments []*Argument, values []any) error {
	// Validate individual arguments
	for i, arg := range arguments {
		if i < len(values) && values[i] != nil {
			// Use custom validator if available
			if validator, exists := av.CustomValidators[arg.Name]; exists {
				if err := validator(values[i]); err != nil {
					return fmt.Errorf("validation failed for argument '%s': %v", arg.Name, err)
				}
			}

			// Use built-in validation
			if err := arg.Validate(values[i]); err != nil {
				return err
			}
		}
	}

	// Run cross-argument validators
	for _, validator := range av.CrossValidators {
		if err := validator(values); err != nil {
			return fmt.Errorf("cross-argument validation failed: %v", err)
		}
	}

	return nil
}

// Common validation functions

// ValidateFileExists validates that a file path exists
func ValidateFileExists(value any) error {
	path, ok := value.(string)
	if !ok {
		return fmt.Errorf("expected string path, got %T", value)
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		return fmt.Errorf("file does not exist: %s", path)
	}

	return nil
}

// ValidateDirectoryExists validates that a directory path exists
func ValidateDirectoryExists(value any) error {
	path, ok := value.(string)
	if !ok {
		return fmt.Errorf("expected string path, got %T", value)
	}

	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return fmt.Errorf("directory does not exist: %s", path)
	}

	if !info.IsDir() {
		return fmt.Errorf("path is not a directory: %s", path)
	}

	return nil
}

// ValidatePositiveNumber validates that a number is positive
func ValidatePositiveNumber(value any) error {
	switch v := value.(type) {
	case int:
		if v <= 0 {
			return fmt.Errorf("expected positive number, got %d", v)
		}
	case float64:
		if v <= 0 {
			return fmt.Errorf("expected positive number, got %f", v)
		}
	default:
		return fmt.Errorf("expected number, got %T", value)
	}

	return nil
}

// ValidateRange validates that a number is within a specific range
func ValidateRange(min, max float64) func(any) error {
	return func(value any) error {
		var num float64

		switch v := value.(type) {
		case int:
			num = float64(v)
		case float64:
			num = v
		default:
			return fmt.Errorf("expected number, got %T", value)
		}

		if num < min || num > max {
			return fmt.Errorf("value %f is not in range [%f, %f]", num, min, max)
		}

		return nil
	}
}

// ValidateStringLength validates string length constraints
func ValidateStringLength(minLen, maxLen int) func(any) error {
	return func(value any) error {
		str, ok := value.(string)
		if !ok {
			return fmt.Errorf("expected string, got %T", value)
		}

		length := len(str)
		if length < minLen {
			return fmt.Errorf("string too short: %d < %d", length, minLen)
		}

		if maxLen > 0 && length > maxLen {
			return fmt.Errorf("string too long: %d > %d", length, maxLen)
		}

		return nil
	}
}

// ValidateRegex validates that a string matches a regular expression
func ValidateRegex(pattern string) func(any) error {
	return func(value any) error {
		str, ok := value.(string)
		if !ok {
			return fmt.Errorf("expected string, got %T", value)
		}

		matched, err := regexp.MatchString(pattern, str)
		if err != nil {
			return fmt.Errorf("invalid regex pattern: %v", err)
		}

		if !matched {
			return fmt.Errorf("string does not match pattern %s: %s", pattern, str)
		}

		return nil
	}
}

// Enhanced argument creation helpers

// NewRequiredArgument creates a new required argument
func NewRequiredArgument(name, description string) *Argument {
	arg := NewArgument(name, description)
	arg.SetRequired(true)
	return arg
}

// NewOptionalArgument creates a new optional argument with a default value
func NewOptionalArgument(name, description string, defaultValue any) *Argument {
	arg := NewArgument(name, description)
	arg.SetRequired(false)
	arg.SetDefault(defaultValue)
	return arg
}

// NewVariadicArgument creates a new variadic argument
func NewVariadicArgument(name, description string, required bool) *Argument {
	arg := NewArgument(name, description)
	arg.SetVariadic(true)
	arg.SetRequired(required)
	return arg
}

// NewChoiceArgument creates a new argument with predefined choices
func NewChoiceArgument(name, description string, choices []string, required bool) *Argument {
	arg := NewArgument(name, description)
	arg.SetChoices(choices)
	arg.SetRequired(required)
	return arg
}

// NewValidatedArgument creates a new argument with a custom validator
func NewValidatedArgument(name, description string, validator ArgumentParser, required bool) *Argument {
	arg := NewArgument(name, description)
	arg.SetParser(validator)
	arg.SetRequired(required)
	return arg
}

// Common argument parsers for enhanced processing

// IntArgumentParser parses string values to integers
func IntArgumentParser(value string, previous any) (any, error) {
	if strings.TrimSpace(value) == "" {
		return nil, fmt.Errorf("integer value cannot be empty")
	}

	result := 0
	_, err := fmt.Sscanf(value, "%d", &result)
	if err != nil {
		return nil, fmt.Errorf("invalid integer: %s", value)
	}

	return result, nil
}

// FloatArgumentParser parses string values to float64
func FloatArgumentParser(value string, previous any) (any, error) {
	if strings.TrimSpace(value) == "" {
		return nil, fmt.Errorf("float value cannot be empty")
	}

	result := 0.0
	_, err := fmt.Sscanf(value, "%f", &result)
	if err != nil {
		return nil, fmt.Errorf("invalid float: %s", value)
	}

	return result, nil
}

// BoolArgumentParser parses string values to boolean
func BoolArgumentParser(value string, previous any) (any, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "t", "yes", "y", "1", "on":
		return true, nil
	case "false", "f", "no", "n", "0", "off":
		return false, nil
	default:
		return nil, fmt.Errorf("invalid boolean value: %s (expected true/false, yes/no, 1/0, on/off)", value)
	}
}

// PathArgumentParser validates and normalizes file paths
func PathArgumentParser(value string, previous any) (any, error) {
	if strings.TrimSpace(value) == "" {
		return nil, fmt.Errorf("path cannot be empty")
	}

	// Basic path validation - can be extended with more sophisticated checks
	if strings.Contains(value, "\x00") {
		return nil, fmt.Errorf("path contains null character")
	}

	return value, nil
}

// Enhanced argument processing utilities

// ProcessArgumentsWithDefaults processes arguments and applies defaults in one step
func ProcessArgumentsWithDefaults(arguments []*Argument, values []string) ([]any, error) {
	processor := NewArgumentProcessor(arguments)

	// Process all provided values
	for _, value := range values {
		if err := processor.ProcessArgument(value); err != nil {
			return nil, err
		}
	}

	// Validate and fill defaults
	if err := processor.ValidateArguments(); err != nil {
		return nil, err
	}

	return processor.GetValues(), nil
}

// ValidateArgumentStructure validates the structure of argument definitions
func ValidateArgumentStructure(arguments []*Argument) error {
	if len(arguments) == 0 {
		return nil
	}

	foundOptional := false
	foundVariadic := false

	for i, arg := range arguments {
		// Validate individual argument
		if err := arg.ValidateStructure(); err != nil {
			return fmt.Errorf("argument %d (%s): %v", i, arg.Name, err)
		}

		// Check ordering constraints
		if foundVariadic {
			return fmt.Errorf("argument %d (%s): no arguments allowed after variadic argument", i, arg.Name)
		}

		if arg.Variadic {
			foundVariadic = true
		} else if !arg.Required {
			foundOptional = true
		} else if foundOptional {
			return fmt.Errorf("argument %d (%s): required arguments cannot come after optional arguments", i, arg.Name)
		}
	}

	return nil
}
