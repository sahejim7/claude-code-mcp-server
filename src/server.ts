#!/usr/bin/env node
import { createServer } from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

interface DocSection {
  id: string;
  title: string;
  content: string;
  url?: string;
}

const CLAUDE_CODE_DOCS: DocSection[] = [
  { /* ...same DOCS as before... */ }
];

class ClaudeCodeDocServer {
  private server: Server;

  constructor() {
    this.server = new Server({ name: 'claude-code-docs', version: '0.1.0' }, {
      capabilities: { resources: {}, tools: {} }
    });
    this.setupHandlers();
  }

  private setupHandlers() { /* identical handlers for ListResources, ReadResource, etc. */ }

  async runStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  async runSSE(res: any) {
    const transport = new SSEServerTransport('/mcp', res);
    await this.server.connect(transport);
  }
}

const PORT = process.env.PORT || 3000;

const httpServer = createServer(async (req, res) => {
  // Standard CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/mcp' || req.url === '/sse' || req.url === '/sse/') {
    console.log(`[${new Date().toISOString()}] ${req.method} request to ${req.url}`);
    console.log(`[${new Date().toISOString()}] Headers:`, req.headers);

    const mcpServer = new ClaudeCodeDocServer();

    try {
      if (req.method === 'POST') {
        await mcpServer.runSSE(res);
      } else if (req.method === 'GET') {
        console.log(`[${new Date().toISOString()}] Starting SSE via SDK`);
        await mcpServer.runSSE(res);
      }
      return;
    } catch (err) {
      console.error(`Error in MCP handler:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
      return;
    }
  }

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'Claude Code MCP Server Running',
      timestamp: new Date().toISOString(),
      endpoints: { mcp: '/mcp', sse: '/sse', health: '/health' }
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found. Use /mcp for MCP protocol.' }));
});

if (process.argv.includes('--stdio')) {
  const mcpServer = new ClaudeCodeDocServer();
  mcpServer.runStdio().catch(console.error);
} else {
  httpServer.listen(PORT, () => {
    console.log(`🚀 MCP Server running on port ${PORT}`);
  });
}
