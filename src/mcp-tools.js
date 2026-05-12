import { createTimeline, refineTimeline, renderTimeline, validateTimeline } from "./timeline.js";

const SOURCE_SCHEMA = {
  type: "object",
  required: ["content"],
  additionalProperties: true,
  properties: {
    id: { type: "string", description: "Stable source identifier used in source_refs." },
    path: { type: "string", description: "Optional file path to preserve in source_refs." },
    type: { type: "string", enum: ["text", "markdown", "csv", "json"], default: "text" },
    content: {
      description: "Pasted text/file content. JSON sources may pass a JSON string or object.",
      oneOf: [{ type: "string" }, { type: "object" }, { type: "array" }]
    }
  }
};

const TIMELINE_SCHEMA = {
  type: "object",
  required: ["items"],
  additionalProperties: true,
  properties: {
    items: { type: "array", items: { type: "object", additionalProperties: true } },
    milestones: { type: "array", items: { type: "object", additionalProperties: true } },
    assumptions: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "object", additionalProperties: true } },
    render: { type: "object", additionalProperties: true }
  }
};

export function listTimelineTools() {
  return [
    {
      name: "create_timeline",
      description:
        "Compile pasted project planning text, Markdown, CSV, or JSON into a normalized timeline with gaps, assumptions, and Mermaid renders.",
      inputSchema: {
        type: "object",
        required: ["sources"],
        additionalProperties: false,
        properties: {
          sources: {
            type: "array",
            minItems: 1,
            items: SOURCE_SCHEMA
          },
          markdown: {
            type: "object",
            additionalProperties: false,
            properties: {
              sections: {
                type: "array",
                items: { type: "string" },
                description:
                  "Markdown headings to parse. Defaults to Timeline, Milestones, Next, Risks And Blockers, and Follow-Ups."
              },
              ignoreFrontmatter: {
                type: "boolean",
                default: true,
                description: "Ignore YAML frontmatter before parsing Markdown content."
              }
            }
          }
        }
      }
    },
    {
      name: "validate_timeline",
      description:
        "Validate a normalized timeline for missing dates, missing owners, unknown dependencies, circular dependencies, and impossible sequencing.",
      inputSchema: {
        type: "object",
        required: ["timeline"],
        additionalProperties: false,
        properties: {
          timeline: TIMELINE_SCHEMA
        }
      }
    },
    {
      name: "render_timeline",
      description: "Render a normalized timeline as Mermaid Gantt, Mermaid timeline, compact Markdown, or a review report.",
      inputSchema: {
        type: "object",
        required: ["timeline"],
        additionalProperties: false,
        properties: {
          timeline: TIMELINE_SCHEMA,
          format: {
            type: "string",
            enum: ["mermaid_gantt", "mermaid_timeline", "markdown", "review_report"],
            default: "mermaid_gantt"
          }
        }
      }
    },
    {
      name: "refine_timeline",
      description:
        "Apply agent/user edits to an existing timeline while preserving source_refs and assumptions unless explicitly replaced.",
      inputSchema: {
        type: "object",
        required: ["timeline", "updates"],
        additionalProperties: false,
        properties: {
          timeline: TIMELINE_SCHEMA,
          updates: {
            type: "array",
            items: {
              type: "object",
              required: ["set"],
              additionalProperties: false,
              properties: {
                matchTitle: { type: "string" },
                matchId: { type: "string" },
                set: { type: "object", additionalProperties: true }
              }
            }
          }
        }
      }
    }
  ];
}

export function callTimelineTool(name, args = {}) {
  switch (name) {
    case "create_timeline":
      return jsonContent(createTimeline({ sources: args.sources, markdown: args.markdown }));
    case "validate_timeline":
      return jsonContent(validateTimeline(args.timeline));
    case "render_timeline":
      return textContent(renderTimeline(args.timeline, { format: args.format }));
    case "refine_timeline":
      return jsonContent(refineTimeline(args.timeline, { updates: args.updates }));
    default:
      throw new Error(`Unknown timeline tool: ${name}`);
  }
}

function jsonContent(value) {
  return textContent(JSON.stringify(value, null, 2));
}

function textContent(text) {
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}
