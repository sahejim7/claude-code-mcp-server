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
  {
    id: 'overview',
    title: 'Claude Code Overview',
    content: `Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster through natural language commands.

Key capabilities:
- Editing files and fixing bugs across your codebase
- Answering questions about your code's architecture and logic
- Executing and fixing tests, linting, and other commands
- Searching through git history, resolving merge conflicts, and creating commits and PRs
- Works with Amazon Bedrock and Google Vertex AI for enterprise deployments`,
    url: 'https://docs.anthropic.com/en/docs/claude-code/'
  },
  {
    id: 'getting-started',
    title: 'Getting Started with Claude Code',
    content: `To get started with Claude Code:

1. Follow the installation guide
2. Claude operates directly in your terminal with full project awareness
3. No need to manually manage context—Claude navigates your code automatically

Security:
- Direct API connection to Anthropic
- Takes real actions in your terminal`,
    url: 'https://docs.anthropic.com/en/docs/claude-code/getting-started'
  },
  {
    id: 'enterprise',
    title: 'Enterprise Integration',
    content: `Enterprise platforms supported:

- Amazon Bedrock
- Google Vertex AI

Secure and compliant deployments.`,
    url: 'https://docs.anthropic.com/en/docs/claude-code/bedrock-vertex'
  },
  {
    id: 'privacy-security',
    title: 'Privacy and Security',
    content: `Data and privacy safeguards:

- Feedback may be used to improve product quality, not model training
- Data retention for 30 days
- Direct API communication, no intermediate servers`,
    url: 'https://docs.anthropic.com/en/docs/claude-code/'
  },
];

class ClaudeCodeDocServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: 'claude-code-docs', version: '0.1.0' },
      { capabilities: { resources: {}, tools: {} } }
    );
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: CLAUDE_CODE_DOCS.map(doc => ({
          uri: `claude-code://docs/${doc.id}`,
          mimeType: 'text/plain',
          name: doc.title,
          description: `Claude Code documentation: ${doc.title}`,
        })),
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const docId = new URL(request.params.uri).pathname.replace('/docs/', '');
      const doc = CLAUDE_CODE_DOCS.find(d => d.id === docId);
      if (!doc) {
        throw new McpError(ErrorCode.InvalidRequest, `Unknown document: ${docId}`);
      }

      return {
        contents: [{
          uri: request.params.uri,
          mimeType: 'text/plain',
          text: `# ${doc.title}\n\n${doc.content}${doc.url ? `\n\nSource: ${doc.url}` : ''}`,
        }],
      };
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_claude_code_docs',
            description: 'Search through Claude Code documentation',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' }
              },
              required: ['query']
            }
          },
          {
            name: 'get_claude_code_capabilities',
            description: 'Get Claude Code capabilities overview',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;

      if (name === 'search_claude_code_docs') {
        const query = request.params.arguments?.query as string;
        const matches = CLAUDE_CODE_DOCS.filter(doc =>
          doc.title.toLowerCase().includes(query.toLowerCase()) ||
          doc.content.toLowerCase().includes(query.toLowerCase())
        );
        return {
          content: [{
            type: 'text',
            text: matches.length
              ? matches.map(doc => `## ${doc.title}\n${doc.content}${doc.url ? `\nSource: ${doc.url}` : ''}`).join('\n\n---\n\n')
              : `No documentation found matching "${query}"`
          }]
        };
      }

      if (name === 'get_claude_code_capabilities') {
        const overview = CLAUDE_CODE_DOCS.find(d => d.id === 'overview');
        return {
          content: [{
            type: 'text',
            text: overview?.content ?? 'Capabilities not found'
          }]
        };
      }

      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    });
  }

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (['/mcp', '/sse'].includes(req.url ?? '')) {
    const server = new ClaudeCodeDocServer();
    try {
      await server.runSSE(res);
    } catch (err) {
      console.error('SSE server error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
    return;
  }

  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'Claude Code MCP server running',
      timestamp: new Date().toISOString(),
      endpoints: {
        mcp: '/mcp',
        sse: '/sse',
        health: '/health'
      }
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

if (process.argv.includes('--stdio')) {
  new ClaudeCodeDocServer().runStdio().catch(console.error);
} else {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Claude Code MCP server running on port ${PORT}`);
  });
}

