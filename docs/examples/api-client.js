#!/usr/bin/env node

/**
 * Example: REST API Client CLI
 * Description: A comprehensive REST API client demonstrating HTTP operations and response handling
 * 
 * Usage:
 *   node api-client.js get <endpoint> [options]
 *   node api-client.js post <endpoint> [options]
 *   node api-client.js put <endpoint> [options]
 *   node api-client.js delete <endpoint> [options]
 * 
 * Features demonstrated:
 *   - HTTP method commands
 *   - Request/response handling
 *   - JSON data processing
 *   - Authentication options
 *   - Output formatting
 *   - Error handling
 */

const { program, Option } = require('gocommander');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Utility functions
const parseJSON = (str) => {
  try {
    return JSON.parse(str);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
};

const parseHeaders = (headerStrings) => {
  const headers = {};
  for (const headerStr of headerStrings) {
    const [key, ...valueParts] = headerStr.split(':');
    if (!key || valueParts.length === 0) {
      throw new Error(`Invalid header format: ${headerStr}. Use "Key: Value" format.`);
    }
    headers[key.trim()] = valueParts.join(':').trim();
  }
  return headers;
};

const formatResponse = (response, data, format) => {
  switch (format) {
    case 'json':
      try {
        const parsed = JSON.parse(data);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return data;
      }
      
    case 'headers':
      let output = `Status: ${response.statusCode} ${response.statusMessage}\n`;
      output += 'Headers:\n';
      for (const [key, value] of Object.entries(response.headers)) {
        output += `  ${key}: ${value}\n`;
      }
      return output;
      
    case 'full':
      let fullOutput = `Status: ${response.statusCode} ${response.statusMessage}\n`;
      fullOutput += 'Headers:\n';
      for (const [key, value] of Object.entries(response.headers)) {
        fullOutput += `  ${key}: ${value}\n`;
      }
      fullOutput += '\nBody:\n';
      try {
        const parsed = JSON.parse(data);
        fullOutput += JSON.stringify(parsed, null, 2);
      } catch {
        fullOutput += data;
      }
      return fullOutput;
      
    case 'raw':
    default:
      return data;
  }
};

const makeRequest = (method, url, options, data = null) => {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method.toUpperCase(),
      headers: {
        'User-Agent': 'GoCommander API Client/1.0.0',
        ...options.headers
      }
    };
    
    if (data) {
      if (typeof data === 'object') {
        data = JSON.stringify(data);
        requestOptions.headers['Content-Type'] = 'application/json';
      }
      requestOptions.headers['Content-Length'] = Buffer.byteLength(data);
    }
    
    if (options.auth) {
      requestOptions.headers['Authorization'] = options.auth;
    }
    
    const req = client.request(requestOptions, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        resolve({ response: res, data: responseData });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (options.timeout) {
      req.setTimeout(options.timeout * 1000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    }
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
};

// Set up the main program
program
  .name('api-client')
  .description('A powerful REST API client CLI tool')
  .version('1.2.0')
  .option('-u, --base-url <url>', 'base URL for API requests', 'https://jsonplaceholder.typicode.com')
  .option('-v, --verbose', 'enable verbose output')
  .option('-t, --timeout <seconds>', 'request timeout in seconds', parseInt, 30)
  .addOption(new Option('-f, --format <type>', 'response format')
    .choices(['json', 'raw', 'headers', 'full'])
    .default('json'))
  .option('-H, --header <header>', 'add custom header (format: "Key: Value")', [], (value, previous) => {
    return previous.concat([value]);
  });

// Authentication options
const authGroup = new Option('-a, --auth <type>', 'authentication type')
  .choices(['bearer', 'basic', 'api-key']);

program.addOption(authGroup);
program.option('--token <token>', 'authentication token');
program.option('--username <username>', 'username for basic auth');
program.option('--password <password>', 'password for basic auth');
program.option('--api-key <key>', 'API key');
program.option('--api-key-header <header>', 'API key header name', 'X-API-Key');

// GET command
program
  .command('get')
  .description('make a GET request')
  .argument('<endpoint>', 'API endpoint')
  .option('-q, --query <params>', 'query parameters as JSON string', '{}')
  .action(async (endpoint, options) => {
    const globalOpts = program.opts();
    await executeRequest('GET', endpoint, options, globalOpts);
  });

// POST command
program
  .command('post')
  .description('make a POST request')
  .argument('<endpoint>', 'API endpoint')
  .option('-d, --data <data>', 'request body as JSON string', '{}')
  .option('-f, --file <path>', 'read request body from file')
  .action(async (endpoint, options) => {
    const globalOpts = program.opts();
    await executeRequest('POST', endpoint, options, globalOpts);
  });

// PUT command
program
  .command('put')
  .description('make a PUT request')
  .argument('<endpoint>', 'API endpoint')
  .option('-d, --data <data>', 'request body as JSON string', '{}')
  .option('-f, --file <path>', 'read request body from file')
  .action(async (endpoint, options) => {
    const globalOpts = program.opts();
    await executeRequest('PUT', endpoint, options, globalOpts);
  });

// PATCH command
program
  .command('patch')
  .description('make a PATCH request')
  .argument('<endpoint>', 'API endpoint')
  .option('-d, --data <data>', 'request body as JSON string', '{}')
  .option('-f, --file <path>', 'read request body from file')
  .action(async (endpoint, options) => {
    const globalOpts = program.opts();
    await executeRequest('PATCH', endpoint, options, globalOpts);
  });

// DELETE command
program
  .command('delete')
  .alias('del')
  .description('make a DELETE request')
  .argument('<endpoint>', 'API endpoint')
  .action(async (endpoint, options) => {
    const globalOpts = program.opts();
    await executeRequest('DELETE', endpoint, options, globalOpts);
  });

// Main request execution function
async function executeRequest(method, endpoint, cmdOptions, globalOptions) {
  try {
    // Build full URL
    let url = endpoint.startsWith('http') ? endpoint : `${globalOptions.baseUrl}${endpoint}`;
    
    // Add query parameters for GET requests
    if (method === 'GET' && cmdOptions.query && cmdOptions.query !== '{}') {
      const queryParams = parseJSON(cmdOptions.query);
      const urlObj = new URL(url);
      for (const [key, value] of Object.entries(queryParams)) {
        urlObj.searchParams.append(key, value);
      }
      url = urlObj.toString();
    }
    
    // Prepare headers
    let headers = {};
    if (globalOptions.header && globalOptions.header.length > 0) {
      headers = parseHeaders(globalOptions.header);
    }
    
    // Handle authentication
    let auth = null;
    if (globalOptions.auth) {
      switch (globalOptions.auth) {
        case 'bearer':
          if (!globalOptions.token) {
            throw new Error('Bearer token required. Use --token option.');
          }
          auth = `Bearer ${globalOptions.token}`;
          break;
          
        case 'basic':
          if (!globalOptions.username || !globalOptions.password) {
            throw new Error('Username and password required for basic auth.');
          }
          const credentials = Buffer.from(`${globalOptions.username}:${globalOptions.password}`).toString('base64');
          auth = `Basic ${credentials}`;
          break;
          
        case 'api-key':
          if (!globalOptions.apiKey) {
            throw new Error('API key required. Use --api-key option.');
          }
          headers[globalOptions.apiKeyHeader] = globalOptions.apiKey;
          break;
      }
    }
    
    // Prepare request data
    let requestData = null;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      if (cmdOptions.file) {
        const fs = require('fs');
        requestData = fs.readFileSync(cmdOptions.file, 'utf8');
        try {
          requestData = JSON.parse(requestData);
        } catch {
          // Keep as string if not valid JSON
        }
      } else if (cmdOptions.data && cmdOptions.data !== '{}') {
        requestData = parseJSON(cmdOptions.data);
      }
    }
    
    if (globalOptions.verbose) {
      console.log(`🌐 Making ${method} request to: ${url}`);
      if (auth) console.log(`🔐 Authentication: ${globalOptions.auth}`);
      if (Object.keys(headers).length > 0) {
        console.log(`📋 Headers:`, headers);
      }
      if (requestData) {
        console.log(`📤 Request data:`, typeof requestData === 'string' ? requestData : JSON.stringify(requestData, null, 2));
      }
      console.log('');
    }
    
    // Make the request
    const { response, data } = await makeRequest(method, url, {
      headers,
      auth,
      timeout: globalOptions.timeout
    }, requestData);
    
    // Handle response
    if (globalOptions.verbose) {
      console.log(`📥 Response status: ${response.statusCode} ${response.statusMessage}`);
      console.log(`📊 Response size: ${data.length} bytes`);
      console.log('');
    }
    
    // Format and display response
    const formattedResponse = formatResponse(response, data, globalOptions.format);
    console.log(formattedResponse);
    
    // Exit with error code for HTTP errors
    if (response.statusCode >= 400) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`❌ Request failed: ${error.message}`);
    
    if (globalOptions.verbose) {
      console.error('Stack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

// Config command for managing saved configurations
program
  .command('config')
  .description('manage API client configuration')
  .option('--set <key=value>', 'set configuration value')
  .option('--get <key>', 'get configuration value')
  .option('--list', 'list all configuration')
  .option('--delete <key>', 'delete configuration value')
  .action((options) => {
    const fs = require('fs');
    const os = require('os');
    const configPath = `${os.homedir()}/.api-client-config.json`;
    
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    
    if (options.set) {
      const [key, value] = options.set.split('=');
      config[key] = value;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`✅ Set ${key} = ${value}`);
    } else if (options.get) {
      console.log(config[options.get] || 'Not set');
    } else if (options.list) {
      console.log('📋 Configuration:');
      for (const [key, value] of Object.entries(config)) {
        console.log(`  ${key}: ${value}`);
      }
    } else if (options.delete) {
      delete config[options.delete];
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`✅ Deleted ${options.delete}`);
    } else {
      console.log('Use --set, --get, --list, or --delete options');
    }
  });

// Add help text
program.addHelpText('after', `
Examples:
  Basic requests:
    $ api-client get /posts
    $ api-client post /posts --data '{"title":"Hello","body":"World"}'
    $ api-client put /posts/1 --data '{"id":1,"title":"Updated"}'
    $ api-client delete /posts/1

  With authentication:
    $ api-client get /protected --auth bearer --token abc123
    $ api-client get /api/data --auth api-key --api-key secret123

  Custom formatting:
    $ api-client get /posts --format full
    $ api-client get /posts --format headers

  With custom headers:
    $ api-client get /posts -H "Accept: application/json" -H "User-Agent: MyApp"

  Configuration:
    $ api-client config --set baseUrl=https://api.example.com
    $ api-client config --set token=abc123
    $ api-client config --list

For more information, visit: https://github.com/rohitsoni-dev/gocommander
`);

// Parse command line arguments
program.parse();