# OSH AI Hub

- Read README.md and docs before changes.
- Use TypeScript in web/; Python AI services belong in ai-api/.
- Keep existing osh.ai.kr processes, ports and proxy configuration intact during development.
- All displayed sample content must be explicitly marked DEMO; never invent operational metrics or model performance.
- Google is the only initial login provider. Never simulate successful authentication or issue pretend working API credentials.
- Keep secrets out of source, logs and client bundles. Never commit .env files.
- Use migrations for database changes and enforce RLS. Never let profile edits grant roles.
- Large files transfer directly through object storage; never proxy them through web functions.
- Verify changes with lint, typecheck, tests and build. Test security boundaries, not just happy paths.
- Document external configuration and unverified behavior honestly.
