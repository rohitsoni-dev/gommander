//go:build wasm

package main

import (
	"fmt"
	"reflect"
	"syscall/js"
	"testing"
	"time"

	"github.com/rohitsoni-dev/gocommander/cmd"
)

func TestTypeConverterCreation(t *testing.T) {
	tc := NewTypeConverter()

	if tc == nil {
		t.Error("Expected non-nil TypeConverter")
	}

	if tc.customConverters == nil {
		t.Error("Expected initialized custom converters map")
	}

	if tc.validationRules == nil {
		t.Error("Expected initialized validation rules map")
	}
}

func TestBasicGoToJSConversion(t *testing.T) {
	tc := NewTypeConverter()

	tests := []struct {
		name     string
		input    any
		expected js.Type
	}{
		{"nil", nil, js.TypeNull},
		{"bool true", true, js.TypeBoolean},
		{"bool false", false, js.TypeBoolean},
		{"int", 42, js.TypeNumber},
		{"int64", int64(123), js.TypeNumber},
		{"float64", 3.14, js.TypeNumber},
		{"string", "hello", js.TypeString},
		{"empty string", "", js.TypeString},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := tc.GoToJS(tt.input)
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if result.Type() != tt.expected {
				t.Errorf("Expected type %v, got %v", tt.expected, result.Type())
			}

			// Verify value for non-nil cases
			if tt.input != nil {
				switch v := tt.input.(type) {
				case bool:
					if result.Bool() != v {
						t.Errorf("Expected %v, got %v", v, result.Bool())
					}
				case int:
					if int(result.Float()) != v {
						t.Errorf("Expected %v, got %v", v, int(result.Float()))
					}
				case int64:
					if int64(result.Float()) != v {
						t.Errorf("Expected %v, got %v", v, int64(result.Float()))
					}
				case float64:
					if result.Float() != v {
						t.Errorf("Expected %v, got %v", v, result.Float())
					}
				case string:
					if result.String() != v {
						t.Errorf("Expected %v, got %v", v, result.String())
					}
				}
			}
		})
	}
}

func TestSliceConversion(t *testing.T) {
	tc := NewTypeConverter()

	tests := []struct {
		name  string
		input []any
	}{
		{"empty slice", []any{}},
		{"mixed types", []any{1, "hello", true, 3.14}},
		{"nested slice", []any{[]any{1, 2}, []any{"a", "b"}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := tc.GoToJS(tt.input)
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if result.Type() != js.TypeObject {
				t.Errorf("Expected object type, got %v", result.Type())
			}

			if !result.InstanceOf(js.Global().Get("Array")) {
				t.Error("Expected Array instance")
			}

			if result.Length() != len(tt.input) {
				t.Errorf("Expected length %d, got %d", len(tt.input), result.Length())
			}
		})
	}
}

func TestMapConversion(t *testing.T) {
	tc := NewTypeConverter()

	tests := []struct {
		name  string
		input map[string]any
	}{
		{"empty map", map[string]any{}},
		{"simple map", map[string]any{"key1": "value1", "key2": 42}},
		{"nested map", map[string]any{"outer": map[string]any{"inner": "value"}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := tc.GoToJS(tt.input)
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if result.Type() != js.TypeObject {
				t.Errorf("Expected object type, got %v", result.Type())
			}

			// Verify keys exist
			for key := range tt.input {
				if result.Get(key).Type() == js.TypeUndefined {
					t.Errorf("Expected key %s to exist", key)
				}
			}
		})
	}
}

func TestBasicJSToGoConversion(t *testing.T) {
	tc := NewTypeConverter()

	tests := []struct {
		name     string
		jsValue  js.Value
		expected any
	}{
		{"undefined", js.Undefined(), nil},
		{"null", js.Null(), nil},
		{"boolean true", js.ValueOf(true), true},
		{"boolean false", js.ValueOf(false), false},
		{"number int", js.ValueOf(42), int64(42)},
		{"number float", js.ValueOf(3.14), 3.14},
		{"string", js.ValueOf("hello"), "hello"},
		{"empty string", js.ValueOf(""), ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := tc.JSToGo(tt.jsValue)
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !reflect.DeepEqual(result, tt.expected) {
				t.Errorf("Expected %v (%T), got %v (%T)", tt.expected, tt.expected, result, result)
			}
		})
	}
}

func TestJSArrayToGoSlice(t *testing.T) {
	tc := NewTypeConverter()

	// Create JS array
	jsArray := js.Global().Get("Array").New(3)
	jsArray.SetIndex(0, js.ValueOf(1))
	jsArray.SetIndex(1, js.ValueOf("hello"))
	jsArray.SetIndex(2, js.ValueOf(true))

	result, err := tc.JSToGo(jsArray)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
		return
	}

	slice, ok := result.([]any)
	if !ok {
		t.Errorf("Expected []any, got %T", result)
		return
	}

	if len(slice) != 3 {
		t.Errorf("Expected length 3, got %d", len(slice))
	}

	expected := []any{int64(1), "hello", true}
	for i, exp := range expected {
		if !reflect.DeepEqual(slice[i], exp) {
			t.Errorf("Element %d: expected %v, got %v", i, exp, slice[i])
		}
	}
}

func TestJSObjectToGoMap(t *testing.T) {
	tc := NewTypeConverter()

	// Create JS object
	jsObj := js.Global().Get("Object").New()
	jsObj.Set("key1", js.ValueOf("value1"))
	jsObj.Set("key2", js.ValueOf(42))
	jsObj.Set("key3", js.ValueOf(true))

	result, err := tc.JSToGo(jsObj)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
		return
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Errorf("Expected map[string]any, got %T", result)
		return
	}

	expected := map[string]any{
		"key1": "value1",
		"key2": int64(42),
		"key3": true,
	}

	for key, exp := range expected {
		if !reflect.DeepEqual(m[key], exp) {
			t.Errorf("Key %s: expected %v, got %v", key, exp, m[key])
		}
	}
}

func TestTypeConversion(t *testing.T) {
	tc := NewTypeConverter()

	tests := []struct {
		name       string
		input      any
		targetType reflect.Type
		expected   any
	}{
		{"int to string", 42, reflect.TypeOf(""), "42"},
		{"string to int", "123", reflect.TypeOf(int(0)), 123},
		{"string to bool true", "true", reflect.TypeOf(true), true},
		{"string to bool false", "false", reflect.TypeOf(false), false},
		{"int to float", 42, reflect.TypeOf(float64(0)), float64(42)},
		{"float to int", 3.14, reflect.TypeOf(int(0)), 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := tc.convertToType(tt.input, tt.targetType)
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !reflect.DeepEqual(result, tt.expected) {
				t.Errorf("Expected %v (%T), got %v (%T)", tt.expected, tt.expected, result, result)
			}
		})
	}
}

func TestStringConversion(t *testing.T) {
	tc := NewTypeConverter()

	tests := []struct {
		name     string
		input    any
		expected string
	}{
		{"string", "hello", "hello"},
		{"int", 42, "42"},
		{"float", 3.14, "3.14"},
		{"bool true", true, "true"},
		{"bool false", false, "false"},
		{"bytes", []byte("hello"), "hello"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := tc.convertToString(tt.input)
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if result != tt.expected {
				t.Errorf("Expected %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestBoolConversion(t *testing.T) {
	tc := NewTypeConverter()

	tests := []struct {
		name        string
		input       any
		expected    bool
		expectError bool
	}{
		{"bool true", true, true, false},
		{"bool false", false, false, false},
		{"string true", "true", true, false},
		{"string false", "false", false, false},
		{"string 1", "1", true, false},
		{"string 0", "0", false, false},
		{"int non-zero", int64(42), true, false},
		{"int zero", int64(0), false, false},
		{"float non-zero", 3.14, true, false},
		{"float zero", 0.0, false, false},
		{"invalid string", "maybe", false, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := tc.convertToBool(tt.input)

			if tt.expectError && err == nil {
				t.Error("Expected error but got none")
				return
			}

			if !tt.expectError && err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !tt.expectError && result != tt.expected {
				t.Errorf("Expected %v, got %v", tt.expected, result)
			}
		})
	}
}

func TestIntConversion(t *testing.T) {
	tc := NewTypeConverter()

	tests := []struct {
		name        string
		input       any
		targetType  reflect.Type
		expected    any
		expectError bool
	}{
		{"int64 to int", int64(42), reflect.TypeOf(int(0)), int(42), false},
		{"float to int32", 42.7, reflect.TypeOf(int32(0)), int32(42), false},
		{"string to int16", "123", reflect.TypeOf(int16(0)), int16(123), false},
		{"bool true to int8", true, reflect.TypeOf(int8(0)), int8(1), false},
		{"bool false to int64", false, reflect.TypeOf(int64(0)), int64(0), false},
		{"invalid string", "not-a-number", reflect.TypeOf(int(0)), nil, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := tc.convertToInt(tt.input, tt.targetType)

			if tt.expectError && err == nil {
				t.Error("Expected error but got none")
				return
			}

			if !tt.expectError && err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !tt.expectError && !reflect.DeepEqual(result, tt.expected) {
				t.Errorf("Expected %v (%T), got %v (%T)", tt.expected, tt.expected, result, result)
			}
		})
	}
}

func TestSliceConversionDetailed(t *testing.T) {
	tc := NewTypeConverter()

	// Test converting []any to []string
	input := []any{"hello", "world", 123}
	targetType := reflect.TypeOf([]string{})

	result, err := tc.convertToSlice(input, targetType)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
		return
	}

	stringSlice, ok := result.([]string)
	if !ok {
		t.Errorf("Expected []string, got %T", result)
		return
	}

	expected := []string{"hello", "world", "123"}
	if !reflect.DeepEqual(stringSlice, expected) {
		t.Errorf("Expected %v, got %v", expected, stringSlice)
	}
}

func TestMapConversionDetailed(t *testing.T) {
	tc := NewTypeConverter()

	// Test converting map[string]any to map[string]int
	input := map[string]any{"a": int64(1), "b": "2", "c": 3.0}
	targetType := reflect.TypeOf(map[string]int{})

	result, err := tc.convertToMap(input, targetType)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
		return
	}

	intMap, ok := result.(map[string]int)
	if !ok {
		t.Errorf("Expected map[string]int, got %T", result)
		return
	}

	expected := map[string]int{"a": 1, "b": 2, "c": 3}
	if !reflect.DeepEqual(intMap, expected) {
		t.Errorf("Expected %v, got %v", expected, intMap)
	}
}

func TestStructConversion(t *testing.T) {
	tc := NewTypeConverter()

	type TestStruct struct {
		Name  string `json:"name"`
		Age   int    `json:"age"`
		Email string `json:"email"`
	}

	input := map[string]any{
		"name":  "John Doe",
		"age":   int64(30),
		"email": "john@example.com",
	}

	result, err := tc.convertToStruct(input, reflect.TypeOf(TestStruct{}))
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
		return
	}

	testStruct, ok := result.(TestStruct)
	if !ok {
		t.Errorf("Expected TestStruct, got %T", result)
		return
	}

	expected := TestStruct{
		Name:  "John Doe",
		Age:   30,
		Email: "john@example.com",
	}

	if !reflect.DeepEqual(testStruct, expected) {
		t.Errorf("Expected %v, got %v", expected, testStruct)
	}
}

func TestErrorSerialization(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected map[string]any
	}{
		{
			name: "CommanderError",
			err: &cmd.CommanderError{
				Code:     "INVALID_OPTION",
				Message:  "Invalid option provided",
				ExitCode: 1,
				Command:  "test",
			},
			expected: map[string]any{
				"type":     "CommanderError",
				"code":     "INVALID_OPTION",
				"message":  "Invalid option provided",
				"exitCode": 1,
				"command":  "test",
			},
		},
		{
			name: "ValidationError",
			err: &cmd.ValidationError{
				Command: "test",
				Field:   "name",
				Message: "Name is required",
			},
			expected: map[string]any{
				"type":    "ValidationError",
				"command": "test",
				"field":   "name",
				"message": "Name is required",
			},
		},
		{
			name: "generic error",
			err:  fmt.Errorf("generic error message"),
			expected: map[string]any{
				"type":    "Error",
				"message": "generic error message",
			},
		},
		{
			name:     "nil error",
			err:      nil,
			expected: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := SerializeError(tt.err)

			if tt.expected == nil && result != nil {
				t.Errorf("Expected nil, got %v", result)
				return
			}

			if tt.expected != nil && result == nil {
				t.Error("Expected non-nil result")
				return
			}

			if tt.expected != nil {
				for key, expectedValue := range tt.expected {
					if result[key] != expectedValue {
						t.Errorf("Key %s: expected %v, got %v", key, expectedValue, result[key])
					}
				}
			}
		})
	}
}

func TestErrorDeserialization(t *testing.T) {
	tests := []struct {
		name      string
		errorData map[string]any
		checkErr  func(error) bool
	}{
		{
			name: "CommanderError",
			errorData: map[string]any{
				"type":     "CommanderError",
				"code":     "INVALID_OPTION",
				"message":  "Invalid option provided",
				"exitCode": 1,
				"command":  "test",
			},
			checkErr: func(err error) bool {
				cmdErr, ok := err.(*cmd.CommanderError)
				return ok && cmdErr.Code == "INVALID_OPTION" && cmdErr.Message == "Invalid option provided"
			},
		},
		{
			name: "ValidationError",
			errorData: map[string]any{
				"type":    "ValidationError",
				"command": "test",
				"field":   "name",
				"message": "Name is required",
			},
			checkErr: func(err error) bool {
				valErr, ok := err.(*cmd.ValidationError)
				return ok && valErr.Command == "test" && valErr.Field == "name"
			},
		},
		{
			name: "generic error",
			errorData: map[string]any{
				"type":    "Error",
				"message": "generic error message",
			},
			checkErr: func(err error) bool {
				return err.Error() == "generic error message"
			},
		},
		{
			name:      "nil error data",
			errorData: nil,
			checkErr: func(err error) bool {
				return err == nil
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := DeserializeError(tt.errorData)

			if !tt.checkErr(result) {
				t.Errorf("Error check failed for result: %v", result)
			}
		})
	}
}

func TestCustomConverters(t *testing.T) {
	tc := NewTypeConverter()

	// Test time conversion
	now := time.Now()
	result, err := tc.GoToJS(now)
	if err != nil {
		t.Errorf("Unexpected error converting time: %v", err)
		return
	}

	if result.Type() != js.TypeString {
		t.Errorf("Expected string type for time, got %v", result.Type())
	}

	// Verify it's a valid RFC3339 string
	timeStr := result.String()
	_, err = time.Parse(time.RFC3339, timeStr)
	if err != nil {
		t.Errorf("Invalid RFC3339 time string: %v", err)
	}
}

func TestComplexNestedConversion(t *testing.T) {
	tc := NewTypeConverter()

	// Test complex nested structure
	input := map[string]any{
		"users": []any{
			map[string]any{
				"name": "Alice",
				"age":  25,
				"tags": []any{"admin", "user"},
			},
			map[string]any{
				"name": "Bob",
				"age":  30,
				"tags": []any{"user"},
			},
		},
		"metadata": map[string]any{
			"version": "1.0",
			"active":  true,
		},
	}

	result, err := tc.GoToJS(input)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
		return
	}

	if result.Type() != js.TypeObject {
		t.Errorf("Expected object type, got %v", result.Type())
	}

	// Verify structure
	users := result.Get("users")
	if !users.InstanceOf(js.Global().Get("Array")) {
		t.Error("Expected users to be an array")
	}

	if users.Length() != 2 {
		t.Errorf("Expected 2 users, got %d", users.Length())
	}

	metadata := result.Get("metadata")
	if metadata.Type() != js.TypeObject {
		t.Error("Expected metadata to be an object")
	}

	if metadata.Get("version").String() != "1.0" {
		t.Errorf("Expected version '1.0', got %s", metadata.Get("version").String())
	}
}

func TestConversionErrorHandling(t *testing.T) {
	tc := NewTypeConverter()

	tests := []struct {
		name     string
		function func() error
	}{
		{
			name: "invalid bool conversion",
			function: func() error {
				_, err := tc.convertToBool("invalid")
				return err
			},
		},
		{
			name: "invalid int conversion",
			function: func() error {
				_, err := tc.convertToInt("not-a-number", reflect.TypeOf(int(0)))
				return err
			},
		},
		{
			name: "invalid float conversion",
			function: func() error {
				_, err := tc.convertToFloat("not-a-float", reflect.TypeOf(float64(0)))
				return err
			},
		},
		{
			name: "negative uint conversion",
			function: func() error {
				_, err := tc.convertToUint(int64(-1), reflect.TypeOf(uint(0)))
				return err
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.function()
			if err == nil {
				t.Error("Expected error but got none")
			}
		})
	}
}

// Benchmark tests for performance validation
func BenchmarkGoToJSBasicTypes(b *testing.B) {
	tc := NewTypeConverter()
	values := []any{
		true,
		42,
		3.14,
		"hello world",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, val := range values {
			tc.GoToJS(val)
		}
	}
}

func BenchmarkJSToGoBasicTypes(b *testing.B) {
	tc := NewTypeConverter()
	jsValues := []js.Value{
		js.ValueOf(true),
		js.ValueOf(42),
		js.ValueOf(3.14),
		js.ValueOf("hello world"),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, val := range jsValues {
			tc.JSToGo(val)
		}
	}
}

func BenchmarkComplexStructureConversion(b *testing.B) {
	tc := NewTypeConverter()
	complexData := map[string]any{
		"array":  []any{1, 2, 3, "four", true},
		"object": map[string]any{"nested": "value"},
		"number": 42,
		"string": "test",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		tc.GoToJS(complexData)
	}
}
