#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Documentation content structure
interface DocSection {
  id: string;
  title: string;
  content: string;
  url?: string;
}

// Claude Code documentation sections
const CLAUDE_CODE_DOCS: DocSection[] = [
  {
    id: 'overview',
    title: 'Claude Code Overview',
    content: `Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster through natural language commands. By integrating directly with your development environment, Claude Code streamlines your workflow without requiring additional servers or complex setup.

Key capabilities:
- Editing files and fixing bugs across your codebase
- Answering questions about your code's architecture and logic
- Executing and fixing tests, linting, and other commands
- Searching through git history, resolving merge conflicts, and creating commits and PRs
- Works with Amazon Bedrock and Google Vertex AI for enterprise deployments

Claude Code uses claude-3-7-sonnet-20250219 by default and operates directly in your terminal with direct API connection to Anthropic's servers.`,
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

3. No need to manually add files to context - Claude will explore your codebase as needed.

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
  },
  {
    id: 'license',
    title: 'License and Terms',
    content: `Claude Code is provided as a Beta research preview under Anthropic's Commercial Terms of Service.

Current Status:
- Beta research preview gathering developer feedback
- Evolving based on user feedback
- Plans to enhance tool execution reliability, support for long-running commands, terminal rendering, and Claude's self-knowledge

© Anthropic PBC. All rights reserved. Use is subject to Anthropic's Commercial Terms of Service and Privacy Policy.`
  }
];

class ClaudeCodeDocServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'claude-code-docs',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
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
      const url = new URL(request.params.uri);
      const docId = url.pathname.replace('/docs/', '');
      
      const doc = CLAUDE_CODE_DOCS.find(d => d.id === docId);
      if (!doc) {
        throw new McpError(ErrorCode.InvalidRequest, `Unknown document: ${docId}`);
      }

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: 'text/plain',
            text: `# ${doc.title}\n\n${doc.content}${doc.url ? `\n\nSource: ${doc.url}` : ''}`,
          },
        ],
      };
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_claude_code_docs',
            description: 'Search through Claude Code documentation for specific information',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for Claude Code documentation',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_claude_code_capabilities',
            description: 'Get information about Claude Code capabilities and features',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'search_claude_code_docs': {
          const query = request.params.arguments?.query as string;
          if (!query) {
            throw new McpError(ErrorCode.InvalidParams, 'Query is required');
          }

          const results = CLAUDE_CODE_DOCS.filter(doc =>
            doc.title.toLowerCase().includes(query.toLowerCase()) ||
            doc.content.toLowerCase().includes(query.toLowerCase())
          );

          return {
            content: [
              {
                type: 'text',
                text: results.length > 0
                  ? `Found ${results.length} relevant sections:\n\n${results.map(doc => 
                      `## ${doc.title}\n${doc.content}${doc.url ? `\nSource: ${doc.url}` : ''}`
                    ).join('\n\n---\n\n')}`
                  : `No documentation found matching "${query}"`,
              },
            ],
          };
        }

        case 'get_claude_code_capabilities': {
          const capabilitiesDoc = CLAUDE_CODE_DOCS.find(doc => doc.id === 'overview');
          return {
            content: [
              {
                type: 'text',
                text: capabilitiesDoc?.content || 'Capabilities information not available',
              },
            ],
          };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Claude Code Documentation MCP server running on stdio');
  }
}

const server = new ClaudeCodeDocServer();
server.run().catch(console.error);
