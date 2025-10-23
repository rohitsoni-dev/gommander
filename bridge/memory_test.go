//go:build wasm

package main

import (
	"fmt"
	"runtime"
	"testing"
)

func TestMemoryManagerSingleton(t *testing.T) {
	mm1 := GetMemoryManager()
	mm2 := GetMemoryManager()

	if mm1 != mm2 {
		t.Error("GetMemoryManager should return the same instance")
	}
}

func TestStringAllocation(t *testing.T) {
	mm := GetMemoryManager()

	tests := []struct {
		name   string
		input  string
		length int
	}{
		{"empty string", "", 0},
		{"short string", "hello", 5},
		{"long string", "this is a longer string for testing", 35},
		{"unicode string", "Hello 世界", 11}, // Note: byte length, not character length
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ptr := mm.AllocateString(tt.input)

			if ptr == 0 && tt.length > 0 {
				t.Error("Expected non-zero pointer for non-empty string")
			}

			// Test reading back the string
			if tt.length > 0 {
				readStr, err := mm.ReadString(ptr, tt.length)
				if err != nil {
					t.Errorf("Failed to read string: %v", err)
				}

				if readStr != tt.input {
					t.Errorf("Expected %q, got %q", tt.input, readStr)
				}
			}

			// Clean up
			if ptr != 0 {
				err := mm.FreeMemory(ptr)
				if err != nil {
					t.Errorf("Failed to free memory: %v", err)
				}
			}
		})
	}
}

func TestBytesAllocation(t *testing.T) {
	mm := GetMemoryManager()

	tests := []struct {
		name string
		data []byte
	}{
		{"empty bytes", []byte{}},
		{"small bytes", []byte{1, 2, 3, 4, 5}},
		{"large bytes", make([]byte, 1024)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Initialize test data for large bytes
			if len(tt.data) == 1024 {
				for i := range tt.data {
					tt.data[i] = byte(i % 256)
				}
			}

			ptr := mm.AllocateBytes(tt.data)

			if ptr == 0 && len(tt.data) > 0 {
				t.Error("Expected non-zero pointer for non-empty bytes")
			}

			// Test reading back the bytes
			if len(tt.data) > 0 {
				readBytes, err := mm.ReadBytes(ptr, len(tt.data))
				if err != nil {
					t.Errorf("Failed to read bytes: %v", err)
				}

				if len(readBytes) != len(tt.data) {
					t.Errorf("Expected length %d, got %d", len(tt.data), len(readBytes))
				}

				for i, b := range readBytes {
					if b != tt.data[i] {
						t.Errorf("Byte mismatch at index %d: expected %d, got %d", i, tt.data[i], b)
						break
					}
				}
			}

			// Clean up
			if ptr != 0 {
				err := mm.FreeMemory(ptr)
				if err != nil {
					t.Errorf("Failed to free memory: %v", err)
				}
			}
		})
	}
}

func TestObjectReferences(t *testing.T) {
	mm := GetMemoryManager()

	tests := []struct {
		name    string
		object  any
		objType string
	}{
		{"string object", "test string", "string"},
		{"int object", 42, "int"},
		{"map object", map[string]int{"key": 123}, "map"},
		{"nil object", nil, "nil"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			refID := mm.CreateObjectRef(tt.object, tt.objType)

			if refID == "" {
				t.Error("Expected non-empty reference ID")
			}

			// Test retrieving the reference
			objRef, err := mm.GetObjectRef(refID)
			if err != nil {
				t.Errorf("Failed to get object reference: %v", err)
			}

			if objRef.Type != tt.objType {
				t.Errorf("Expected type %s, got %s", tt.objType, objRef.Type)
			}

			if objRef.RefCount != 1 {
				t.Errorf("Expected ref count 1, got %d", objRef.RefCount)
			}

			// Test incrementing reference count
			err = mm.IncrementRefCount(refID)
			if err != nil {
				t.Errorf("Failed to increment ref count: %v", err)
			}

			objRef, _ = mm.GetObjectRef(refID)
			if objRef.RefCount != 2 {
				t.Errorf("Expected ref count 2 after increment, got %d", objRef.RefCount)
			}

			// Test decrementing reference count
			err = mm.DecrementRefCount(refID)
			if err != nil {
				t.Errorf("Failed to decrement ref count: %v", err)
			}

			objRef, _ = mm.GetObjectRef(refID)
			if objRef.RefCount != 1 {
				t.Errorf("Expected ref count 1 after decrement, got %d", objRef.RefCount)
			}

			// Test releasing reference
			err = mm.ReleaseObjectRef(refID)
			if err != nil {
				t.Errorf("Failed to release object reference: %v", err)
			}

			// Verify reference is gone
			_, err = mm.GetObjectRef(refID)
			if err == nil {
				t.Error("Expected error when getting released reference")
			}
		})
	}
}

func TestMemoryStats(t *testing.T) {
	mm := GetMemoryManager()

	// Clear any existing allocations
	mm.Cleanup()

	// Get initial stats
	initialStats := mm.GetMemoryStats()

	// Allocate some memory
	ptr1 := mm.AllocateString("test string 1")
	ptr2 := mm.AllocateString("test string 2")
	refID := mm.CreateObjectRef("test object", "string")

	// Get stats after allocations
	afterStats := mm.GetMemoryStats()

	// Verify stats increased
	if afterStats["totalAllocations"].(int) <= initialStats["totalAllocations"].(int) {
		t.Error("Expected total allocations to increase")
	}

	if afterStats["objectReferences"].(int) <= initialStats["objectReferences"].(int) {
		t.Error("Expected object references to increase")
	}

	// Clean up
	mm.FreeMemory(ptr1)
	mm.FreeMemory(ptr2)
	mm.ReleaseObjectRef(refID)

	// Get final stats
	finalStats := mm.GetMemoryStats()

	// Verify cleanup worked
	if finalStats["totalAllocations"].(int) != initialStats["totalAllocations"].(int) {
		t.Error("Expected total allocations to return to initial value after cleanup")
	}

	if finalStats["objectReferences"].(int) != initialStats["objectReferences"].(int) {
		t.Error("Expected object references to return to initial value after cleanup")
	}
}

func TestMemoryErrorHandling(t *testing.T) {
	mm := GetMemoryManager()

	tests := []struct {
		name     string
		function func() error
	}{
		{
			name: "free invalid pointer",
			function: func() error {
				return mm.FreeMemory(uintptr(0x12345))
			},
		},
		{
			name: "read from invalid pointer",
			function: func() error {
				_, err := mm.ReadString(uintptr(0x12345), 10)
				return err
			},
		},
		{
			name: "get non-existent object reference",
			function: func() error {
				_, err := mm.GetObjectRef("nonexistent")
				return err
			},
		},
		{
			name: "increment non-existent reference",
			function: func() error {
				return mm.IncrementRefCount("nonexistent")
			},
		},
		{
			name: "decrement non-existent reference",
			function: func() error {
				return mm.DecrementRefCount("nonexistent")
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

func TestStringPool(t *testing.T) {
	pool := &StringPool{
		pool: make(map[string]uintptr),
	}

	// Test pooling the same string
	str := "test string"
	ptr1 := pool.GetPooledString(str)
	ptr2 := pool.GetPooledString(str)

	if ptr1 != ptr2 {
		t.Error("Expected same pointer for same string")
	}

	// Test different strings
	ptr3 := pool.GetPooledString("different string")
	if ptr1 == ptr3 {
		t.Error("Expected different pointers for different strings")
	}

	// Test pool stats
	stats := pool.GetPoolStats()
	if stats["pooledStrings"].(int) != 2 {
		t.Errorf("Expected 2 pooled strings, got %d", stats["pooledStrings"].(int))
	}

	// Test clearing pool
	pool.ClearPool()
	statsAfterClear := pool.GetPoolStats()
	if statsAfterClear["pooledStrings"].(int) != 0 {
		t.Errorf("Expected 0 pooled strings after clear, got %d", statsAfterClear["pooledStrings"].(int))
	}
}

func TestWeakRefManager(t *testing.T) {
	wrm := &WeakRefManager{
		refs: make(map[string]*WeakRef),
	}

	// Test creating weak reference
	testObj := "test object"
	finalizerCalled := false

	refID := wrm.CreateWeakRef(testObj, func() {
		finalizerCalled = true
	})

	if refID == "" {
		t.Error("Expected non-empty reference ID")
	}

	// Test getting weak reference
	obj, exists := wrm.GetWeakRef(refID)
	if !exists {
		t.Error("Expected weak reference to exist")
	}

	if obj != testObj {
		t.Errorf("Expected %v, got %v", testObj, obj)
	}

	// Test removing weak reference
	wrm.RemoveWeakRef(refID)

	if !finalizerCalled {
		t.Error("Expected finalizer to be called")
	}

	// Verify reference is gone
	_, exists = wrm.GetWeakRef(refID)
	if exists {
		t.Error("Expected weak reference to be removed")
	}

	// Test stats
	stats := wrm.GetWeakRefStats()
	if stats["weakReferences"].(int) != 0 {
		t.Errorf("Expected 0 weak references, got %d", stats["weakReferences"].(int))
	}
}

func TestMemoryBoundaryConditions(t *testing.T) {
	mm := GetMemoryManager()

	// Test reading with zero length
	ptr := mm.AllocateString("test")
	str, err := mm.ReadString(ptr, 0)
	if err != nil {
		t.Errorf("Unexpected error reading zero length: %v", err)
	}
	if str != "" {
		t.Errorf("Expected empty string, got %q", str)
	}

	// Test reading beyond allocation size
	_, err = mm.ReadString(ptr, 100)
	if err == nil {
		t.Error("Expected error when reading beyond allocation size")
	}

	// Clean up
	mm.FreeMemory(ptr)

	// Test reading from zero pointer
	_, err = mm.ReadString(0, 10)
	if err != nil {
		t.Errorf("Unexpected error reading from zero pointer: %v", err)
	}
}

func TestConcurrentAccess(t *testing.T) {
	mm := GetMemoryManager()

	// Test concurrent allocations
	done := make(chan bool, 10)

	for i := 0; i < 10; i++ {
		go func(id int) {
			defer func() { done <- true }()

			// Allocate string
			str := fmt.Sprintf("test string %d", id)
			ptr := mm.AllocateString(str)

			// Create object reference
			refID := mm.CreateObjectRef(str, "string")

			// Read back
			readStr, err := mm.ReadString(ptr, len(str))
			if err != nil {
				t.Errorf("Failed to read string in goroutine %d: %v", id, err)
				return
			}

			if readStr != str {
				t.Errorf("String mismatch in goroutine %d: expected %q, got %q", id, str, readStr)
				return
			}

			// Clean up
			mm.FreeMemory(ptr)
			mm.ReleaseObjectRef(refID)
		}(i)
	}

	// Wait for all goroutines to complete
	for i := 0; i < 10; i++ {
		<-done
	}
}

func TestMemoryLeakDetection(t *testing.T) {
	mm := GetMemoryManager()

	// Get initial memory stats
	var initialMemStats runtime.MemStats
	runtime.ReadMemStats(&initialMemStats)

	// Allocate and free memory multiple times
	for i := 0; i < 1000; i++ {
		ptr := mm.AllocateString(fmt.Sprintf("test string %d", i))
		refID := mm.CreateObjectRef(fmt.Sprintf("object %d", i), "string")

		// Immediately free
		mm.FreeMemory(ptr)
		mm.ReleaseObjectRef(refID)
	}

	// Force garbage collection
	runtime.GC()
	runtime.GC() // Call twice to ensure cleanup

	// Get final memory stats
	var finalMemStats runtime.MemStats
	runtime.ReadMemStats(&finalMemStats)

	// Check that we haven't leaked too much memory
	// Allow for some variance due to Go's memory management
	memoryIncrease := finalMemStats.Alloc - initialMemStats.Alloc
	if memoryIncrease > 1024*1024 { // 1MB threshold
		t.Errorf("Potential memory leak detected: memory increased by %d bytes", memoryIncrease)
	}

	// Verify internal tracking is clean
	stats := mm.GetMemoryStats()
	if stats["totalAllocations"].(int) > 0 {
		t.Errorf("Expected 0 tracked allocations, got %d", stats["totalAllocations"].(int))
	}

	if stats["objectReferences"].(int) > 0 {
		t.Errorf("Expected 0 object references, got %d", stats["objectReferences"].(int))
	}
}

func TestAllocationTypes(t *testing.T) {
	mm := GetMemoryManager()

	// Test different allocation types
	strPtr := mm.AllocateString("test string")
	bytesPtr := mm.AllocateBytes([]byte{1, 2, 3, 4})

	stats := mm.GetMemoryStats()
	allocsByType := stats["allocationsByType"].(map[string]int)

	if allocsByType["string"] < 1 {
		t.Error("Expected at least 1 string allocation")
	}

	if allocsByType["bytes"] < 1 {
		t.Error("Expected at least 1 bytes allocation")
	}

	// Clean up
	mm.FreeMemory(strPtr)
	mm.FreeMemory(bytesPtr)
}

// Benchmark tests for performance validation
func BenchmarkStringAllocation(b *testing.B) {
	mm := GetMemoryManager()
	testString := "benchmark test string"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ptr := mm.AllocateString(testString)
		mm.FreeMemory(ptr)
	}
}

func BenchmarkObjectReference(b *testing.B) {
	mm := GetMemoryManager()
	testObj := "benchmark test object"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		refID := mm.CreateObjectRef(testObj, "string")
		mm.ReleaseObjectRef(refID)
	}
}

func BenchmarkStringPool(b *testing.B) {
	pool := &StringPool{
		pool: make(map[string]uintptr),
	}
	testString := "benchmark test string"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		pool.GetPooledString(testString)
	}
}
