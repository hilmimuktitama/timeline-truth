# Security Policy

Timeline Truth is a local MCP server. It is designed to process planning
content provided by the user or by an MCP client.

## Supported Versions

Security fixes target the latest version on the default branch.

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
