package cmd

import (
	"fmt"
	"strconv"
	"strings"
)

// OptionParser represents a function that parses option values
type OptionParser func(value string) (interface{}, error)

// Option represents a command-line option
type Option struct {
	Flags       string
	Description string
	Required    bool
	Variadic    bool
	Default     interface{}
	Choices     []string
	Parser      OptionParser
	Short       string
	Long        string
}

// NewOption creates a new option with the given flags and description
func NewOption(flags, description string) *Option {
	option := &Option{
		Flags:       flags,
		Description: description,
	}
	option.parseFlags()
	return option
}

// parseFlags parses the flags string to extract short and long flag names
func (o *Option) parseFlags() {
	parts := strings.Split(o.Flags, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "--") {
			o.Long = strings.TrimPrefix(part, "--")
		} else if strings.HasPrefix(part, "-") {
			o.Short = strings.TrimPrefix(part, "-")
		}
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
func (o *Option) SetDefault(defaultValue interface{}) *Option {
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

// ParseValue parses a string value using the option's parser or default parsing
func (o *Option) ParseValue(value string) (interface{}, error) {
	if o.Parser != nil {
		return o.Parser(value)
	}
	
	// Default parsing logic
	if o.Choices != nil && len(o.Choices) > 0 {
		for _, choice := range o.Choices {
			if choice == value {
				return value, nil
			}
		}
		return nil, fmt.Errorf("invalid choice '%s', expected one of: %s", value, strings.Join(o.Choices, ", "))
	}
	
	return value, nil
}

// Matches checks if the given flag matches this option
func (o *Option) Matches(flag string) bool {
	if o.Short != "" && flag == o.Short {
		return true
	}
	if o.Long != "" && flag == o.Long {
		return true
	}
	return false
}

// DefaultBoolParser parses boolean values
func DefaultBoolParser(value string) (interface{}, error) {
	return strconv.ParseBool(value)
}

// DefaultIntParser parses integer values
func DefaultIntParser(value string) (interface{}, error) {
	return strconv.Atoi(value)
}

// DefaultFloatParser parses float values
func DefaultFloatParser(value string) (interface{}, error) {
	return strconv.ParseFloat(value, 64)
}