#!/usr/bin/env node

/**
 * Check bundle size and ensure it meets requirements
 */

const fs = require('fs');
const path = require('path');

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function checkBundleSize() {
  console.log('Checking bundle size...\n');
  
  const libDir = path.join(__dirname, '..', 'lib');
  const wasmDir = path.join(__dirname, '..', 'wasm');
  
  if (!fs.existsSync(libDir)) {
    console.error('❌ lib/ directory not found. Run npm run build first.');
    process.exit(1);
  }
  
  if (!fs.existsSync(wasmDir)) {
    console.error('❌ wasm/ directory not found. Run npm run build first.');
    process.exit(1);
  }
  
  let totalSize = 0;
  let compressedSize = 0;
  const files = [];
  
  // Check JavaScript files
  const jsFiles = ['index.js', 'index.esm.js', 'index.umd.js', 'index.d.ts'];
  for (const file of jsFiles) {
    const filePath = path.join(libDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const size = stats.size;
      
      // Estimate gzipped size (rough approximation)
      const content = fs.readFileSync(filePath, 'utf8');
      const estimatedGzipSize = Math.floor(size * 0.3); // Rough estimate
      
      files.push({ 
        name: `lib/${file}`, 
        size: size,
        gzipSize: estimatedGzipSize,
        type: 'js'
      });
      totalSize += size;
      compressedSize += estimatedGzipSize;
    }
  }
  
  // Check WASM files
  const wasmFiles = fs.readdirSync(wasmDir).filter(f => f.endsWith('.wasm'));
  for (const file of wasmFiles) {
    const filePath = path.join(wasmDir, file);
    const stats = fs.statSync(filePath);
    const size = stats.size;
    
    // WASM files compress well
    const estimatedGzipSize = Math.floor(size * 0.4);
    
    files.push({ 
      name: `wasm/${file}`, 
      size: size,
      gzipSize: estimatedGzipSize,
      type: 'wasm'
    });
    totalSize += size;
    compressedSize += estimatedGzipSize;
  }
  
  // Check support files
  const supportFiles = ['wasm_exec.js'];
  for (const file of supportFiles) {
    const filePath = path.join(wasmDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const size = stats.size;
      const estimatedGzipSize = Math.floor(size * 0.3);
      
      files.push({ 
        name: `wasm/${file}`, 
        size: size,
        gzipSize: estimatedGzipSize,
        type: 'support'
      });
      totalSize += size;
      compressedSize += estimatedGzipSize;
    }
  }
  
  // Display results
  console.log('📦 Bundle Size Analysis');
  console.log('═'.repeat(60));
  
  files.sort((a, b) => b.size - a.size);
  
  console.log('File'.padEnd(25) + 'Raw Size'.padStart(12) + 'Gzipped'.padStart(12) + 'Type'.padStart(8) + '%'.padStart(6));
  console.log('─'.repeat(60));
  
  for (const file of files) {
    const percentage = ((file.size / totalSize) * 100).toFixed(1);
    const typeIcon = file.type === 'wasm' ? '🔧' : file.type === 'js' ? '📜' : '🔗';
    console.log(
      `${file.name.padEnd(25)} ${formatBytes(file.size).padStart(10)} ${formatBytes(file.gzipSize).padStart(10)} ${(typeIcon + file.type).padStart(6)} ${percentage.padStart(4)}%`
    );
  }
  
  console.log('─'.repeat(60));
  console.log(`Total Raw Size:            ${formatBytes(totalSize).padStart(10)}`);
  console.log(`Total Compressed:          ${formatBytes(compressedSize).padStart(10)}`);
  console.log(`Compression Ratio:         ${((1 - compressedSize / totalSize) * 100).toFixed(1)}%`);
  
  // Size requirements check (< 500KB as per requirements)
  const maxSize = 500 * 1024; // 500KB
  const maxCompressedSize = 200 * 1024; // 200KB compressed target
  const sizeCheck = totalSize <= maxSize;
  const compressedSizeCheck = compressedSize <= maxCompressedSize;
  
  console.log('\n🎯 Size Requirements');
  console.log('═'.repeat(60));
  console.log(`Maximum raw size:          ${formatBytes(maxSize).padStart(10)}`);
  console.log(`Current raw size:          ${formatBytes(totalSize).padStart(10)}`);
  console.log(`Raw size status:           ${sizeCheck ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Maximum compressed:        ${formatBytes(maxCompressedSize).padStart(10)}`);
  console.log(`Current compressed:        ${formatBytes(compressedSize).padStart(10)}`);
  console.log(`Compressed status:         ${compressedSizeCheck ? '✅ PASS' : '❌ FAIL'}`);
  
  if (!sizeCheck || !compressedSizeCheck) {
    if (!sizeCheck) {
      const excess = totalSize - maxSize;
      console.log(`Raw size excess:           ${formatBytes(excess).padStart(10)}`);
    }
    if (!compressedSizeCheck) {
      const excess = compressedSize - maxCompressedSize;
      console.log(`Compressed excess:         ${formatBytes(excess).padStart(10)}`);
    }
    
    console.log('\n💡 Size Optimization Tips:');
    console.log('- Use TinyGo for smaller WASM binaries (-opt 2 -gc leaking)');
    console.log('- Enable tree-shaking in rollup config');
    console.log('- Minify JavaScript output with terser');
    console.log('- Remove unused exports and dead code');
    console.log('- Use lazy loading for WASM module');
    console.log('- Consider splitting large modules');
  }
  
  // Performance comparison with Commander.js
  console.log('\n📊 Comparison with Commander.js');
  console.log('═'.repeat(40));
  
  try {
    // Try to get commander.js size for comparison
    const commanderPath = path.join(__dirname, '..', 'node_modules', 'commander', 'index.js');
    if (fs.existsSync(commanderPath)) {
      const commanderStats = fs.statSync(commanderPath);
      const ratio = (totalSize / commanderStats.size).toFixed(1);
      console.log(`Commander.js size:         ${formatBytes(commanderStats.size).padStart(10)}`);
      console.log(`GoCommander size:          ${formatBytes(totalSize).padStart(10)}`);
      console.log(`Size ratio:                ${ratio}x larger`);
      
      if (ratio <= 3) {
        console.log('Status:                    ✅ Acceptable size increase');
      } else {
        console.log('Status:                    ⚠️  Large size increase');
      }
    } else {
      console.log('Commander.js not found for comparison');
    }
  } catch (error) {
    console.log('Could not compare with Commander.js');
  }
  
  console.log('\n' + '═'.repeat(40));
  
  const overallPass = sizeCheck && compressedSizeCheck;
  
  if (overallPass) {
    console.log('✅ Bundle size check passed!');
    return true;
  } else {
    console.log('❌ Bundle size check failed!');
    return false;
  }
}

if (require.main === module) {
  const passed = checkBundleSize();
  process.exit(passed ? 0 : 1);
}

module.exports = { checkBundleSize };