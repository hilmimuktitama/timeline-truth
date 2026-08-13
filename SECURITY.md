# Security Policy

Timeline Truth is a local MCP server and CLI. It is designed to process
planning content provided by the user or by an MCP client.

## Supported Versions

Security fixes target the latest version on the default branch. The current
supported release line is 0.4.x.

## Reporting A Vulnerability

Please report security issues privately to the repository maintainer. If the
project is hosted publicly, use the repository security advisory feature when
available.

Include:

- affected version or commit
- reproduction steps
- expected and actual behavior
- potential impact

## Security Expectations

- Do not add network calls unless the feature requires them and the behavior is
  documented.
- Do not execute user-provided planning content as code.
- Do not infer, store, or transmit credentials from source material.
- Treat source text as untrusted input.
- Raw source text is sensitive. Canonical SourceRef output is always locator-only;
  legacy `SourceRef.text` and `source_excerpt` inputs are stripped with a generic
  deprecation warning.
  Credential-bearing URLs are omitted from source paths, locators, and URL fields.
  `source_id` is caller-supplied and source-local. Source references
  are opaque external pointers: output provides no source manifest, existence
  verification, or semantic verification.
- JSON timeline items are scanned for unsupported dangerous fields
  (`__proto__`, `prototype`, `constructor`, `eval`, `exec`, `command`, `shell`,
  `script`, `spawn`, `require`, `import`, `fetch`, `child_process`, `os`);
  matching fields are dropped and reported as `unsupported_dangerous_field`
  issues. Never loosen this denylist without a security review.
- Prototype-pollution vectors must be rejected or neutralized at parse time,
  before any item field is read.
- The package publishes with npm provenance and has no runtime dependency
  beyond the MCP SDK.
