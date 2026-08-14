# Security Policy

## Supported configuration

Production deployments require Neon Postgres (`DATABASE_URL`) and Google OAuth. Do not deploy with local JSON persistence, wildcard CORS, development cookies, or public outbound calling enabled.

Keep all credentials in deployment secrets. Never commit `.env`, database URLs, OAuth client secrets, Twilio credentials, or provider API keys.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the project maintainers. Include reproduction steps, impact, and any relevant logs with secrets removed. Do not open a public issue for an active security issue.
