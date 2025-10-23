package cmd

import (
	"fmt"
	"os"
	"slices"
	"strconv"
	"strings"
)

// OptionParser represents a function that parses option values
type OptionParser func(value string, previous any) (any, error)

// OptionType represents the type of option
type OptionType int

const (
	OptionTypeBoolean OptionType = iota
	OptionTypeString
	OptionTypeNumber
	OptionTypeVariadic
)

// Option represents a command-line option
type Option struct {
	Flags       string
	Description string
	Required    bool
	Variadic    bool
	Default     any
	Choices     []string
	Parser      OptionParser
	Short       string
	Long        string

	// Commander.js compatibility fields
	Type      OptionType
	Negatable bool
	Hidden    bool
	Mandatory bool
	Optional  bool
	Preset    any
	Env       string

	// Value handling
	ArgParser OptionParser
	Coercion  OptionParser

	// Conflict detection
	Conflicts []string
	Implies   []string
}

// NewOption creates a new option with the given flags and description
func NewOption(flags, description string) *Option {
	option := &Option{
		Flags:       flags,
		Description: description,
		Type:        OptionTypeString, // Default type
		Negatable:   false,
		Hidden:      false,
		Mandatory:   false,
		Optional:    true,
	}
	option.parseFlags()
	return option
}

// NewBooleanOption creates a new boolean option
func NewBooleanOption(flags, description string) *Option {
	option := NewOption(flags, description)
	option.Type = OptionTypeBoolean
	option.Default = false
	return option
}

// NewVariadicOption creates a new variadic option
func NewVariadicOption(flags, description string) *Option {
	option := NewOption(flags, description)
	option.Type = OptionTypeVariadic
	option.Variadic = true
	option.Default = make([]any, 0)
	return option
}

// parseFlags parses the flags string to extract short and long flag names
func (o *Option) parseFlags() {
	parts := strings.Split(o.Flags, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)

		// Handle negatable options (--no-xxx)
		if noFlag, found := strings.CutPrefix(part, "--no-"); found {
			o.Long = noFlag
			o.Negatable = true
			o.Type = OptionTypeBoolean
		} else if long, found := strings.CutPrefix(part, "--"); found {
			// Extract argument specification from long flag
			if idx := strings.Index(long, " "); idx != -1 {
				o.Long = long[:idx]
				argSpec := strings.TrimSpace(long[idx+1:])
				o.parseArgumentSpecification(argSpec)
			} else if idx := strings.Index(long, "="); idx != -1 {
				o.Long = long[:idx]
				// Handle --flag=value format
			} else {
				o.Long = long
			}
		} else if short, found := strings.CutPrefix(part, "-"); found {
			if len(short) == 1 {
				o.Short = short
			}
		}
	}
}

// parseArgumentSpecification parses argument specification like <value>, [value], <values...>
func (o *Option) parseArgumentSpecification(spec string) {
	spec = strings.TrimSpace(spec)

	// Check for variadic arguments
	if strings.HasSuffix(spec, "...>") || strings.HasSuffix(spec, "...]") {
		o.Variadic = true
		o.Type = OptionTypeVariadic
	}

	// Check if argument is optional
	if strings.HasPrefix(spec, "[") && strings.HasSuffix(spec, "]") {
		o.Optional = true
		o.Required = false
	} else if strings.HasPrefix(spec, "<") && strings.HasSuffix(spec, ">") {
		o.Optional = false
		o.Required = true
	}
}

// SetRequired marks the option as required
func (o *Option) SetRequired(required bool) *Option {
	o.Required = required
	return o
}

// SetVariadic marks the option as accepting multiple values
func (o *Option) SetVariadic(variadic bool) *Option {
	o.Variadic = variadic
	return o
}

// SetDefault sets the default value for the option
func (o *Option) SetDefault(defaultValue any) *Option {
	o.Default = defaultValue
	return o
}

// SetChoices sets the allowed choices for the option
func (o *Option) SetChoices(choices []string) *Option {
	o.Choices = choices
	return o
}

// SetParser sets a custom parser function for the option
func (o *Option) SetParser(parser OptionParser) *Option {
	o.Parser = parser
	return o
}

// SetEnv sets the environment variable name for this option
func (o *Option) SetEnv(env string) *Option {
	o.Env = env
	return o
}

// SetConflicts sets options that conflict with this option
func (o *Option) SetConflicts(conflicts []string) *Option {
	o.Conflicts = conflicts
	return o
}

// SetImplies sets options that are implied by this option
func (o *Option) SetImplies(implies []string) *Option {
	o.Implies = implies
	return o
}

// SetHidden marks the option as hidden from help
func (o *Option) SetHidden(hidden bool) *Option {
	o.Hidden = hidden
	return o
}

// ParseValue parses a string value using the option's parser or default parsing
func (o *Option) ParseValue(value string, previous any) (any, error) {
	// Use custom parser if provided
	if o.Parser != nil {
		return o.Parser(value, previous)
	}

	// Validate against choices if specified
	if len(o.Choices) > 0 {
		if !slices.Contains(o.Choices, value) {
			return nil, fmt.Errorf("invalid choice '%s', expected one of: %s", value, strings.Join(o.Choices, ", "))
		}
	}

	// Type-specific parsing
	switch o.Type {
	case OptionTypeBoolean:
		return DefaultBoolParser(value, previous)
	case OptionTypeNumber:
		return DefaultNumberParser(value, previous)
	case OptionTypeVariadic:
		return o.parseVariadicValue(value, previous)
	default:
		return value, nil
	}
}

// parseVariadicValue handles parsing for variadic options
func (o *Option) parseVariadicValue(value string, previous any) (any, error) {
	var values []any

	// Initialize or get existing values
	if previous != nil {
		if prevSlice, ok := previous.([]any); ok {
			values = prevSlice
		}
	}

	// Parse the new value
	var parsedValue any
	var err error

	if o.ArgParser != nil {
		parsedValue, err = o.ArgParser(value, nil)
	} else {
		parsedValue = value
	}

	if err != nil {
		return nil, err
	}

	values = append(values, parsedValue)
	return values, nil
}

// Matches checks if the given flag matches this option
func (o *Option) Matches(flag string) bool {
	if o.Short != "" && flag == o.Short {
		return true
	}
	if o.Long != "" && flag == o.Long {
		return true
	}
	// Handle negatable options
	if o.Negatable && o.Long != "" && flag == "no-"+o.Long {
		return true
	}
	return false
}

// IsNegated checks if the flag is the negated version of this option
func (o *Option) IsNegated(flag string) bool {
	return o.Negatable && o.Long != "" && flag == "no-"+o.Long
}

// GetNegatedFlag returns the negated flag name for negatable options
func (o *Option) GetNegatedFlag() string {
	if o.Negatable && o.Long != "" {
		return "no-" + o.Long
	}
	return ""
}

// CanBeNegated returns true if this option can be negated
func (o *Option) CanBeNegated() bool {
	return o.Negatable && o.Type == OptionTypeBoolean && o.Long != ""
}

// Validate validates the option configuration
func (o *Option) Validate() error {
	if o.Flags == "" {
		return fmt.Errorf("option flags cannot be empty")
	}

	if o.Short == "" && o.Long == "" {
		return fmt.Errorf("option must have at least one flag (short or long)")
	}

	// Validate short flag
	if o.Short != "" && len(o.Short) != 1 {
		return fmt.Errorf("short flag must be a single character, got: %s", o.Short)
	}

	// Validate long flag
	if o.Long != "" && len(o.Long) < 2 {
		return fmt.Errorf("long flag must be at least 2 characters, got: %s", o.Long)
	}

	// Variadic options cannot be required in the traditional sense
	if o.Variadic && o.Required {
		return fmt.Errorf("variadic options cannot be marked as required")
	}

	// Boolean options should not have choices
	if o.Type == OptionTypeBoolean && len(o.Choices) > 0 {
		return fmt.Errorf("boolean options cannot have choices")
	}

	return nil
}

// DefaultBoolParser parses boolean values
func DefaultBoolParser(value string, previous any) (any, error) {
	if value == "" {
		return true, nil // Flag without value defaults to true
	}

	// Handle common boolean representations
	switch strings.ToLower(value) {
	case "true", "t", "yes", "y", "1", "on", "enable", "enabled":
		return true, nil
	case "false", "f", "no", "n", "0", "off", "disable", "disabled":
		return false, nil
	default:
		return strconv.ParseBool(value)
	}
}

// DefaultNumberParser parses numeric values (int or float)
func DefaultNumberParser(value string, previous any) (any, error) {
	// Try parsing as int first
	if intVal, err := strconv.Atoi(value); err == nil {
		return intVal, nil
	}
	// Fall back to float
	return strconv.ParseFloat(value, 64)
}

// DefaultIntParser parses integer values
func DefaultIntParser(value string, previous any) (any, error) {
	return strconv.Atoi(value)
}

// DefaultFloatParser parses float values
func DefaultFloatParser(value string, previous any) (any, error) {
	return strconv.ParseFloat(value, 64)
}

// ProcessOptionValue processes an option value with all validation and parsing
func (o *Option) ProcessOptionValue(value string, previous any, isNegated bool) (any, error) {
	// Handle negatable boolean options
	if o.Negatable && o.Type == OptionTypeBoolean {
		// For negatable options, the negation flag determines the value
		if isNegated {
			return false, nil
		}
		return true, nil
	}

	// Handle environment variable resolution (but don't override explicit CLI values)
	if o.Env != "" && value == "" {
		if envValue := os.Getenv(o.Env); envValue != "" {
			value = envValue
		}
	}

	// Use preset value if no value provided and preset exists
	if value == "" && o.Preset != nil {
		return o.Preset, nil
	}

	// For boolean options without explicit value, default to true
	if o.Type == OptionTypeBoolean && value == "" {
		return true, nil
	}

	// Parse the value with enhanced error handling
	parsedValue, err := o.ParseValue(value, previous)
	if err != nil {
		return nil, fmt.Errorf("failed to parse option %s: %v", o.Flags, err)
	}

	return parsedValue, nil
}

// GetChoicesString returns a formatted string of available choices
func (o *Option) GetChoicesString() string {
	if len(o.Choices) == 0 {
		return ""
	}
	return strings.Join(o.Choices, ", ")
}

// IsCompatibleWith checks if this option is compatible with another option
func (o *Option) IsCompatibleWith(other *Option) error {
	// Check for flag conflicts
	if o.Short != "" && other.Short != "" && o.Short == other.Short {
		return fmt.Errorf("short flag conflict: both options use -%s", o.Short)
	}

	if o.Long != "" && other.Long != "" && o.Long == other.Long {
		return fmt.Errorf("long flag conflict: both options use --%s", o.Long)
	}

	// Check explicit conflicts
	if slices.ContainsFunc(o.Conflicts, func(conflict string) bool {
		return other.Matches(conflict)
	}) {
		return fmt.Errorf("option %s conflicts with %s", o.Flags, other.Flags)
	}

	return nil
}

// GetImpliedOptions returns options that should be set when this option is used
func (o *Option) GetImpliedOptions() []string {
	return o.Implies
}

// CreateNegatableOption creates a negatable boolean option
func CreateNegatableOption(flags, description string) *Option {
	option := NewBooleanOption(flags, description)
	option.Negatable = true
	return option
}

// CreateChoiceOption creates an option with predefined choices
func CreateChoiceOption(flags, description string, choices []string) *Option {
	option := NewOption(flags, description)
	option.SetChoices(choices)
	return option
}

// CreateEnvOption creates an option that can be set via environment variable
func CreateEnvOption(flags, description, envVar string) *Option {
	option := NewOption(flags, description)
	option.SetEnv(envVar)
	return option
}

// CreateRequiredOption creates a required option
func CreateRequiredOption(flags, description string) *Option {
	option := NewOption(flags, description)
	option.SetRequired(true)
	return option
}

// CreateNumberOption creates an option that expects numeric values
func CreateNumberOption(flags, description string) *Option {
	option := NewOption(flags, description)
	option.Type = OptionTypeNumber
	return option
}

// CreateOptionalValueOption creates an option with an optional value
func CreateOptionalValueOption(flags, description string, defaultValue any) *Option {
	option := NewOption(flags, description)
	option.Optional = true
	option.SetDefault(defaultValue)
	return option
}

// OptionProcessor handles complex option processing scenarios
type OptionProcessor struct {
	options map[string]*Option
	values  map[string]any
}

// NewOptionProcessor creates a new option processor
func NewOptionProcessor() *OptionProcessor {
	return &OptionProcessor{
		options: make(map[string]*Option),
		values:  make(map[string]any),
	}
}

// AddOption adds an option to the processor
func (op *OptionProcessor) AddOption(option *Option) error {
	key := getOptionKey(option)

	// Check for conflicts with existing options
	for _, existing := range op.options {
		if err := option.IsCompatibleWith(existing); err != nil {
			return err
		}
	}

	op.options[key] = option

	// Set default value if provided
	if option.Default != nil {
		op.values[key] = option.Default
	}

	return nil
}

// ProcessOption processes a single option with its value
func (op *OptionProcessor) ProcessOption(flag, value string) error {
	// Find the option
	var option *Option
	var key string
	var isNegated bool

	for k, opt := range op.options {
		if opt.Matches(flag) {
			option = opt
			key = k
			isNegated = opt.IsNegated(flag)
			break
		}
	}

	if option == nil {
		return fmt.Errorf("unknown option: %s", flag)
	}

	// Get current value
	currentValue := op.values[key]

	// Process the value with negation information
	processedValue, err := option.ProcessOptionValue(value, currentValue, isNegated)
	if err != nil {
		return fmt.Errorf("error processing option %s: %v", flag, err)
	}

	// Store the processed value
	op.values[key] = processedValue

	// Handle implied options
	for _, implied := range option.GetImpliedOptions() {
		if impliedOption, exists := op.options[implied]; exists {
			if impliedOption.Default != nil {
				op.values[implied] = impliedOption.Default
			}
		}
	}

	return nil
}

// ProcessBooleanOption processes a boolean option (flag without value)
func (op *OptionProcessor) ProcessBooleanOption(flag string) error {
	return op.ProcessOption(flag, "")
}

// ProcessValueOption processes an option with an explicit value
func (op *OptionProcessor) ProcessValueOption(flag, value string) error {
	return op.ProcessOption(flag, value)
}

// ProcessVariadicOption processes a variadic option with multiple values
func (op *OptionProcessor) ProcessVariadicOption(flag string, values []string) error {
	// Find the option
	var option *Option
	var key string

	for k, opt := range op.options {
		if opt.Matches(flag) {
			option = opt
			key = k
			break
		}
	}

	if option == nil {
		return fmt.Errorf("unknown option: %s", flag)
	}

	if !option.Variadic {
		return fmt.Errorf("option %s is not variadic", flag)
	}

	// Process each value
	var currentValue any
	if existing, exists := op.values[key]; exists {
		currentValue = existing
	}

	for _, value := range values {
		processedValue, err := option.ProcessOptionValue(value, currentValue, false)
		if err != nil {
			return fmt.Errorf("error processing variadic option %s with value %s: %v", flag, value, err)
		}
		currentValue = processedValue
	}

	op.values[key] = currentValue
	return nil
}

// ValidateOptions validates all processed options
func (op *OptionProcessor) ValidateOptions() error {
	// Check required options
	for key, option := range op.options {
		if option.Required {
			if _, exists := op.values[key]; !exists {
				return fmt.Errorf("missing required option: %s", option.Flags)
			}
		}
	}

	// Check conflicts
	for key1, option1 := range op.options {
		if _, exists1 := op.values[key1]; !exists1 {
			continue
		}

		for _, conflict := range option1.Conflicts {
			for key2, option2 := range op.options {
				if option2.Matches(conflict) {
					if _, exists2 := op.values[key2]; exists2 {
						return fmt.Errorf("conflicting options: %s and %s", option1.Flags, option2.Flags)
					}
				}
			}
		}
	}

	return nil
}

// GetValues returns all processed option values
func (op *OptionProcessor) GetValues() map[string]any {
	result := make(map[string]any)
	for k, v := range op.values {
		result[k] = v
	}
	return result
}

// GetValue returns the value for a specific option
func (op *OptionProcessor) GetValue(key string) (any, bool) {
	value, exists := op.values[key]
	return value, exists
}

// getOptionKey returns the preferred key for an option (helper function)
func getOptionKey(option *Option) string {
	if option.Long != "" {
		return option.Long
	}
	return option.Short
}

// AdvancedOptionParser provides advanced parsing capabilities
type AdvancedOptionParser struct {
	// Custom parsers for specific option types
	CustomParsers map[string]OptionParser

	// Type coercion rules
	CoercionRules map[OptionType]OptionParser

	// Validation rules
	ValidationRules map[string]func(any) error
}

// NewAdvancedOptionParser creates a new advanced option parser
func NewAdvancedOptionParser() *AdvancedOptionParser {
	parser := &AdvancedOptionParser{
		CustomParsers:   make(map[string]OptionParser),
		CoercionRules:   make(map[OptionType]OptionParser),
		ValidationRules: make(map[string]func(any) error),
	}

	// Set up default coercion rules
	parser.CoercionRules[OptionTypeBoolean] = DefaultBoolParser
	parser.CoercionRules[OptionTypeNumber] = DefaultNumberParser
	parser.CoercionRules[OptionTypeString] = func(value string, previous any) (any, error) {
		return value, nil
	}

	return parser
}

// RegisterCustomParser registers a custom parser for a specific option flag
func (ap *AdvancedOptionParser) RegisterCustomParser(flag string, parser OptionParser) {
	ap.CustomParsers[flag] = parser
}

// RegisterValidationRule registers a validation rule for an option
func (ap *AdvancedOptionParser) RegisterValidationRule(flag string, validator func(any) error) {
	ap.ValidationRules[flag] = validator
}

// ParseOptionValue parses an option value using advanced rules
func (ap *AdvancedOptionParser) ParseOptionValue(option *Option, value string, previous any) (any, error) {
	key := getOptionKey(option)

	// Use custom parser if available
	if parser, exists := ap.CustomParsers[key]; exists {
		result, err := parser(value, previous)
		if err != nil {
			return nil, err
		}

		// Apply validation if available
		if validator, exists := ap.ValidationRules[key]; exists {
			if err := validator(result); err != nil {
				return nil, err
			}
		}

		return result, nil
	}

	// Use type-based coercion
	if coercer, exists := ap.CoercionRules[option.Type]; exists {
		result, err := coercer(value, previous)
		if err != nil {
			return nil, err
		}

		// Apply validation if available
		if validator, exists := ap.ValidationRules[key]; exists {
			if err := validator(result); err != nil {
				return nil, err
			}
		}

		return result, nil
	}

	// Fall back to option's own parser
	return option.ParseValue(value, previous)
}

// OptionGroup represents a group of related options
type OptionGroup struct {
	Name        string
	Description string
	Options     []*Option
	Exclusive   bool // If true, only one option in the group can be set
	Required    bool // If true, at least one option in the group must be set
}

// NewOptionGroup creates a new option group
func NewOptionGroup(name, description string) *OptionGroup {
	return &OptionGroup{
		Name:        name,
		Description: description,
		Options:     make([]*Option, 0),
		Exclusive:   false,
		Required:    false,
	}
}

// AddOption adds an option to the group
func (og *OptionGroup) AddOption(option *Option) *OptionGroup {
	og.Options = append(og.Options, option)
	return og
}

// SetExclusive marks the group as mutually exclusive
func (og *OptionGroup) SetExclusive(exclusive bool) *OptionGroup {
	og.Exclusive = exclusive
	return og
}

// SetRequired marks the group as required
func (og *OptionGroup) SetRequired(required bool) *OptionGroup {
	og.Required = required
	return og
}

// Validate validates the option group constraints
func (og *OptionGroup) Validate(values map[string]any) error {
	setOptions := make([]*Option, 0)

	// Find which options in the group are set
	for _, option := range og.Options {
		key := getOptionKey(option)
		if _, exists := values[key]; exists {
			setOptions = append(setOptions, option)
		}
	}

	// Check exclusive constraint
	if og.Exclusive && len(setOptions) > 1 {
		optionNames := make([]string, len(setOptions))
		for i, opt := range setOptions {
			optionNames[i] = opt.Flags
		}
		return fmt.Errorf("options in group '%s' are mutually exclusive, but multiple were set: %s",
			og.Name, strings.Join(optionNames, ", "))
	}

	// Check required constraint
	if og.Required && len(setOptions) == 0 {
		return fmt.Errorf("at least one option from group '%s' is required", og.Name)
	}

	return nil
}

// EnhancedOptionProcessor extends OptionProcessor with advanced features
type EnhancedOptionProcessor struct {
	*OptionProcessor
	groups          []*OptionGroup
	customValidator func(map[string]any) error
	preprocessors   map[string]func(string) (string, error)
	postprocessors  map[string]func(any) (any, error)
}

// NewEnhancedOptionProcessor creates a new enhanced option processor
func NewEnhancedOptionProcessor() *EnhancedOptionProcessor {
	return &EnhancedOptionProcessor{
		OptionProcessor: NewOptionProcessor(),
		groups:          make([]*OptionGroup, 0),
		preprocessors:   make(map[string]func(string) (string, error)),
		postprocessors:  make(map[string]func(any) (any, error)),
	}
}

// AddOptionGroup adds an option group
func (eop *EnhancedOptionProcessor) AddOptionGroup(group *OptionGroup) *EnhancedOptionProcessor {
	eop.groups = append(eop.groups, group)

	// Add all options from the group to the processor
	for _, option := range group.Options {
		eop.AddOption(option)
	}

	return eop
}

// SetCustomValidator sets a custom validation function
func (eop *EnhancedOptionProcessor) SetCustomValidator(validator func(map[string]any) error) *EnhancedOptionProcessor {
	eop.customValidator = validator
	return eop
}

// AddPreprocessor adds a preprocessor for a specific option
func (eop *EnhancedOptionProcessor) AddPreprocessor(optionKey string, preprocessor func(string) (string, error)) *EnhancedOptionProcessor {
	eop.preprocessors[optionKey] = preprocessor
	return eop
}

// AddPostprocessor adds a postprocessor for a specific option
func (eop *EnhancedOptionProcessor) AddPostprocessor(optionKey string, postprocessor func(any) (any, error)) *EnhancedOptionProcessor {
	eop.postprocessors[optionKey] = postprocessor
	return eop
}

// ProcessOptionWithEnhancements processes an option with preprocessing and postprocessing
func (eop *EnhancedOptionProcessor) ProcessOptionWithEnhancements(flag, value string) error {
	// Find the option to get its key
	var optionKey string
	var option *Option
	for k, opt := range eop.options {
		if opt.Matches(flag) {
			optionKey = k
			option = opt
			break
		}
	}

	if optionKey == "" {
		return fmt.Errorf("unknown option: %s", flag)
	}

	// Apply preprocessing if available
	if preprocessor, exists := eop.preprocessors[optionKey]; exists {
		processedValue, err := preprocessor(value)
		if err != nil {
			return fmt.Errorf("preprocessing failed for option %s: %v", flag, err)
		}
		value = processedValue
	}

	// Handle environment variable integration
	if option.Env != "" && value == "" {
		if envValue := os.Getenv(option.Env); envValue != "" {
			value = envValue
		}
	}

	// Process the option normally
	if err := eop.ProcessOption(flag, value); err != nil {
		return err
	}

	// Apply postprocessing if available
	if postprocessor, exists := eop.postprocessors[optionKey]; exists {
		currentValue := eop.values[optionKey]
		processedValue, err := postprocessor(currentValue)
		if err != nil {
			return fmt.Errorf("postprocessing failed for option %s: %v", flag, err)
		}
		eop.values[optionKey] = processedValue
	}

	// Handle option implications
	for _, implied := range option.GetImpliedOptions() {
		if impliedOption, exists := eop.options[implied]; exists {
			if _, hasValue := eop.values[implied]; !hasValue {
				impliedValue := impliedOption.Default
				if impliedValue == nil && impliedOption.Type == OptionTypeBoolean {
					impliedValue = true
				}
				if impliedValue != nil {
					eop.values[implied] = impliedValue
				}
			}
		}
	}

	return nil
}

// ValidateEnhanced performs enhanced validation including groups and custom validators
func (eop *EnhancedOptionProcessor) ValidateEnhanced() error {
	// Perform basic validation
	if err := eop.ValidateOptions(); err != nil {
		return err
	}

	// Validate option groups
	for _, group := range eop.groups {
		if err := group.Validate(eop.values); err != nil {
			return err
		}
	}

	// Apply custom validation
	if eop.customValidator != nil {
		if err := eop.customValidator(eop.values); err != nil {
			return err
		}
	}

	return nil
}

// OptionProcessingContext provides context for option processing
type OptionProcessingContext struct {
	Command     *Command
	CurrentFlag string
	RawValue    string
	ParsedValue any
	IsNegated   bool
	Position    int
}

// ContextualOptionProcessor processes options with full context awareness
type ContextualOptionProcessor struct {
	*EnhancedOptionProcessor
	contextHandlers map[string]func(*OptionProcessingContext) error
}

// NewContextualOptionProcessor creates a new contextual option processor
func NewContextualOptionProcessor() *ContextualOptionProcessor {
	return &ContextualOptionProcessor{
		EnhancedOptionProcessor: NewEnhancedOptionProcessor(),
		contextHandlers:         make(map[string]func(*OptionProcessingContext) error),
	}
}

// AddContextHandler adds a context-aware handler for an option
func (cop *ContextualOptionProcessor) AddContextHandler(optionKey string, handler func(*OptionProcessingContext) error) *ContextualOptionProcessor {
	cop.contextHandlers[optionKey] = handler
	return cop
}

// ProcessOptionWithContext processes an option with full context
func (cop *ContextualOptionProcessor) ProcessOptionWithContext(cmd *Command, flag, value string, position int) error {
	// Create processing context
	context := &OptionProcessingContext{
		Command:     cmd,
		CurrentFlag: flag,
		RawValue:    value,
		Position:    position,
	}

	// Find the option
	var option *Option
	var optionKey string
	for k, opt := range cop.options {
		if opt.Matches(flag) {
			option = opt
			optionKey = k
			context.IsNegated = opt.IsNegated(flag)
			break
		}
	}

	if option == nil {
		return fmt.Errorf("unknown option: %s", flag)
	}

	// Process the option value
	currentValue := cop.values[optionKey]
	processedValue, err := option.ProcessOptionValue(value, currentValue, context.IsNegated)
	if err != nil {
		return err
	}

	context.ParsedValue = processedValue
	cop.values[optionKey] = processedValue

	// Apply context handler if available
	if handler, exists := cop.contextHandlers[optionKey]; exists {
		if err := handler(context); err != nil {
			return fmt.Errorf("context handler failed for option %s: %v", flag, err)
		}
	}

	return nil
}

// GetOptionProcessingSummary returns a summary of processed options
func (cop *ContextualOptionProcessor) GetOptionProcessingSummary() map[string]any {
	summary := make(map[string]any)

	summary["processedOptions"] = len(cop.values)
	summary["optionGroups"] = len(cop.groups)
	summary["contextHandlers"] = len(cop.contextHandlers)

	// Count options by type
	typeCounts := make(map[string]int)
	for _, option := range cop.options {
		switch option.Type {
		case OptionTypeBoolean:
			typeCounts["boolean"]++
		case OptionTypeString:
			typeCounts["string"]++
		case OptionTypeNumber:
			typeCounts["number"]++
		case OptionTypeVariadic:
			typeCounts["variadic"]++
		}
	}
	summary["optionTypes"] = typeCounts

	return summary
}
