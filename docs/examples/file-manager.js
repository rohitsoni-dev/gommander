#!/usr/bin/env node

/**
 * Example: File Manager CLI
 * Description: A comprehensive file management tool demonstrating advanced GoCommander features
 * 
 * Usage:
 *   node file-manager.js list [directory] [options]
 *   node file-manager.js copy <source> <destination> [options]
 *   node file-manager.js move <source> <destination> [options]
 *   node file-manager.js delete <files...> [options]
 * 
 * Features demonstrated:
 *   - Complex command structure
 *   - File system operations
 *   - Variadic arguments
 *   - Custom validation
 *   - Progress indicators
 *   - Error handling
 */

const { program, Option, Argument } = require('gocommander');
const fs = require('fs');
const path = require('path');

// Utility functions
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (date) => {
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

const validatePath = (filePath) => {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Path does not exist: ${filePath}`);
  }
  return fullPath;
};

const validateFile = (filePath) => {
  const fullPath = validatePath(filePath);
  if (!fs.statSync(fullPath).isFile()) {
    throw new Error(`Path is not a file: ${filePath}`);
  }
  return fullPath;
};

const validateDirectory = (dirPath) => {
  const fullPath = path.resolve(dirPath);
  if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
    throw new Error(`Path is not a directory: ${dirPath}`);
  }
  return fullPath;
};

// Set up the main program
program
  .name('file-manager')
  .description('A powerful file management CLI tool')
  .version('2.1.0')
  .option('-v, --verbose', 'enable verbose output')
  .option('--dry-run', 'show what would be done without executing')
  .option('--no-color', 'disable colored output');

// List command
const listCommand = program
  .command('list')
  .alias('ls')
  .description('list files and directories')
  .argument('[directory]', 'directory to list', validateDirectory, '.')
  .option('-a, --all', 'show hidden files')
  .option('-l, --long', 'use long listing format')
  .option('-r, --recursive', 'list subdirectories recursively')
  .option('-s, --size', 'show file sizes')
  .option('--sort <field>', 'sort by field', 'name')
  .addOption(new Option('--format <type>', 'output format')
    .choices(['table', 'json', 'csv'])
    .default('table'))
  .action((directory, options) => {
    const globalOpts = program.opts();
    
    if (globalOpts.verbose) {
      console.log(`📁 Listing directory: ${directory}`);
      console.log(`Options:`, options);
    }
    
    const listFiles = (dir, depth = 0) => {
      const files = fs.readdirSync(dir);
      const results = [];
      
      for (const file of files) {
        if (!options.all && file.startsWith('.')) continue;
        
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        const indent = '  '.repeat(depth);
        
        const fileInfo = {
          name: indent + file,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime,
          path: filePath
        };
        
        results.push(fileInfo);
        
        if (options.recursive && stats.isDirectory()) {
          results.push(...listFiles(filePath, depth + 1));
        }
      }
      
      return results;
    };
    
    try {
      const files = listFiles(directory);
      
      // Sort files
      const sortField = options.sort;
      files.sort((a, b) => {
        switch (sortField) {
          case 'size': return b.size - a.size;
          case 'date': return b.modified - a.modified;
          case 'name':
          default: return a.name.localeCompare(b.name);
        }
      });
      
      // Output in requested format
      switch (options.format) {
        case 'json':
          console.log(JSON.stringify(files, null, 2));
          break;
          
        case 'csv':
          console.log('name,type,size,modified');
          files.forEach(file => {
            console.log(`"${file.name}",${file.type},${file.size},"${formatDate(file.modified)}"`);
          });
          break;
          
        case 'table':
        default:
          console.log(`\n📂 Contents of ${directory}:\n`);
          files.forEach(file => {
            let line = file.name;
            
            if (options.long) {
              const type = file.type === 'directory' ? 'DIR' : 'FILE';
              line += ` [${type}]`;
            }
            
            if (options.size) {
              line += ` (${formatBytes(file.size)})`;
            }
            
            if (options.long) {
              line += ` - ${formatDate(file.modified)}`;
            }
            
            console.log(line);
          });
          
          console.log(`\n📊 Total: ${files.length} items`);
      }
      
    } catch (error) {
      console.error(`❌ Error listing directory: ${error.message}`);
      process.exit(1);
    }
  });

// Copy command
program
  .command('copy')
  .alias('cp')
  .description('copy files or directories')
  .argument('<source>', 'source file or directory', validatePath)
  .argument('<destination>', 'destination path')
  .option('-r, --recursive', 'copy directories recursively')
  .option('-f, --force', 'overwrite existing files')
  .option('-p, --preserve', 'preserve file attributes')
  .action((source, destination, options) => {
    const globalOpts = program.opts();
    
    if (globalOpts.verbose) {
      console.log(`📋 Copying ${source} to ${destination}`);
    }
    
    if (globalOpts.dryRun) {
      console.log(`🔍 DRY RUN: Would copy ${source} to ${destination}`);
      return;
    }
    
    try {
      const sourceStats = fs.statSync(source);
      
      if (sourceStats.isDirectory() && !options.recursive) {
        throw new Error('Source is a directory. Use --recursive to copy directories.');
      }
      
      if (fs.existsSync(destination) && !options.force) {
        throw new Error('Destination exists. Use --force to overwrite.');
      }
      
      const copyFile = (src, dest) => {
        if (globalOpts.verbose) {
          console.log(`  📄 Copying file: ${src} → ${dest}`);
        }
        
        fs.copyFileSync(src, dest);
        
        if (options.preserve) {
          const stats = fs.statSync(src);
          fs.utimesSync(dest, stats.atime, stats.mtime);
          fs.chmodSync(dest, stats.mode);
        }
      };
      
      const copyDirectory = (src, dest) => {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        
        const files = fs.readdirSync(src);
        
        for (const file of files) {
          const srcPath = path.join(src, file);
          const destPath = path.join(dest, file);
          const stats = fs.statSync(srcPath);
          
          if (stats.isDirectory()) {
            copyDirectory(srcPath, destPath);
          } else {
            copyFile(srcPath, destPath);
          }
        }
      };
      
      if (sourceStats.isDirectory()) {
        copyDirectory(source, destination);
      } else {
        copyFile(source, destination);
      }
      
      console.log(`✅ Successfully copied ${source} to ${destination}`);
      
    } catch (error) {
      console.error(`❌ Copy failed: ${error.message}`);
      process.exit(1);
    }
  });

// Move command
program
  .command('move')
  .alias('mv')
  .description('move/rename files or directories')
  .argument('<source>', 'source file or directory', validatePath)
  .argument('<destination>', 'destination path')
  .option('-f, --force', 'overwrite existing files')
  .action((source, destination, options) => {
    const globalOpts = program.opts();
    
    if (globalOpts.verbose) {
      console.log(`🚚 Moving ${source} to ${destination}`);
    }
    
    if (globalOpts.dryRun) {
      console.log(`🔍 DRY RUN: Would move ${source} to ${destination}`);
      return;
    }
    
    try {
      if (fs.existsSync(destination) && !options.force) {
        throw new Error('Destination exists. Use --force to overwrite.');
      }
      
      fs.renameSync(source, destination);
      console.log(`✅ Successfully moved ${source} to ${destination}`);
      
    } catch (error) {
      console.error(`❌ Move failed: ${error.message}`);
      process.exit(1);
    }
  });

// Delete command
program
  .command('delete')
  .alias('rm')
  .description('delete files or directories')
  .argument('<files...>', 'files or directories to delete')
  .option('-r, --recursive', 'remove directories recursively')
  .option('-f, --force', 'ignore nonexistent files')
  .option('-i, --interactive', 'prompt before each removal')
  .action((files, options) => {
    const globalOpts = program.opts();
    
    if (globalOpts.verbose) {
      console.log(`🗑️  Deleting files: ${files.join(', ')}`);
    }
    
    if (globalOpts.dryRun) {
      console.log(`🔍 DRY RUN: Would delete ${files.length} items`);
      files.forEach(file => console.log(`  - ${file}`));
      return;
    }
    
    let deletedCount = 0;
    
    for (const file of files) {
      try {
        if (!fs.existsSync(file)) {
          if (!options.force) {
            console.error(`❌ File not found: ${file}`);
            continue;
          } else {
            if (globalOpts.verbose) {
              console.log(`⚠️  Skipping nonexistent file: ${file}`);
            }
            continue;
          }
        }
        
        const stats = fs.statSync(file);
        
        if (stats.isDirectory() && !options.recursive) {
          console.error(`❌ ${file} is a directory. Use --recursive to delete directories.`);
          continue;
        }
        
        if (options.interactive) {
          // In a real implementation, you'd use a proper prompt library
          console.log(`Delete ${file}? (This is a simulation - file would be deleted)`);
        }
        
        if (stats.isDirectory()) {
          fs.rmSync(file, { recursive: true, force: true });
        } else {
          fs.unlinkSync(file);
        }
        
        if (globalOpts.verbose) {
          console.log(`🗑️  Deleted: ${file}`);
        }
        
        deletedCount++;
        
      } catch (error) {
        console.error(`❌ Failed to delete ${file}: ${error.message}`);
      }
    }
    
    console.log(`✅ Successfully deleted ${deletedCount} of ${files.length} items`);
  });

// Info command
program
  .command('info')
  .description('show detailed information about files')
  .argument('<files...>', 'files to analyze')
  .option('--checksum', 'calculate file checksums')
  .action((files, options) => {
    const globalOpts = program.opts();
    
    for (const file of files) {
      try {
        if (!fs.existsSync(file)) {
          console.error(`❌ File not found: ${file}`);
          continue;
        }
        
        const stats = fs.statSync(file);
        const fullPath = path.resolve(file);
        
        console.log(`\n📄 File Information: ${file}`);
        console.log('='.repeat(50));
        console.log(`Path: ${fullPath}`);
        console.log(`Type: ${stats.isDirectory() ? 'Directory' : 'File'}`);
        console.log(`Size: ${formatBytes(stats.size)}`);
        console.log(`Created: ${formatDate(stats.birthtime)}`);
        console.log(`Modified: ${formatDate(stats.mtime)}`);
        console.log(`Accessed: ${formatDate(stats.atime)}`);
        console.log(`Permissions: ${stats.mode.toString(8)}`);
        
        if (options.checksum && stats.isFile()) {
          const crypto = require('crypto');
          const content = fs.readFileSync(file);
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          console.log(`SHA256: ${hash}`);
        }
        
      } catch (error) {
        console.error(`❌ Error getting info for ${file}: ${error.message}`);
      }
    }
  });

// Add help text
program.addHelpText('after', `
Examples:
  $ file-manager list --recursive --long
  $ file-manager copy ./src ./backup --recursive
  $ file-manager move old-name.txt new-name.txt
  $ file-manager delete temp-file.txt --force
  $ file-manager info *.js --checksum

For more information, visit: https://github.com/rohitsoni007/gocommander
`);

// Parse command line arguments
program.parse();