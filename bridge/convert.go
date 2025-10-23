//go:build wasm

package main

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strconv"
	"syscall/js"
	"time"

	"github.com/gocommander/gocommander/cmd"
)

// TypeConverter handles conversion between Go and JavaScript types
type TypeConverter struct {
	// Custom converters for specific types
	customConverters map[reflect.Type]func(any) (js.Value, error)
	// Validation rules for type conversion
	validationRules map[reflect.Type]func(any) error
}

// NewTypeConverter creates a new type converter
func NewTypeConverter() *TypeConverter {
	tc := &TypeConverter{
		customConverters: make(map[reflect.Type]func(any) (js.Value, error)),
		validationRules:  make(map[reflect.Type]func(any) error),
	}

	// Register default converters
	tc.registerDefaultConverters()

	return tc
}

// registerDefaultConverters registers default type converters
func (tc *TypeConverter) registerDefaultConverters() {
	// Time converter
	tc.customConverters[reflect.TypeOf(time.Time{})] = func(val any) (js.Value, error) {
		t := val.(time.Time)
		return js.ValueOf(t.Format(time.RFC3339)), nil
	}

	// Error converter
	tc.customConverters[reflect.TypeOf((*error)(nil)).Elem()] = func(val any) (js.Value, error) {
		err := val.(error)
		return js.ValueOf(err.Error()), nil
	}
}

// GoToJS converts a Go value to a JavaScript value
func (tc *TypeConverter) GoToJS(value any) (js.Value, error) {
	if value == nil {
		return js.Null(), nil
	}

	valueType := reflect.TypeOf(value)

	// Check for custom converter
	if converter, exists := tc.customConverters[valueType]; exists {
		return converter(value)
	}

	// Handle basic types
	switch v := value.(type) {
	case bool:
		return js.ValueOf(v), nil
	case int, int8, int16, int32, int64:
		return js.ValueOf(reflect.ValueOf(v).Int()), nil
	case uint, uint8, uint16, uint32, uint64:
		return js.ValueOf(reflect.ValueOf(v).Uint()), nil
	case float32, float64:
		return js.ValueOf(reflect.ValueOf(v).Float()), nil
	case string:
		return js.ValueOf(v), nil
	case []byte:
		// Convert byte slice to Uint8Array
		array := js.Global().Get("Uint8Array").New(len(v))
		js.CopyBytesToJS(array, v)
		return array, nil
	case []any:
		return tc.sliceToJS(v)
	case map[string]any:
		return tc.mapToJS(v)
	default:
		// Handle slices and arrays
		if valueType.Kind() == reflect.Slice || valueType.Kind() == reflect.Array {
			return tc.reflectSliceToJS(reflect.ValueOf(value))
		}

		// Handle maps
		if valueType.Kind() == reflect.Map {
			return tc.reflectMapToJS(reflect.ValueOf(value))
		}

		// Handle structs
		if valueType.Kind() == reflect.Struct {
			return tc.structToJS(reflect.ValueOf(value))
		}

		// Handle pointers
		if valueType.Kind() == reflect.Ptr {
			if reflect.ValueOf(value).IsNil() {
				return js.Null(), nil
			}
			return tc.GoToJS(reflect.ValueOf(value).Elem().Interface())
		}

		// Fallback: convert to string
		return js.ValueOf(fmt.Sprintf("%v", value)), nil
	}
}

// JSToGo converts a JavaScript value to a Go value
func (tc *TypeConverter) JSToGo(value js.Value) (any, error) {
	switch value.Type() {
	case js.TypeUndefined:
		return nil, nil
	case js.TypeNull:
		return nil, nil
	case js.TypeBoolean:
		return value.Bool(), nil
	case js.TypeNumber:
		num := value.Float()
		// Check if it's an integer
		if num == float64(int64(num)) {
			return int64(num), nil
		}
		return num, nil
	case js.TypeString:
		return value.String(), nil
	case js.TypeObject:
		if value.InstanceOf(js.Global().Get("Array")) {
			return tc.jsArrayToGoSlice(value)
		}
		if value.InstanceOf(js.Global().Get("Uint8Array")) {
			return tc.jsUint8ArrayToGoBytes(value)
		}
		if value.InstanceOf(js.Global().Get("Date")) {
			return tc.jsDateToGoTime(value)
		}
		// Regular object - convert to map
		return tc.jsObjectToGoMap(value)
	default:
		return nil, fmt.Errorf("unsupported JavaScript type: %v", value.Type())
	}
}

// JSToGoTyped converts a JavaScript value to a specific Go type
func (tc *TypeConverter) JSToGoTyped(value js.Value, targetType reflect.Type) (any, error) {
	// First convert to generic Go value
	goValue, err := tc.JSToGo(value)
	if err != nil {
		return nil, err
	}

	if goValue == nil {
		return reflect.Zero(targetType).Interface(), nil
	}

	// Convert to target type
	return tc.convertToType(goValue, targetType)
}

// convertToType converts a Go value to a specific type
func (tc *TypeConverter) convertToType(value any, targetType reflect.Type) (any, error) {
	if value == nil {
		return reflect.Zero(targetType).Interface(), nil
	}

	sourceType := reflect.TypeOf(value)

	// If types match, return as-is
	if sourceType == targetType {
		return value, nil
	}

	// Handle assignable types
	if sourceType.AssignableTo(targetType) {
		return value, nil
	}

	// Handle convertible types
	if sourceType.ConvertibleTo(targetType) {
		return reflect.ValueOf(value).Convert(targetType).Interface(), nil
	}

	// Handle specific conversions
	switch targetType.Kind() {
	case reflect.String:
		return tc.convertToString(value)
	case reflect.Bool:
		return tc.convertToBool(value)
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return tc.convertToInt(value, targetType)
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return tc.convertToUint(value, targetType)
	case reflect.Float32, reflect.Float64:
		return tc.convertToFloat(value, targetType)
	case reflect.Slice:
		return tc.convertToSlice(value, targetType)
	case reflect.Map:
		return tc.convertToMap(value, targetType)
	case reflect.Struct:
		return tc.convertToStruct(value, targetType)
	case reflect.Ptr:
		return tc.convertToPointer(value, targetType)
	default:
		return nil, fmt.Errorf("cannot convert %T to %v", value, targetType)
	}
}

// Helper conversion functions

func (tc *TypeConverter) convertToString(value any) (string, error) {
	switch v := value.(type) {
	case string:
		return v, nil
	case []byte:
		return string(v), nil
	case fmt.Stringer:
		return v.String(), nil
	default:
		return fmt.Sprintf("%v", value), nil
	}
}

func (tc *TypeConverter) convertToBool(value any) (bool, error) {
	switch v := value.(type) {
	case bool:
		return v, nil
	case string:
		return strconv.ParseBool(v)
	case int64:
		return v != 0, nil
	case float64:
		return v != 0, nil
	default:
		return false, fmt.Errorf("cannot convert %T to bool", value)
	}
}

func (tc *TypeConverter) convertToInt(value any, targetType reflect.Type) (any, error) {
	var intVal int64

	switch v := value.(type) {
	case int64:
		intVal = v
	case float64:
		intVal = int64(v)
	case string:
		var err error
		intVal, err = strconv.ParseInt(v, 10, 64)
		if err != nil {
			return nil, err
		}
	case bool:
		if v {
			intVal = 1
		} else {
			intVal = 0
		}
	default:
		return nil, fmt.Errorf("cannot convert %T to int", value)
	}

	// Convert to specific int type
	switch targetType.Kind() {
	case reflect.Int:
		return int(intVal), nil
	case reflect.Int8:
		return int8(intVal), nil
	case reflect.Int16:
		return int16(intVal), nil
	case reflect.Int32:
		return int32(intVal), nil
	case reflect.Int64:
		return intVal, nil
	default:
		return nil, fmt.Errorf("unsupported int type: %v", targetType)
	}
}

func (tc *TypeConverter) convertToUint(value any, targetType reflect.Type) (any, error) {
	var uintVal uint64

	switch v := value.(type) {
	case int64:
		if v < 0 {
			return nil, fmt.Errorf("cannot convert negative int to uint")
		}
		uintVal = uint64(v)
	case float64:
		if v < 0 {
			return nil, fmt.Errorf("cannot convert negative float to uint")
		}
		uintVal = uint64(v)
	case string:
		var err error
		uintVal, err = strconv.ParseUint(v, 10, 64)
		if err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("cannot convert %T to uint", value)
	}

	// Convert to specific uint type
	switch targetType.Kind() {
	case reflect.Uint:
		return uint(uintVal), nil
	case reflect.Uint8:
		return uint8(uintVal), nil
	case reflect.Uint16:
		return uint16(uintVal), nil
	case reflect.Uint32:
		return uint32(uintVal), nil
	case reflect.Uint64:
		return uintVal, nil
	default:
		return nil, fmt.Errorf("unsupported uint type: %v", targetType)
	}
}

func (tc *TypeConverter) convertToFloat(value any, targetType reflect.Type) (any, error) {
	var floatVal float64

	switch v := value.(type) {
	case float64:
		floatVal = v
	case int64:
		floatVal = float64(v)
	case string:
		var err error
		floatVal, err = strconv.ParseFloat(v, 64)
		if err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("cannot convert %T to float", value)
	}

	// Convert to specific float type
	switch targetType.Kind() {
	case reflect.Float32:
		return float32(floatVal), nil
	case reflect.Float64:
		return floatVal, nil
	default:
		return nil, fmt.Errorf("unsupported float type: %v", targetType)
	}
}

func (tc *TypeConverter) convertToSlice(value any, targetType reflect.Type) (any, error) {
	sourceValue := reflect.ValueOf(value)

	// Handle slice to slice conversion
	if sourceValue.Kind() == reflect.Slice {
		elementType := targetType.Elem()
		newSlice := reflect.MakeSlice(targetType, sourceValue.Len(), sourceValue.Cap())

		for i := 0; i < sourceValue.Len(); i++ {
			convertedElement, err := tc.convertToType(sourceValue.Index(i).Interface(), elementType)
			if err != nil {
				return nil, fmt.Errorf("error converting slice element %d: %v", i, err)
			}
			newSlice.Index(i).Set(reflect.ValueOf(convertedElement))
		}

		return newSlice.Interface(), nil
	}

	return nil, fmt.Errorf("cannot convert %T to slice", value)
}

func (tc *TypeConverter) convertToMap(value any, targetType reflect.Type) (any, error) {
	sourceValue := reflect.ValueOf(value)

	// Handle map to map conversion
	if sourceValue.Kind() == reflect.Map {
		keyType := targetType.Key()
		valueType := targetType.Elem()
		newMap := reflect.MakeMap(targetType)

		for _, key := range sourceValue.MapKeys() {
			convertedKey, err := tc.convertToType(key.Interface(), keyType)
			if err != nil {
				return nil, fmt.Errorf("error converting map key: %v", err)
			}

			convertedValue, err := tc.convertToType(sourceValue.MapIndex(key).Interface(), valueType)
			if err != nil {
				return nil, fmt.Errorf("error converting map value: %v", err)
			}

			newMap.SetMapIndex(reflect.ValueOf(convertedKey), reflect.ValueOf(convertedValue))
		}

		return newMap.Interface(), nil
	}

	return nil, fmt.Errorf("cannot convert %T to map", value)
}

func (tc *TypeConverter) convertToStruct(value any, targetType reflect.Type) (any, error) {
	// Handle map to struct conversion
	if mapValue, ok := value.(map[string]any); ok {
		return tc.mapToStruct(mapValue, targetType)
	}

	return nil, fmt.Errorf("cannot convert %T to struct", value)
}

func (tc *TypeConverter) convertToPointer(value any, targetType reflect.Type) (any, error) {
	elementType := targetType.Elem()
	convertedValue, err := tc.convertToType(value, elementType)
	if err != nil {
		return nil, err
	}

	ptr := reflect.New(elementType)
	ptr.Elem().Set(reflect.ValueOf(convertedValue))
	return ptr.Interface(), nil
}

// JavaScript-specific conversion functions

func (tc *TypeConverter) sliceToJS(slice []any) (js.Value, error) {
	array := js.Global().Get("Array").New(len(slice))
	for i, item := range slice {
		jsValue, err := tc.GoToJS(item)
		if err != nil {
			return js.Undefined(), fmt.Errorf("error converting slice element %d: %v", i, err)
		}
		array.SetIndex(i, jsValue)
	}
	return array, nil
}

func (tc *TypeConverter) mapToJS(m map[string]any) (js.Value, error) {
	obj := js.Global().Get("Object").New()
	for key, value := range m {
		jsValue, err := tc.GoToJS(value)
		if err != nil {
			return js.Undefined(), fmt.Errorf("error converting map value for key %s: %v", key, err)
		}
		obj.Set(key, jsValue)
	}
	return obj, nil
}

func (tc *TypeConverter) reflectSliceToJS(slice reflect.Value) (js.Value, error) {
	array := js.Global().Get("Array").New(slice.Len())
	for i := 0; i < slice.Len(); i++ {
		jsValue, err := tc.GoToJS(slice.Index(i).Interface())
		if err != nil {
			return js.Undefined(), fmt.Errorf("error converting slice element %d: %v", i, err)
		}
		array.SetIndex(i, jsValue)
	}
	return array, nil
}

func (tc *TypeConverter) reflectMapToJS(m reflect.Value) (js.Value, error) {
	obj := js.Global().Get("Object").New()
	for _, key := range m.MapKeys() {
		keyStr, err := tc.convertToString(key.Interface())
		if err != nil {
			return js.Undefined(), fmt.Errorf("error converting map key to string: %v", err)
		}

		jsValue, err := tc.GoToJS(m.MapIndex(key).Interface())
		if err != nil {
			return js.Undefined(), fmt.Errorf("error converting map value for key %s: %v", keyStr, err)
		}
		obj.Set(keyStr, jsValue)
	}
	return obj, nil
}

func (tc *TypeConverter) structToJS(s reflect.Value) (js.Value, error) {
	obj := js.Global().Get("Object").New()
	structType := s.Type()

	for i := 0; i < s.NumField(); i++ {
		field := structType.Field(i)
		fieldValue := s.Field(i)

		// Skip unexported fields
		if !fieldValue.CanInterface() {
			continue
		}

		// Get field name (check for json tag)
		fieldName := field.Name
		if jsonTag := field.Tag.Get("json"); jsonTag != "" && jsonTag != "-" {
			if commaIdx := len(jsonTag); commaIdx > 0 {
				fieldName = jsonTag[:commaIdx]
			}
		}

		jsValue, err := tc.GoToJS(fieldValue.Interface())
		if err != nil {
			return js.Undefined(), fmt.Errorf("error converting struct field %s: %v", fieldName, err)
		}
		obj.Set(fieldName, jsValue)
	}
	return obj, nil
}

func (tc *TypeConverter) jsArrayToGoSlice(array js.Value) ([]any, error) {
	length := array.Length()
	slice := make([]any, length)

	for i := 0; i < length; i++ {
		element, err := tc.JSToGo(array.Index(i))
		if err != nil {
			return nil, fmt.Errorf("error converting array element %d: %v", i, err)
		}
		slice[i] = element
	}

	return slice, nil
}

func (tc *TypeConverter) jsUint8ArrayToGoBytes(array js.Value) ([]byte, error) {
	length := array.Length()
	bytes := make([]byte, length)
	js.CopyBytesToGo(bytes, array)
	return bytes, nil
}

func (tc *TypeConverter) jsDateToGoTime(date js.Value) (time.Time, error) {
	// Get milliseconds since epoch
	ms := date.Call("getTime").Float()
	return time.Unix(0, int64(ms)*int64(time.Millisecond)), nil
}

func (tc *TypeConverter) jsObjectToGoMap(obj js.Value) (map[string]any, error) {
	result := make(map[string]any)
	keys := js.Global().Get("Object").Call("keys", obj)

	for i := 0; i < keys.Length(); i++ {
		key := keys.Index(i).String()
		value, err := tc.JSToGo(obj.Get(key))
		if err != nil {
			return nil, fmt.Errorf("error converting object property %s: %v", key, err)
		}
		result[key] = value
	}

	return result, nil
}

func (tc *TypeConverter) mapToStruct(m map[string]any, structType reflect.Type) (any, error) {
	structValue := reflect.New(structType).Elem()

	for i := 0; i < structType.NumField(); i++ {
		field := structType.Field(i)
		fieldValue := structValue.Field(i)

		// Skip unexported fields
		if !fieldValue.CanSet() {
			continue
		}

		// Get field name (check for json tag)
		fieldName := field.Name
		if jsonTag := field.Tag.Get("json"); jsonTag != "" && jsonTag != "-" {
			if commaIdx := len(jsonTag); commaIdx > 0 {
				fieldName = jsonTag[:commaIdx]
			}
		}

		// Check if the map contains this field
		if mapValue, exists := m[fieldName]; exists {
			convertedValue, err := tc.convertToType(mapValue, field.Type)
			if err != nil {
				return nil, fmt.Errorf("error converting field %s: %v", fieldName, err)
			}
			fieldValue.Set(reflect.ValueOf(convertedValue))
		}
	}

	return structValue.Interface(), nil
}

// Error serialization functions

// SerializeError serializes a Go error to a JavaScript-compatible format
func SerializeError(err error) map[string]any {
	if err == nil {
		return nil
	}

	result := map[string]any{
		"message": err.Error(),
		"type":    "Error",
	}

	// Handle specific error types
	switch e := err.(type) {
	case *cmd.CommanderError:
		result["type"] = "CommanderError"
		result["code"] = e.Code
		result["exitCode"] = e.ExitCode
		if e.Command != "" {
			result["command"] = e.Command
		}

	case *cmd.InvalidArgumentError:
		result["type"] = "InvalidArgumentError"
		result["code"] = e.Code
		result["exitCode"] = e.ExitCode
		result["argument"] = e.Argument
		result["value"] = e.Value

	case *cmd.InvalidOptionArgumentError:
		result["type"] = "InvalidOptionArgumentError"
		result["code"] = e.Code
		result["exitCode"] = e.ExitCode
		result["option"] = e.Option
		result["value"] = e.Value

	case *cmd.ValidationError:
		result["type"] = "ValidationError"
		result["command"] = e.Command
		result["field"] = e.Field

	case *cmd.ParseError:
		result["type"] = "ParseError"
		result["command"] = e.Command
		result["argument"] = e.Argument
		result["option"] = e.Option
		result["value"] = e.Value
		result["position"] = e.Position
	}

	return result
}

// DeserializeError deserializes a JavaScript error object to a Go error
func DeserializeError(errorData map[string]any) error {
	if errorData == nil {
		return nil
	}

	message, _ := errorData["message"].(string)
	errorType, _ := errorData["type"].(string)

	switch errorType {
	case "CommanderError":
		err := &cmd.CommanderError{
			Message: message,
		}
		if code, ok := errorData["code"].(string); ok {
			err.Code = code
		}
		if exitCode, ok := errorData["exitCode"].(int); ok {
			err.ExitCode = exitCode
		}
		if command, ok := errorData["command"].(string); ok {
			err.Command = command
		}
		return err

	case "InvalidArgumentError":
		argument, _ := errorData["argument"].(string)
		value, _ := errorData["value"].(string)
		return cmd.NewInvalidArgumentError(message, argument, value)

	case "InvalidOptionArgumentError":
		option, _ := errorData["option"].(string)
		value, _ := errorData["value"].(string)
		return cmd.NewInvalidOptionArgumentError(message, option, value)

	case "ValidationError":
		err := &cmd.ValidationError{
			Message: message,
		}
		if command, ok := errorData["command"].(string); ok {
			err.Command = command
		}
		if field, ok := errorData["field"].(string); ok {
			err.Field = field
		}
		return err

	case "ParseError":
		err := &cmd.ParseError{
			Message: message,
		}
		if command, ok := errorData["command"].(string); ok {
			err.Command = command
		}
		if argument, ok := errorData["argument"].(string); ok {
			err.Argument = argument
		}
		if option, ok := errorData["option"].(string); ok {
			err.Option = option
		}
		if value, ok := errorData["value"].(string); ok {
			err.Value = value
		}
		if position, ok := errorData["position"].(int); ok {
			err.Position = position
		}
		return err

	default:
		// Generic error
		return fmt.Errorf("%s", message)
	}
}

// JSON serialization helpers

// SerializeToJSON serializes a Go value to JSON string
func SerializeToJSON(value any) (string, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// DeserializeFromJSON deserializes a JSON string to a Go value
func DeserializeFromJSON(jsonStr string, target any) error {
	return json.Unmarshal([]byte(jsonStr), target)
}

// Global type converter instance
var globalTypeConverter *TypeConverter

func init() {
	globalTypeConverter = NewTypeConverter()
}

// Exported WASM functions for type conversion

//export convertGoToJS
func convertGoToJS(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   "value parameter required",
		})
	}

	// For this example, we'll convert the JS value back to Go and then to JS
	// In a real implementation, this would handle Go values passed from Go code
	goValue, err := globalTypeConverter.JSToGo(args[0])
	if err != nil {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   err.Error(),
		})
	}

	jsValue, err := globalTypeConverter.GoToJS(goValue)
	if err != nil {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   err.Error(),
		})
	}

	return js.ValueOf(map[string]any{
		"success": true,
		"value":   jsValue,
	})
}

//export convertJSToGo
func convertJSToGo(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   "value parameter required",
		})
	}

	goValue, err := globalTypeConverter.JSToGo(args[0])
	if err != nil {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   err.Error(),
		})
	}

	// Convert back to JS for return (since we can't return Go values directly)
	jsValue, err := globalTypeConverter.GoToJS(goValue)
	if err != nil {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   err.Error(),
		})
	}

	return js.ValueOf(map[string]any{
		"success": true,
		"value":   jsValue,
		"type":    fmt.Sprintf("%T", goValue),
	})
}

//export serializeError
func serializeError(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   "error parameter required",
		})
	}

	// Convert JS error object to Go map
	errorMap, err := globalTypeConverter.jsObjectToGoMap(args[0])
	if err != nil {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   err.Error(),
		})
	}

	// Deserialize to Go error
	goError := DeserializeError(errorMap)

	// Serialize back to standardized format
	serialized := SerializeError(goError)

	jsValue, err := globalTypeConverter.GoToJS(serialized)
	if err != nil {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   err.Error(),
		})
	}

	return js.ValueOf(map[string]any{
		"success": true,
		"error":   jsValue,
	})
}
