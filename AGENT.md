# Una Agent Handoff

Load `SKILL.md` for assistant behavior. Use existing `una_*` tools when the
optional local adapter is configured. Otherwise follow the skill's hosted
endpoint contract directly or install the SDK helper.

Use `README.md` only when configuring the trusted runtime or integrating
`UnaConnectionKit` directly. Never place the Una bearer token, private JWK,
unwrapped key, or decrypted household content in prompts, logs, screenshots, or
analytics.
