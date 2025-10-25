#!/usr/bin/env node

/**
 * Simple documentation server for development
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8080;
const DOCS_DIR = path.join(__dirname, '..', 'docs');

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

function renderMarkdown(content) {
  // Simple markdown to HTML conversion
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>GoCommander Documentation</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px;
            line-height: 1.6;
        }
        code { 
            background: #f4f4f4; 
            padding: 2px 4px; 
            border-radius: 3px;
            font-family: 'Monaco', 'Consolas', monospace;
        }
        pre { 
            background: #f4f4f4; 
            padding: 15px; 
            border-radius: 5px;
            overflow-x: auto;
        }
        pre code {
            background: none;
            padding: 0;
        }
        h1, h2, h3 { color: #333; }
        h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
        h2 { border-bottom: 1px solid #eee; padding-bottom: 5px; }
        a { color: #0066cc; text-decoration: none; }
        a:hover { text-decoration: underline; }
        blockquote {
            border-left: 4px solid #ddd;
            margin: 0;
            padding-left: 20px;
            color: #666;
        }
        table {
            border-collapse: collapse;
            width: 100%;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f2f2f2;
        }
        .nav {
            background: #f8f9fa;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .nav a {
            margin-right: 15px;
        }
    </style>
</head>
<body>
    <div class="nav">
        <a href="/">Home</a>
        <a href="/api/">API Docs</a>
        <a href="https://github.com/rohitsoni007/gocommander">GitHub</a>
    </div>
    <div id="content">
        ${content
          .replace(/^# (.+)$/gm, '<h1>$1</h1>')
          .replace(/^## (.+)$/gm, '<h2>$1</h2>')
          .replace(/^### (.+)$/gm, '<h3>$1</h3>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/\`(.+?)\`/g, '<code>$1</code>')
          .replace(/```([\\s\\S]*?)```/g, '<pre><code>$1</code></pre>')
          .replace(/\\n/g, '<br>')
          .replace(/^- (.+)$/gm, '<li>$1</li>')
          .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        }
    </div>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;
  
  // Default to index
  if (pathname === '/') {
    pathname = '/index.md';
  }
  
  // Add .md extension if not present and not a directory
  if (!path.extname(pathname) && !pathname.endsWith('/')) {
    pathname += '.md';
  }
  
  const filePath = path.join(DOCS_DIR, pathname);
  
  // Security check - ensure file is within docs directory
  if (!filePath.startsWith(DOCS_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  fs.stat(filePath, (err, stats) => {
    if (err) {
      // Try directory index
      if (pathname.endsWith('/')) {
        const indexPath = path.join(filePath, 'index.md');
        fs.readFile(indexPath, 'utf8', (err, content) => {
          if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
          }
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(renderMarkdown(content));
        });
        return;
      }
      
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    
    if (stats.isDirectory()) {
      // Redirect to directory with trailing slash
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { 'Location': pathname + '/' });
        res.end();
        return;
      }
      
      // Try to serve index.md
      const indexPath = path.join(filePath, 'index.md');
      fs.readFile(indexPath, 'utf8', (err, content) => {
        if (err) {
          // List directory contents
          fs.readdir(filePath, (err, files) => {
            if (err) {
              res.writeHead(500);
              res.end('Internal Server Error');
              return;
            }
            
            const fileList = files
              .map(file => `<li><a href="${pathname}${file}">${file}</a></li>`)
              .join('');
            
            const html = `<!DOCTYPE html>
<html>
<head><title>Directory: ${pathname}</title></head>
<body>
<h1>Directory: ${pathname}</h1>
<ul>${fileList}</ul>
</body>
</html>`;
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
          });
          return;
        }
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderMarkdown(content));
      });
      return;
    }
    
    // Serve file
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Internal Server Error');
        return;
      }
      
      const mimeType = getMimeType(filePath);
      
      if (mimeType === 'text/markdown') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderMarkdown(content.toString()));
      } else {
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(content);
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`📚 Documentation server running at http://localhost:${PORT}`);
  console.log(`📁 Serving docs from: ${DOCS_DIR}`);
  console.log('');
  console.log('Available routes:');
  console.log(`  http://localhost:${PORT}/          - Main documentation`);
  console.log(`  http://localhost:${PORT}/api/      - API documentation`);
  console.log('');
  console.log('Press Ctrl+C to stop the server');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\\n📚 Documentation server stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\\n📚 Documentation server stopped');
  process.exit(0);
});