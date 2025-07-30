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
    content: `Claude Code is an agentic coding tool that lives in your terminal, understands your codebase,\nand helps you code faster through natural language commands. By integrating directly with your\ndevelopment environment, Claude Code streamlines your workflow without requiring additional\nservers or complex setup.

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

1. Follow the installation guide which covers:
   - System requirements
   - Installation steps
   - Authentication process

2. Claude Code operates directly in your terminal and maintains awareness of your entire project structure.

3. No need to manually add files to context—Claude will explore your codebase as needed.

Security features:
- Direct API connection to Anthropic's API
- Works directly in your terminal
- Understands your entire project context
- Takes real actions like editing files and creating commits`,
    url: 'https://docs.anthropic.com/en/docs/claude-code/getting-started'
  },
  {
    id: 'enterprise',
    title: 'Enterprise Integration',
    content: `Claude Code seamlessly integrates with enterprise AI platforms:

- Amazon Bedrock integration for secure, compliant deployments
- Google Vertex AI support for enterprise requirements
- Meets organizational security and compliance standards

The enterprise integrations maintain the same direct terminal operation while providing the security and compliance features required by organizations.`,
    url: 'https://docs.anthropic.com/en/docs/claude-code/bedrock-vertex'
  },
  {
    id: 'privacy-security',
    title: 'Privacy and Security',
    content: `Claude Code's architecture ensures security and privacy:

Data Usage:
- Feedback may be used to improve products and services
- Will NOT train generative models using your feedback
- User feedback transcripts stored for only 30 days

Privacy Safeguards:
- Limited retention periods for sensitive information
- Restricted access to user session data
- Clear policies against using feedback for model training
- Direct API connection without intermediate servers

Report bugs with the /bug command or through the GitHub repository.`,
    url: 'https://docs.anthropic.com/en/docs/claude-code/'
  }
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
      const uri = request.params.uri;
      const docId = new URL(uri).pathname.replace('/docs/', '');
      const doc = CLAUDE_CODE_DOCS.find(d => d.id === docId);
      if (!doc) {
        throw new McpError(ErrorCode.InvalidRequest, `Unknown document: ${docId}`);
      }
      return {
        contents: [{
          uri,
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
              properties: { query: { type: 'string', description: 'Search query' } },
              required: ['query']
            },
          },
          {
            name: 'get_claude_code_capabilities',
            description: 'Get overview section content',
            inputSchema: { type: 'object', properties: {}, required: [] },
          }
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      if (name === 'search_claude_code_docs') {
        const q = request.params.arguments?.query as string;
        const results = CLAUDE_CODE_DOCS.filter(doc =>
          doc.title.toLowerCase().includes(q.toLowerCase()) ||
          doc.content.toLowerCase().includes(q.toLowerCase())
        );
        return {
          content: [{
            type: 'text',
            text: results.length > 0
              ? `Found ${results.length} relevant sections:\n\n${results.map(doc =>
                  `## ${doc.title}\n${doc.content}${doc.url ? `\nSource: ${doc.url}` : ''}`
                ).join('\n\n---\n\n')}`
              : `No documentation found matching "${q}"`,
          }],
        };
      }
      if (name === 'get_claude_code_capabilities') {
        const overview = CLAUDE_CODE_DOCS.find(d => d.id === 'overview');
        return {
          content: [{ type: 'text', text: overview?.content ?? '' }],
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

  if (['/mcp', '/sse', '/sse/'].includes(req.url ?? '')) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);

    const mcpServer = new ClaudeCodeDocServer();
    try {
      await mcpServer.runSSE(res);
      return;
    } catch (err) {
      console.error('Error in MCP handler:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
      return;
    }
  }

  if (['/', '/health'].includes(req.url ?? '')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'Claude Code MCP Server Running',
      timestamp: new Date().toISOString(),
      endpoints: { mcp: '/mcp', sse: '/sse', health: '/health' },
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found. Use /mcp for MCP protocol.' }));
});

if (process.argv.includes('--stdio')) {
  new ClaudeCodeDocServer().runStdio().catch(console.error);
} else {
  httpServer.listen(PORT, () => {
    console.log(`🚀 MCP Server listening on port ${PORT}`);
  });
}
