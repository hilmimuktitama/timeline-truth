#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { diffTimelines, renderDiffMarkdown } from "./diff.js";
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

const DIFF_FORMATS = new Set(["json", "markdown", "md"]);

export function parseCliArgs(argv = []) {
  if (argv[0] === "diff") {
    return parseDiffArgs(argv.slice(1));
  }
  return parseCompileArgs(argv);
}

export function runTimelineCli({ argv = process.argv.slice(2), stdin, cwd = process.cwd() } = {}) {
  const options = parseCliArgs(argv);
  if (options.help) return usage();

  if (options.command === "diff") {
    const baseline = readTimelineFile(cwd, options.baselinePath);
    const current = readTimelineFile(cwd, options.currentPath);
    const diff = diffTimelines(baseline, current, {
      baselineLabel: options.baselinePath,
      currentLabel: options.currentPath
    });
    return options.format === "json" ? JSON.stringify(diff, null, 2) : renderDiffMarkdown(diff).trimEnd();
  }

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

function parseCompileArgs(argv) {
  const options = {
    command: "compile",
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

function parseDiffArgs(argv) {
  const options = {
    command: "diff",
    baselinePath: undefined,
    currentPath: undefined,
    format: "markdown"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--format") {
      const value = requireValue(argv, index, arg);
      const normalized = String(value).toLowerCase();
      if (!DIFF_FORMATS.has(normalized)) {
        throw new Error(`Unsupported diff format "${value}". Use json or markdown.`);
      }
      options.format = normalized === "md" ? "markdown" : normalized;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!options.baselinePath) {
      options.baselinePath = arg;
    } else if (!options.currentPath) {
      options.currentPath = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!options.baselinePath || !options.currentPath) {
    throw new Error("diff requires baseline and current timeline file paths.");
  }

  return options;
}

function readTimelineFile(cwd, path) {
  const content = readFileSync(resolve(cwd, path), "utf8");
  try {
    return JSON.parse(content);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse timeline file "${path}" as JSON: ${detail}`);
  }
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
    "       timeline-truth diff <baseline.json> <current.json> [--format markdown|json]",
    "",
    "Reads stdin when no file is provided.",
    "",
    "Critical path is never computed: it cannot be determined defensibly with incomplete data."
  ].join("\n");
}

function isDirectRun() {
  if (!process.argv[1]) return false;

  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  try {
    process.stdout.write(`${runTimelineCli()}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
