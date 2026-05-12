#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTimeline } from "./timeline.js";

const FORMAT_ALIASES = {
  json: "json",
  markdown: "markdown",
  md: "markdown",
  mermaid: "mermaid_gantt",
  mermaid_gantt: "mermaid_gantt",
  gantt: "mermaid_gantt",
  mermaid_timeline: "mermaid_timeline",
  timeline: "mermaid_timeline",
  review: "review_report",
  review_report: "review_report"
};

export function parseCliArgs(argv = []) {
  const options = {
    inputPath: "-",
    sourceType: "text",
    format: "json"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--type" || arg === "--source-type") {
      options.sourceType = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === "--format") {
      options.format = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.inputPath = arg;
    }
  }

  if (options.inputPath !== "-" && options.sourceType === "text") {
    options.sourceType = inferSourceType(options.inputPath);
  }

  return options;
}

export function runTimelineCli({ argv = process.argv.slice(2), stdin, cwd = process.cwd() } = {}) {
  const options = parseCliArgs(argv);
  if (options.help) return usage();

  const content = options.inputPath === "-"
    ? stdin ?? readFileSync(0, "utf8")
    : readFileSync(resolve(cwd, options.inputPath), "utf8");
  const result = createTimeline({
    sources: [
      {
        id: options.inputPath === "-" ? "stdin" : basename(options.inputPath),
        type: options.sourceType,
        path: options.inputPath === "-" ? undefined : options.inputPath,
        content
      }
    ]
  });

  return formatCliResult(result, options.format);
}

export function formatCliResult(result, format = "json") {
  const normalizedFormat = normalizeFormat(format);
  if (normalizedFormat === "json") return JSON.stringify(result, null, 2);
  if (normalizedFormat === "markdown") return result.renders.markdown.trimEnd();
  if (normalizedFormat === "review_report") return result.renders.review_report.trimEnd();
  if (normalizedFormat === "mermaid_timeline") return result.renders.mermaid_timeline.trimEnd();
  return result.renders.mermaid_gantt.trimEnd();
}

function normalizeFormat(format) {
  const normalized = String(format || "json").toLowerCase();
  const mapped = FORMAT_ALIASES[normalized];
  if (!mapped) {
    throw new Error(`Unsupported format "${format}". Use json, markdown, mermaid_gantt, mermaid_timeline, or review.`);
  }
  return mapped;
}

function inferSourceType(inputPath) {
  const extension = extname(inputPath).toLowerCase();
  if (extension === ".md" || extension === ".markdown") return "markdown";
  if (extension === ".csv") return "csv";
  if (extension === ".json") return "json";
  return "text";
}

function requireValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

function usage() {
  return [
    "Usage: timeline-truth [file] [--type text|markdown|csv|json] [--format json|markdown|mermaid_gantt|mermaid_timeline|review]",
    "",
    "Reads stdin when no file is provided."
  ].join("\n");
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    process.stdout.write(`${runTimelineCli()}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
