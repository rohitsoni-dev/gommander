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
  const files = [];
  
  // Check JavaScript files
  const jsFiles = ['index.js', 'index.esm.js', 'index.d.ts'];
  for (const file of jsFiles) {
    const filePath = path.join(libDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      files.push({ name: `lib/${file}`, size: stats.size });
      totalSize += stats.size;
    }
  }
  
  // Check WASM files
  const wasmFiles = fs.readdirSync(wasmDir).filter(f => f.endsWith('.wasm'));
  for (const file of wasmFiles) {
    const filePath = path.join(wasmDir, file);
    const stats = fs.statSync(filePath);
    files.push({ name: `wasm/${file}`, size: stats.size });
    totalSize += stats.size;
  }
  
  // Display results
  console.log('📦 Bundle Size Analysis');
  console.log('═'.repeat(40));
  
  files.sort((a, b) => b.size - a.size);
  
  for (const file of files) {
    const percentage = ((file.size / totalSize) * 100).toFixed(1);
    console.log(`${file.name.padEnd(25)} ${formatBytes(file.size).padStart(10)} (${percentage}%)`);
  }
  
  console.log('─'.repeat(40));
  console.log(`Total Size:                ${formatBytes(totalSize).padStart(10)}`);
  
  // Size requirements check (< 500KB as per requirements)
  const maxSize = 500 * 1024; // 500KB
  const sizeCheck = totalSize <= maxSize;
  
  console.log('\n🎯 Size Requirements');
  console.log('═'.repeat(40));
  console.log(`Maximum allowed:           ${formatBytes(maxSize).padStart(10)}`);
  console.log(`Current size:              ${formatBytes(totalSize).padStart(10)}`);
  console.log(`Status:                    ${sizeCheck ? '✅ PASS' : '❌ FAIL'}`);
  
  if (!sizeCheck) {
    const excess = totalSize - maxSize;
    console.log(`Excess:                    ${formatBytes(excess).padStart(10)}`);
    console.log('\n💡 Size Optimization Tips:');
    console.log('- Use TinyGo for smaller WASM binaries');
    console.log('- Enable tree-shaking in rollup config');
    console.log('- Minify JavaScript output');
    console.log('- Remove unused exports');
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
  
  if (sizeCheck) {
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