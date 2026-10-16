# Security Policy

## Supported versions

Security fixes go to the latest 1.x release and the `v1` tag.

## Reporting a vulnerability

Please do not open a public issue. Report it privately from the
[Security tab](https://github.com/Mohamed-Almarag/locale-guard/security/advisories/new)
with "Report a vulnerability".

Include what an attacker can do, the steps to reproduce it, and the version or
commit you tested. I will reply as soon as I can and keep you updated until it
is fixed.

## Scope

In scope:

- Locale Guard using its token beyond what it needs: reading the base branch's
  locale files and writing one pull request comment.
- A pull request from a fork getting Locale Guard to write, or to expose the
  token or secrets.
- Locale file content that makes Locale Guard run code or break the comment's
  Markdown in a harmful way.

Out of scope:

- A workflow that uses `pull_request_target` and checks out the pull request's
  code. That is a risk in the workflow, not in Locale Guard. See
  [Forks and security](README.md#forks-and-security).
