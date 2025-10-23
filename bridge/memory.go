//go:build wasm

package main

import (
	"fmt"
	"runtime"
	"sync"
	"syscall/js"
	"unsafe"
)

// MemoryManager handles memory allocation and deallocation between Go and JavaScript
type MemoryManager struct {
	allocations map[uintptr]*Allocation
	objects     map[string]*ObjectRef
	nextRefID   int
	mutex       sync.RWMutex
}

// Allocation represents a memory allocation
type Allocation struct {
	Ptr   uintptr
	Size  int
	Type  AllocationType
	RefID string
}

// ObjectRef represents a reference to a Go object from JavaScript
type ObjectRef struct {
	ID       string
	Object   any
	RefCount int
	Type     string
}

// AllocationType represents the type of memory allocation
type AllocationType int

const (
	AllocTypeString AllocationType = iota
	AllocTypeBytes
	AllocTypeObject
)

var (
	memoryManager *MemoryManager
	once          sync.Once
)

// GetMemoryManager returns the singleton memory manager instance
func GetMemoryManager() *MemoryManager {
	once.Do(func() {
		memoryManager = &MemoryManager{
			allocations: make(map[uintptr]*Allocation),
			objects:     make(map[string]*ObjectRef),
			nextRefID:   1,
		}
	})
	return memoryManager
}

// AllocateString allocates memory for a string and returns a pointer
func (mm *MemoryManager) AllocateString(s string) uintptr {
	mm.mutex.Lock()
	defer mm.mutex.Unlock()

	// Convert string to bytes
	bytes := []byte(s)

	// Allocate memory
	ptr := uintptr(unsafe.Pointer(&bytes[0]))

	// Track the allocation
	refID := mm.generateRefID()
	allocation := &Allocation{
		Ptr:   ptr,
		Size:  len(bytes),
		Type:  AllocTypeString,
		RefID: refID,
	}

	mm.allocations[ptr] = allocation

	return ptr
}

// AllocateBytes allocates memory for a byte slice and returns a pointer
func (mm *MemoryManager) AllocateBytes(data []byte) uintptr {
	mm.mutex.Lock()
	defer mm.mutex.Unlock()

	if len(data) == 0 {
		return 0
	}

	// Allocate memory
	ptr := uintptr(unsafe.Pointer(&data[0]))

	// Track the allocation
	refID := mm.generateRefID()
	allocation := &Allocation{
		Ptr:   ptr,
		Size:  len(data),
		Type:  AllocTypeBytes,
		RefID: refID,
	}

	mm.allocations[ptr] = allocation

	return ptr
}

// FreeMemory deallocates memory at the given pointer
func (mm *MemoryManager) FreeMemory(ptr uintptr) error {
	mm.mutex.Lock()
	defer mm.mutex.Unlock()

	allocation, exists := mm.allocations[ptr]
	if !exists {
		return fmt.Errorf("invalid pointer: %v", ptr)
	}

	// Remove from tracking
	delete(mm.allocations, ptr)

	// If this allocation has an associated object reference, decrement its count
	if allocation.RefID != "" {
		if objRef, exists := mm.objects[allocation.RefID]; exists {
			objRef.RefCount--
			if objRef.RefCount <= 0 {
				delete(mm.objects, allocation.RefID)
			}
		}
	}

	return nil
}

// ReadString reads a string from memory at the given pointer and length
func (mm *MemoryManager) ReadString(ptr uintptr, length int) (string, error) {
	mm.mutex.RLock()
	defer mm.mutex.RUnlock()

	if ptr == 0 || length <= 0 {
		return "", nil
	}

	// Verify the allocation exists and is valid
	allocation, exists := mm.allocations[ptr]
	if !exists {
		return "", fmt.Errorf("invalid pointer: %v", ptr)
	}

	if length > allocation.Size {
		return "", fmt.Errorf("requested length %d exceeds allocation size %d", length, allocation.Size)
	}

	// Read the string data
	bytes := (*[1 << 30]byte)(unsafe.Pointer(ptr))[:length:length]
	return string(bytes), nil
}

// ReadBytes reads bytes from memory at the given pointer and length
func (mm *MemoryManager) ReadBytes(ptr uintptr, length int) ([]byte, error) {
	mm.mutex.RLock()
	defer mm.mutex.RUnlock()

	if ptr == 0 || length <= 0 {
		return nil, nil
	}

	// Verify the allocation exists and is valid
	allocation, exists := mm.allocations[ptr]
	if !exists {
		return nil, fmt.Errorf("invalid pointer: %v", ptr)
	}

	if length > allocation.Size {
		return nil, fmt.Errorf("requested length %d exceeds allocation size %d", length, allocation.Size)
	}

	// Read the byte data
	bytes := (*[1 << 30]byte)(unsafe.Pointer(ptr))[:length:length]
	result := make([]byte, length)
	copy(result, bytes)
	return result, nil
}

// CreateObjectRef creates a reference to a Go object that can be accessed from JavaScript
func (mm *MemoryManager) CreateObjectRef(obj any, objType string) string {
	mm.mutex.Lock()
	defer mm.mutex.Unlock()

	refID := mm.generateRefID()
	objRef := &ObjectRef{
		ID:       refID,
		Object:   obj,
		RefCount: 1,
		Type:     objType,
	}

	mm.objects[refID] = objRef
	return refID
}

// GetObjectRef retrieves an object reference by ID
func (mm *MemoryManager) GetObjectRef(refID string) (*ObjectRef, error) {
	mm.mutex.RLock()
	defer mm.mutex.RUnlock()

	objRef, exists := mm.objects[refID]
	if !exists {
		return nil, fmt.Errorf("object reference not found: %s", refID)
	}

	return objRef, nil
}

// IncrementRefCount increments the reference count for an object
func (mm *MemoryManager) IncrementRefCount(refID string) error {
	mm.mutex.Lock()
	defer mm.mutex.Unlock()

	objRef, exists := mm.objects[refID]
	if !exists {
		return fmt.Errorf("object reference not found: %s", refID)
	}

	objRef.RefCount++
	return nil
}

// DecrementRefCount decrements the reference count for an object
func (mm *MemoryManager) DecrementRefCount(refID string) error {
	mm.mutex.Lock()
	defer mm.mutex.Unlock()

	objRef, exists := mm.objects[refID]
	if !exists {
		return fmt.Errorf("object reference not found: %s", refID)
	}

	objRef.RefCount--
	if objRef.RefCount <= 0 {
		delete(mm.objects, refID)
	}

	return nil
}

// ReleaseObjectRef releases an object reference
func (mm *MemoryManager) ReleaseObjectRef(refID string) error {
	mm.mutex.Lock()
	defer mm.mutex.Unlock()

	_, exists := mm.objects[refID]
	if !exists {
		return fmt.Errorf("object reference not found: %s", refID)
	}

	delete(mm.objects, refID)
	return nil
}

// GetMemoryStats returns memory usage statistics
func (mm *MemoryManager) GetMemoryStats() map[string]any {
	mm.mutex.RLock()
	defer mm.mutex.RUnlock()

	var totalAllocated int
	allocationsByType := make(map[AllocationType]int)

	for _, allocation := range mm.allocations {
		totalAllocated += allocation.Size
		allocationsByType[allocation.Type]++
	}

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	return map[string]any{
		"totalAllocations":    len(mm.allocations),
		"totalAllocatedBytes": totalAllocated,
		"objectReferences":    len(mm.objects),
		"allocationsByType": map[string]int{
			"string": allocationsByType[AllocTypeString],
			"bytes":  allocationsByType[AllocTypeBytes],
			"object": allocationsByType[AllocTypeObject],
		},
		"goMemStats": map[string]any{
			"alloc":      memStats.Alloc,
			"totalAlloc": memStats.TotalAlloc,
			"sys":        memStats.Sys,
			"numGC":      memStats.NumGC,
		},
	}
}

// Cleanup performs garbage collection and cleanup of unused references
func (mm *MemoryManager) Cleanup() {
	mm.mutex.Lock()
	defer mm.mutex.Unlock()

	// Remove object references with zero ref count
	for refID, objRef := range mm.objects {
		if objRef.RefCount <= 0 {
			delete(mm.objects, refID)
		}
	}

	// Force garbage collection
	runtime.GC()
}

// generateRefID generates a unique reference ID
func (mm *MemoryManager) generateRefID() string {
	id := fmt.Sprintf("ref_%d", mm.nextRefID)
	mm.nextRefID++
	return id
}

// WASM exported functions for memory management

//export allocateString
func allocateString(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   "string parameter required",
		})
	}

	str := args[0].String()
	mm := GetMemoryManager()
	ptr := mm.AllocateString(str)

	return js.ValueOf(map[string]any{
		"success": true,
		"ptr":     fmt.Sprintf("%d", ptr),
		"size":    len(str),
	})
}

//export freeMemory
func freeMemory(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   "pointer parameter required",
		})
	}

	ptrStr := args[0].String()
	var ptr uintptr
	if _, err := fmt.Sscanf(ptrStr, "%d", &ptr); err != nil {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   "invalid pointer format",
		})
	}

	mm := GetMemoryManager()
	err := mm.FreeMemory(ptr)
	if err != nil {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   err.Error(),
		})
	}

	return js.ValueOf(map[string]any{
		"success": true,
	})
}

//export readString
func readString(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   "pointer and length parameters required",
		})
	}

	ptrStr := args[0].String()
	length := args[1].Int()

	var ptr uintptr
	if _, err := fmt.Sscanf(ptrStr, "%d", &ptr); err != nil {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   "invalid pointer format",
		})
	}

	mm := GetMemoryManager()
	str, err := mm.ReadString(ptr, length)
	if err != nil {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   err.Error(),
		})
	}

	return js.ValueOf(map[string]any{
		"success": true,
		"value":   str,
	})
}

//export createObjectRef
func createObjectRef(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   "object and type parameters required",
		})
	}

	// For now, we'll create a placeholder object reference
	// In a full implementation, this would handle the actual object
	objType := args[1].String()

	mm := GetMemoryManager()
	refID := mm.CreateObjectRef(nil, objType) // Placeholder object

	return js.ValueOf(map[string]any{
		"success": true,
		"refId":   refID,
		"type":    objType,
	})
}

//export releaseObjectRef
func releaseObjectRef(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   "refId parameter required",
		})
	}

	refID := args[0].String()
	mm := GetMemoryManager()
	err := mm.ReleaseObjectRef(refID)
	if err != nil {
		return js.ValueOf(map[string]any{
			"success": false,
			"error":   err.Error(),
		})
	}

	return js.ValueOf(map[string]any{
		"success": true,
	})
}

//export getMemoryStats
func getMemoryStats(this js.Value, args []js.Value) any {
	mm := GetMemoryManager()
	stats := mm.GetMemoryStats()

	return js.ValueOf(map[string]any{
		"success": true,
		"stats":   stats,
	})
}

//export cleanup
func cleanup(this js.Value, args []js.Value) any {
	mm := GetMemoryManager()
	mm.Cleanup()

	return js.ValueOf(map[string]any{
		"success": true,
	})
}

// StringPool manages a pool of commonly used strings to reduce allocations
type StringPool struct {
	pool  map[string]uintptr
	mutex sync.RWMutex
}

var stringPool *StringPool

func init() {
	stringPool = &StringPool{
		pool: make(map[string]uintptr),
	}
}

// GetPooledString returns a pooled string pointer or creates a new one
func (sp *StringPool) GetPooledString(s string) uintptr {
	sp.mutex.RLock()
	if ptr, exists := sp.pool[s]; exists {
		sp.mutex.RUnlock()
		return ptr
	}
	sp.mutex.RUnlock()

	sp.mutex.Lock()
	defer sp.mutex.Unlock()

	// Double-check after acquiring write lock
	if ptr, exists := sp.pool[s]; exists {
		return ptr
	}

	// Create new allocation
	mm := GetMemoryManager()
	ptr := mm.AllocateString(s)
	sp.pool[s] = ptr
	return ptr
}

// ClearPool clears the string pool
func (sp *StringPool) ClearPool() {
	sp.mutex.Lock()
	defer sp.mutex.Unlock()

	mm := GetMemoryManager()
	for _, ptr := range sp.pool {
		mm.FreeMemory(ptr)
	}
	sp.pool = make(map[string]uintptr)
}

// GetPoolStats returns string pool statistics
func (sp *StringPool) GetPoolStats() map[string]any {
	sp.mutex.RLock()
	defer sp.mutex.RUnlock()

	return map[string]any{
		"pooledStrings": len(sp.pool),
	}
}

// WeakRefManager manages weak references to prevent memory leaks
type WeakRefManager struct {
	refs  map[string]*WeakRef
	mutex sync.RWMutex
}

type WeakRef struct {
	ID        string
	Object    any
	Finalizer func()
}

var weakRefManager *WeakRefManager

func init() {
	weakRefManager = &WeakRefManager{
		refs: make(map[string]*WeakRef),
	}
}

// CreateWeakRef creates a weak reference to an object
func (wrm *WeakRefManager) CreateWeakRef(obj any, finalizer func()) string {
	wrm.mutex.Lock()
	defer wrm.mutex.Unlock()

	mm := GetMemoryManager()
	refID := mm.generateRefID()

	weakRef := &WeakRef{
		ID:        refID,
		Object:    obj,
		Finalizer: finalizer,
	}

	wrm.refs[refID] = weakRef

	// Set finalizer for garbage collection
	if finalizer != nil {
		runtime.SetFinalizer(obj, func(obj any) {
			wrm.mutex.Lock()
			defer wrm.mutex.Unlock()

			if ref, exists := wrm.refs[refID]; exists {
				if ref.Finalizer != nil {
					ref.Finalizer()
				}
				delete(wrm.refs, refID)
			}
		})
	}

	return refID
}

// GetWeakRef retrieves a weak reference
func (wrm *WeakRefManager) GetWeakRef(refID string) (any, bool) {
	wrm.mutex.RLock()
	defer wrm.mutex.RUnlock()

	if ref, exists := wrm.refs[refID]; exists {
		return ref.Object, true
	}
	return nil, false
}

// RemoveWeakRef removes a weak reference
func (wrm *WeakRefManager) RemoveWeakRef(refID string) {
	wrm.mutex.Lock()
	defer wrm.mutex.Unlock()

	if ref, exists := wrm.refs[refID]; exists {
		if ref.Finalizer != nil {
			ref.Finalizer()
		}
		delete(wrm.refs, refID)
	}
}

// GetWeakRefStats returns weak reference statistics
func (wrm *WeakRefManager) GetWeakRefStats() map[string]any {
	wrm.mutex.RLock()
	defer wrm.mutex.RUnlock()

	return map[string]any{
		"weakReferences": len(wrm.refs),
	}
}
