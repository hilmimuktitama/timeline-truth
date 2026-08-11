import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { diffTimelines } from "../src/diff.js";
import { SCHEMA_VERSION, createTimeline } from "../src/timeline.js";

const failures = [];
const checks = [];
const notices = [];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function check(label, ok, detail = "") {
  checks.push({ label, ok, detail });
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

// 1. Version drift: package.json, MCP server, and engine schema must agree.
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
check(
  "package.json version is 0.3.0",
  packageJson.version === "0.3.0",
  `found ${packageJson.version}`
);
check(
  "engine SCHEMA_VERSION is 0.3.0",
  SCHEMA_VERSION === "0.3.0",
  `found ${SCHEMA_VERSION}`
);
const serverSource = readFileSync(resolve(repoRoot, "src/mcp-server.js"), "utf8");
const serverVersion = serverSource.match(/version:\s*"([^"]+)"/)?.[1];
check("mcp-server.js version is 0.3.0", serverVersion === "0.3.0", `found ${serverVersion}`);

// 2. Local schemas are always checked structurally and against runtime output.
//    Cross-repository byte checks are opt-in when a sibling is present, or
//    mandatory when TRUTH_TOOLS_SCHEMA_DIR is explicitly supplied.
const itemSchema = loadSchema("schemas/timeline-item.schema.json");
const sourceRefSchema = loadSchema("schemas/source-ref.schema.json");

check("timeline-item schema is a JSON Schema object", isSchemaObject(itemSchema));
check("source-ref schema is a JSON Schema object", isSchemaObject(sourceRefSchema));
check(
  "timeline-item schema declares object properties",
  itemSchema.type === "object" && isObject(itemSchema.properties)
);
check(
  "source-ref schema declares object properties",
  sourceRefSchema.type === "object" && isObject(sourceRefSchema.properties)
);

check(
  "timeline-item schema uses Draft 2020-12",
  itemSchema["$schema"] === "https://json-schema.org/draft/2020-12/schema",
  `found ${itemSchema["$schema"]}`
);
check(
  "source-ref schema uses Draft 2020-12",
  sourceRefSchema["$schema"] === "https://json-schema.org/draft/2020-12/schema",
  `found ${sourceRefSchema["$schema"]}`
);
check(
  "timeline-item schema references canonical source-ref $id",
  itemSchema.properties?.source_refs?.items?.$ref === "https://truth-tools.dev/schemas/source-ref.schema.json"
);
check(
  "source-ref schema requires source_id and locator",
  Array.isArray(sourceRefSchema.required) &&
    sourceRefSchema.required.includes("source_id") &&
    sourceRefSchema.required.includes("locator"),
  `found required ${JSON.stringify(sourceRefSchema.required)}`
);
check(
  "source-ref schema declares date-time formats",
  sourceRefSchema.properties?.observed_at?.format === "date-time" &&
  sourceRefSchema.properties?.source_updated_at?.format === "date-time"
);
checkSchemaContract("timeline-item", itemSchema, {
  id: "https://truth-tools.dev/schemas/timeline-item.schema.json",
  required: [
    "id", "title", "type", "status", "dependencies", "date_derivation",
    "evidence_grade", "evidence_reason", "exact_date_needed", "missing_title",
    "dangerous_fields", "source_refs"
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    type: { type: "string", enum: ["task", "milestone"] },
    start: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    end: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    duration: { type: "string", pattern: "^\\d+[dwmy]$" },
    time_window: { type: "string" },
    date_text: { type: "string" },
    exact_date_needed: { type: "boolean" },
    owner: { type: "string", minLength: 1 },
    status: { type: "string", minLength: 1 },
    dependencies: { type: "array", items: { type: "string" } },
    date_derivation: { type: "string", enum: ["explicit", "natural", "none"] },
    evidence_grade: { type: "string", enum: ["exact", "derived", "fuzzy", "missing"] },
    evidence_reason: { type: "string" },
    missing_title: { type: "boolean" },
    dangerous_fields: { type: "array", items: { type: "string" } },
    source_refs: { type: "array", items: { $ref: "https://truth-tools.dev/schemas/source-ref.schema.json" } }
  }
});
checkSchemaContract("source-ref", sourceRefSchema, {
  id: "https://truth-tools.dev/schemas/source-ref.schema.json",
  required: ["source_id", "locator"],
  properties: {
    source_id: { type: "string", minLength: 1 },
    locator: { type: "string", minLength: 1 },
    note: { type: "string", minLength: 1 },
    path: { type: ["string", "null"] },
    url: { type: ["string", "null"] },
    observed_at: { type: ["string", "null"], format: "date-time", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$" },
    source_updated_at: { type: ["string", "null"], format: "date-time", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$" },
    revision: { type: ["string", "number", "null"] },
    content_hash: { type: ["string", "null"], pattern: "^(?:sha256:)?[a-f0-9]{64}$" },
    heading: { type: "string", minLength: 1 },
    tableRow: { type: "integer", minimum: 1 },
    line: { type: "integer", minimum: 1 },
    text: { type: "string", minLength: 1 }
  }
});

const explicitSchemaDir = process.env.TRUTH_TOOLS_SCHEMA_DIR;
const siblingSchemaDir = resolve(repoRoot, "../truth-tools/packages/contracts/schemas");
if (explicitSchemaDir) {
  compareSchemaBytes(resolve(repoRoot, explicitSchemaDir), "explicit TRUTH_TOOLS_SCHEMA_DIR");
} else if (isDirectory(siblingSchemaDir)) {
  compareSchemaBytes(siblingSchemaDir, "local truth-tools sibling");
} else {
  notices.push(
    "SKIP - cross-repository schema bytes not checked (truth-tools sibling unavailable; Truth Tools CI remains authoritative)"
  );
}

// 3. Engine output must not drift from the schemas.
const fixtures = [
  ["examples/prd-snippet.md", "markdown"],
  ["examples/jira-export.csv", "csv"],
  ["examples/launch-checklist.md", "markdown"],
  ["examples/status-update.md", "markdown"]
];
for (const [path, type] of fixtures) {
  const result = createTimeline({
    sources: [{ id: path, type, content: readFileSync(resolve(repoRoot, path), "utf8") }]
  });
  for (const item of result.timeline.items) {
    const itemErrors = validateAgainstSchema(serialize(item), itemSchema);
    check(
      `item "${item.title}" conforms to timeline-item schema`,
      itemErrors.length === 0,
      itemErrors.join("; ")
    );
    for (const sourceRef of item.source_refs) {
      const refErrors = validateAgainstSchema(serialize(sourceRef), sourceRefSchema);
      check(
        `source_ref of "${item.title}" conforms to source-ref schema`,
        refErrors.length === 0,
        refErrors.join("; ")
      );
    }
  }
}

// 4. Diff output carries the same contract version.
const baseline = JSON.parse(readFileSync(resolve(repoRoot, "examples/baseline-plan.json"), "utf8"));
const current = JSON.parse(readFileSync(resolve(repoRoot, "examples/current-plan.json"), "utf8"));
const diff = diffTimelines(baseline, current);
check(
  "diff output schema_version is 0.3.0",
  diff.schema_version === "0.3.0",
  `found ${diff.schema_version}`
);
check(
  "diff never computes critical path",
  diff.critical_path?.computed === false,
  JSON.stringify(diff.critical_path)
);

// 5. Packaged file list covers contracts, evaluation, engine, and docs.
for (const required of ["src", "docs", "examples", "schemas", "evaluation"]) {
  check(
    `package.json files includes ${required}`,
    Array.isArray(packageJson.files) && packageJson.files.includes(required)
  );
}

console.log(`# Contract Verification (v${SCHEMA_VERSION})\n`);
for (const { label, ok } of checks) {
  console.log(`${ok ? "ok" : "FAIL"} - ${label}`);
}
console.log(`\n${checks.length - failures.length}/${checks.length} checks passed`);
for (const notice of notices) console.log(notice);

if (failures.length > 0) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

function loadSchema(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
  } catch (error) {
    check(`schema ${path} parses as JSON`, false, error.message);
    return {};
  }
  return parsed;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSchemaObject(value) {
  return isObject(value) && typeof value.$schema === "string" && typeof value.$id === "string";
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function checkSchemaContract(name, schema, expected) {
  check(
    `${name} schema $id is canonical`,
    schema.$id === expected.id,
    `found ${JSON.stringify(schema.$id)}`
  );
  check(`${name} schema rejects additional properties`, schema.additionalProperties === false);
  check(`${name} schema required fields are exact`, deepEqual(schema.required, expected.required), `found ${JSON.stringify(schema.required)}`);
  const actualNames = Object.keys(schema.properties || {}).sort();
  const expectedNames = Object.keys(expected.properties).sort();
  check(`${name} schema property names are exact`, deepEqual(actualNames, expectedNames), `found ${actualNames.join(", ")}`);
  for (const property of expectedNames) {
    const actual = schema.properties?.[property];
    const contract = expected.properties[property];
    check(`${name}.${property} schema definition exists`, isObject(actual));
    for (const keyword of ["type", "minLength", "minimum", "pattern", "enum", "const", "$ref", "format", "items"]) {
      if (contract[keyword] !== undefined) {
        check(`${name}.${property} ${keyword} is exact`, deepEqual(actual?.[keyword], contract[keyword]), `found ${JSON.stringify(actual?.[keyword])}`);
      }
    }
  }
}

function compareSchemaBytes(schemaDir, label) {
  for (const name of ["timeline-item.schema.json", "source-ref.schema.json"]) {
    const localPath = resolve(repoRoot, "schemas", name);
    const canonicalPath = resolve(schemaDir, name);
    let localBytes;
    let canonicalBytes;
    try {
      localBytes = readFileSync(localPath);
    } catch (error) {
      check(`${label} local ${name} is available`, false, error.message);
      continue;
    }
    try {
      canonicalBytes = readFileSync(canonicalPath);
    } catch (error) {
      check(`${label} ${name} is available`, false, error.message);
      continue;
    }
    check(
      `${name} matches ${label} byte-for-byte`,
      localBytes.equals(canonicalBytes)
    );
  }
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function serialize(value) {
  return JSON.parse(JSON.stringify(value));
}

// Minimal JSON Schema (Draft 2020-12 subset) validator: type, required,
// properties, items, enum, pattern, minimum, minLength, additionalProperties,
// and $ref. Deliberately small so contract verification has no runtime
// dependency beyond Node itself.
function validateAgainstSchema(value, schema, rootSchema = schema) {
  const errors = [];

  if (schema.$ref) {
    if (schema.$ref !== "https://truth-tools.dev/schemas/source-ref.schema.json") {
      return [`unsupported reference ${JSON.stringify(schema.$ref)}`];
    }
    const target = sourceRefSchema;
    return validateAgainstSchema(value, target, rootSchema);
  }

  if (schema.type) {
    const typeOk = matchesType(value, schema.type);
    if (!typeOk) {
      errors.push(`expected ${schema.type}, got ${value === null ? "null" : typeof value}`);
      return errors;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`expected one of ${schema.enum.join(", ")}, got ${JSON.stringify(value)}`);
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`expected constant ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }

  if (typeof value === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) {
    errors.push(`"${value}" does not match ${schema.pattern}`);
  }

  if (typeof value === "string" && schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(`"${value}" is shorter than minLength ${schema.minLength}`);
  }

  if (typeof value === "string" && schema.format === "date-time" &&
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    errors.push(`"${value}" is not a date-time`);
  }

  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${value} is below minimum ${schema.minimum}`);
  }

  if (Array.isArray(value)) {
    if (schema.items) {
      value.forEach((entry, index) => {
        for (const error of validateAgainstSchema(entry, schema.items, rootSchema)) {
          errors.push(`items[${index}]: ${error}`);
        }
      });
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required || []) {
      if (!(required in value)) errors.push(`missing required property "${required}"`);
    }
    for (const [key, propertySchema] of Object.entries(schema.properties || {})) {
      if (key in value) {
        for (const error of validateAgainstSchema(value[key], propertySchema, rootSchema)) {
          errors.push(`${key}: ${error}`);
        }
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(schema.properties || {})[key]) errors.push(`unexpected property "${key}"`);
      }
    }
  }

  return errors;
}

function matchesType(value, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => {
    switch (candidate) {
      case "string":
        return typeof value === "string";
      case "integer":
        return Number.isInteger(value);
      case "number":
        return typeof value === "number";
      case "boolean":
        return typeof value === "boolean";
      case "object":
        return value !== null && typeof value === "object" && !Array.isArray(value);
      case "array":
        return Array.isArray(value);
      case "null":
        return value === null;
      default:
        return true;
    }
  });
}
