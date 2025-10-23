package cmd

import (
	"fmt"
	"strings"
)

// ArgumentParser represents a function that parses argument values
type ArgumentParser func(value string) (interface{}, error)

// Argument represents a command-line argument
type Argument struct {
	Name        string
	Description string
	Required    bool
	Variadic    bool
	Default     interface{}
	Choices     []string
	Parser      ArgumentParser
}

// NewArgument creates a new argument with the given name and description
func NewArgument(name, description string) *Argument {
	return &Argument{
		Name:        name,
		Description: description,
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
func (a *Argument) SetDefault(defaultValue interface{}) *Argument {
	a.Default = defaultValue
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
func (a *Argument) ParseValue(value string) (interface{}, error) {
	if a.Parser != nil {
		return a.Parser(value)
	}
	
	// Default parsing logic
	if a.Choices != nil && len(a.Choices) > 0 {
		for _, choice := range a.Choices {
			if choice == value {
				return value, nil
			}
		}
		return nil, fmt.Errorf("invalid choice '%s', expected one of: %s", value, strings.Join(a.Choices, ", "))
	}
	
	return value, nil
}

// Validate validates the argument value against constraints
func (a *Argument) Validate(value interface{}) error {
	if a.Required && value == nil {
		return fmt.Errorf("argument '%s' is required", a.Name)
	}
	
	if value != nil && a.Choices != nil && len(a.Choices) > 0 {
		valueStr := fmt.Sprintf("%v", value)
		for _, choice := range a.Choices {
			if choice == valueStr {
				return nil
			}
		}
		return fmt.Errorf("invalid choice '%s' for argument '%s', expected one of: %s", 
			valueStr, a.Name, strings.Join(a.Choices, ", "))
	}
	
	return nil
}