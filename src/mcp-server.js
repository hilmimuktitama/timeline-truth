#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { callTimelineTool, listTimelineTools } from "./mcp-tools.js";

const server = new Server(
  {
    name: "timeline-truth",
    version: "0.3.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listTimelineTools()
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return callTimelineTool(request.params.name, request.params.arguments ?? {});
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }
});

await server.connect(new StdioServerTransport());
