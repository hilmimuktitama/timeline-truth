import { diffTimelines, renderDiffMarkdown } from "./diff.js";
import { createTimeline, refineTimeline, renderTimeline, validateTimeline } from "./timeline.js";

const SOURCE_SCHEMA = {
  type: "object",
  required: ["content"],
  additionalProperties: true,
  properties: {
    id: { type: "string", description: "Stable source identifier; becomes the source_id of every canonical SourceRef." },
    path: { type: "string", description: "Optional file path; becomes the base of each derived SourceRef locator." },
    type: { type: "string", enum: ["text", "markdown", "csv", "json"], default: "text" },
    profile: { type: "string", description: "Optional Markdown profile: estimate_table, objective_table, progress_table." },
    source_system: { type: "string", description: "Optional system of record (for example jira, confluence)." },
    include_source_text: {
      type: "boolean",
      default: false,
      description: "Legacy compatibility input. Canonical MCP output is always locator-only."
    },
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
        "Compile pasted project planning text, Markdown, CSV, or JSON into a normalized timeline with evidence grades, gaps, assumptions, and Mermaid renders.",
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
          include_source_text: {
            type: "boolean",
            default: false,
             description: "Legacy compatibility input. Canonical MCP output is always locator-only."
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
        "Validate a normalized timeline for missing dates, missing owners, unknown dependencies, cycles, impossible sequencing, invalid calendar dates, timezone-free datetimes, malformed durations, duplicate ids/dependencies, missing titles, and unsupported dangerous fields.",
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
        "Apply agent/user edits to an existing timeline while preserving source_refs and assumptions unless explicitly replaced. Each update requires matchTitle or matchId and a set object; an update that matches no item or lacks a set throws an error. The evidence grade is always recomputed from the edited evidence and cannot be overridden.",
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
              anyOf: [{ required: ["matchTitle"] }, { required: ["matchId"] }],
              additionalProperties: false,
              properties: {
                matchTitle: { type: "string", description: "Title of the item to refine." },
                matchId: { type: "string", description: "Id of the item to refine." },
                set: { type: "object", additionalProperties: true }
              }
            }
          }
        }
      }
    },
    {
      name: "diff_timelines",
      description:
        "Compare a baseline timeline against a current timeline and report scope, schedule, owner, dependency, status, and evidence-grade changes plus new impossible sequencing. Critical path is never computed.",
      inputSchema: {
        type: "object",
        required: ["baseline", "current"],
        additionalProperties: false,
        properties: {
          baseline: TIMELINE_SCHEMA,
          current: TIMELINE_SCHEMA,
          format: {
            type: "string",
            enum: ["json", "markdown"],
            default: "json"
          }
        }
      }
    }
  ];
}

export function callTimelineTool(name, args = {}) {
  switch (name) {
    case "create_timeline":
      return jsonContent(createTimeline({
        sources: args.sources,
        markdown: args.markdown,
        include_source_text: args.include_source_text ?? false
      }));
    case "validate_timeline":
      return jsonContent(validateTimeline(args.timeline));
    case "render_timeline":
      return textContent(renderTimeline(args.timeline, { format: args.format }));
    case "refine_timeline":
      return jsonContent(refineTimeline(args.timeline, { updates: args.updates }));
    case "diff_timelines": {
      const diff = diffTimelines(args.baseline, args.current);
      return args.format === "markdown"
        ? textContent(renderDiffMarkdown(diff).trimEnd())
        : jsonContent(diff);
    }
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
