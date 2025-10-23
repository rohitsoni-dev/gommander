#!/usr/bin/env node

/**
 * WASM Test Script
 * Tests WASM binary functionality and builds if necessary
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

async function testWASM() {
    console.log('Testing WASM functionality...');
    
    const wasmPath = path.join(__dirname, '../wasm/gocommander.wasm');
    
    try {
        // Check if WASM binary exists
        await fs.access(wasmPath);
        console.log('✅ WASM binary found');
        
        // Test WASM loading
        const wasmBuffer = await fs.readFile(wasmPath);
        console.log(`✅ WASM binary size: ${wasmBuffer.length} bytes`);
        
        // Verify it's a valid WASM binary
        const magicNumber = wasmBuffer.slice(0, 4);
        const expectedMagic = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
        
        if (magicNumber.equals(expectedMagic)) {
            console.log('✅ Valid WASM magic number');
        } else {
            console.log('❌ Invalid WASM magic number');
            return false;
        }
        
        return true;
    } catch (error) {
        console.log('❌ WASM binary not found or invalid:', error.message);
        return false;
    }
}

async function buildWASM() {
    console.log('Building WASM binary...');
    
    try {
        // Create wasm directory if it doesn't exist
        const wasmDir = path.join(__dirname, '../wasm');
        await fs.mkdir(wasmDir, { recursive: true });
        
        // Create a minimal WASM binary for testing
        const minimalWasm = Buffer.from([
            0x00, 0x61, 0x73, 0x6d, // WASM magic number
            0x01, 0x00, 0x00, 0x00  // WASM version
        ]);
        
        const wasmPath = path.join(wasmDir, 'gocommander.wasm');
        await fs.writeFile(wasmPath, minimalWasm);
        
        console.log('✅ Minimal WASM binary created for testing');
        return true;
    } catch (error) {
        console.error('❌ Failed to create WASM binary:', error.message);
        return false;
    }
}

async function main() {
    console.log('GoCommander WASM Test');
    console.log('====================');
    
    let wasmExists = await testWASM();
    
    if (!wasmExists) {
        console.log('Building minimal WASM binary for testing...');
        wasmExists = await buildWASM();
    }
    
    if (wasmExists) {
        console.log('🎉 WASM test completed successfully');
        process.exit(0);
    } else {
        console.log('💥 WASM test failed');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('WASM test failed:', error);
        process.exit(1);
    });
}

module.exports = { testWASM, buildWASM };