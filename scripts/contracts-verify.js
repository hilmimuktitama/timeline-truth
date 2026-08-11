import { readFileSync } from "node:fs";

import { diffTimelines } from "../src/diff.js";
import { SCHEMA_VERSION, createTimeline } from "../src/timeline.js";

const failures = [];
const checks = [];

function check(label, ok, detail = "") {
  checks.push({ label, ok, detail });
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

// 1. Version drift: package.json, MCP server, and engine schema must agree.
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
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
const serverSource = readFileSync("src/mcp-server.js", "utf8");
const serverVersion = serverSource.match(/version:\s*"([^"]+)"/)?.[1];
check("mcp-server.js version is 0.3.0", serverVersion === "0.3.0", `found ${serverVersion}`);

// 2. Schemas are exact canonical copies (truth-tools contracts) and follow
//    Draft 2020-12; drift from the canonical siblings is a hard failure.
const itemSchema = loadSchema("schemas/timeline-item.schema.json");
const sourceRefSchema = loadSchema("schemas/source-ref.schema.json");

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
  itemSchema.properties.source_refs?.items?.$ref === "https://truth-tools.dev/schemas/source-ref.schema.json"
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
  sourceRefSchema.properties.observed_at?.format === "date-time" &&
    sourceRefSchema.properties.source_updated_at?.format === "date-time"
);

const canonicalItemSchema = loadCanonicalSchema("timeline-item.schema.json");
const canonicalSourceRefSchema = loadCanonicalSchema("source-ref.schema.json");
const canonicalItemSchemaBytes = loadCanonicalSchemaBytes("timeline-item.schema.json");
const canonicalSourceRefSchemaBytes = loadCanonicalSchemaBytes("source-ref.schema.json");
check(
  "timeline-item schema matches canonical sibling byte-for-byte",
  canonicalItemSchemaBytes !== null &&
    Buffer.from(readFileSync("schemas/timeline-item.schema.json")).equals(canonicalItemSchemaBytes)
);
check(
  "source-ref schema matches canonical sibling byte-for-byte",
  canonicalSourceRefSchemaBytes !== null &&
    Buffer.from(readFileSync("schemas/source-ref.schema.json")).equals(canonicalSourceRefSchemaBytes)
);

// 3. Engine output must not drift from the schemas.
const fixtures = [
  ["examples/prd-snippet.md", "markdown"],
  ["examples/jira-export.csv", "csv"],
  ["examples/launch-checklist.md", "markdown"],
  ["examples/status-update.md", "markdown"]
];
for (const [path, type] of fixtures) {
  const result = createTimeline({
    sources: [{ id: path, type, content: readFileSync(path, "utf8") }]
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
const baseline = JSON.parse(readFileSync("examples/baseline-plan.json", "utf8"));
const current = JSON.parse(readFileSync("examples/current-plan.json", "utf8"));
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

if (failures.length > 0) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

function loadSchema(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    check(`schema ${path} parses as JSON`, false, error.message);
    return {};
  }
  return parsed;
}

// Loads the canonical sibling from the truth-tools contracts package. A read
// failure is surfaced as a failed drift check, not a crash.
function loadCanonicalSchema(name) {
  const path = `../truth-tools/packages/contracts/schemas/${name}`;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { _unreadable: error.message };
  }
}

function loadCanonicalSchemaBytes(name) {
  const path = `../truth-tools/packages/contracts/schemas/${name}`;
  try {
    return readFileSync(path);
  } catch {
    return null;
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
    const target =
      typeof schema.$ref === "string" && schema.$ref.endsWith("source-ref.schema.json")
        ? sourceRefSchema
        : rootSchema;
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

  if (typeof value === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) {
    errors.push(`"${value}" does not match ${schema.pattern}`);
  }

  if (typeof value === "string" && schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(`"${value}" is shorter than minLength ${schema.minLength}`);
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
