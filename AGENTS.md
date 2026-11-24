# PowerSchool OpenCLI plugin

- `powerschool.js` registers the OpenCLI commands. `lib/portal.js` handles sign-in, session verification, and command results. `lib/inspect.js` contains browser-serialized DOM readers. `test/` uses only synthetic HTML and a browser test double.
- From the repository root, use `bun install --frozen-lockfile --ignore-scripts` and `bun test`, or `npm ci --ignore-scripts` and `npm run check`. Use `npm run build` for the JavaScript syntax check and `npm run format` for formatting. Install locally with `opencli plugin install "file://$PWD"`.
- Update `package-lock.json` first when dependencies change, then regenerate `bun.lock` with `bun pm migrate` in a directory without an existing Bun lock. See `README.md`.
- Runtime needs OpenCLI 2.0.3 or later, its connected Chrome profile, and `POWERSCHOOL_URL`. Keep `.env`, traces, credentials, and real school records out of Git. Do not hard-code district URLs or extract browser credentials.
- Follow grade-detail links surfaced by the portal. Do not construct unobserved requests or work around district closures. Confirm student identity on every page that contributes student data.
- Update `README.md` for command, configuration, and support changes. Distinguish fixture tests from live verification.
