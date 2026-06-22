# Contributing to RunCanon

Thanks for helping make RunCanon better. This guide covers how to set up the repo, run checks, and land changes.

## Quick links

- [README](./README.md) — project overview and usage
- [LICENSE](./LICENSE) — MIT
- [Changeset config](./.changeset/config.json)
- [Turbo config](./turbo.json)
- [Workspace config](./pnpm-workspace.yaml)

## Prerequisites

- **Node.js** `>=20.0.0`
- **pnpm** `>=9.0.0` (the repo pins `pnpm@9.1.0`; use `corepack` or install it manually)

```bash
node -v
pnpm -v
```

## Setup

```bash
pnpm install
pnpm run build
```

This installs workspace dependencies and builds all packages in dependency order via Turbo.

## Repository layout

RunCanon is a pnpm workspace monorepo:

```
apps/        # Applications (dashboard, platform server, etc.)
packages/    # Publishable libraries and tools
internal/    # Private repo tooling and shared config
scripts/     # One-off automation and demo scripts
```

Key packages:

| Package | Purpose |
|---|---|
| `@runcanon/spec` | Canonical skill schema, validation, harness transformers |
| `@runcanon/core` | Episode segmentation, clustering, skill generation, scoring |
| `@runcanon/cli` | Command-line interface |
| `@runcanon/mcp` | MCP server for agent integration |
| `@runcanon/dashboard` | SvelteKit dashboard |
| `@runcanon/platform` | Users, sessions, workspaces, provider secrets |

## Development workflow

### Run everything in dev mode

```bash
pnpm run dev
```

Turbo runs all `dev` tasks in parallel. Some packages are long-lived dev servers.

### Run a single package

```bash
pnpm --filter @runcanon/cli dev
pnpm --filter @runcanon/core test
```

### Available root scripts

```bash
pnpm run build          # Build all packages
pnpm run test           # Run all tests
pnpm run lint           # Lint all packages
pnpm run format         # Format all packages
pnpm run typecheck      # TypeScript project-wide check
pnpm run clean          # Clean build artifacts and node_modules
```

## Docker demo

The fastest way to run the full platform is the container demo:

```bash
chmod +x scripts/demo-docker.sh scripts/demo-exec.sh
./scripts/demo-docker.sh
```

Then open http://127.0.0.1:3000.

See [README > Local Docker demo](./README.md#local-docker-demo) for full details.

## Making changes

### Branching

1. Create a branch from `main`:
   ```bash
   git checkout -b feat/your-change-name
   ```
2. Make focused commits with clear messages.
3. Push and open a pull request against `main`.

### Code style

- TypeScript is used throughout the repo.
- ESLint is configured at the root via [eslint.config.js](./eslint.config.js).
- Prettier config is `@runcanon/prettier-config`.

Run before committing:

```bash
pnpm run lint
pnpm run format
pnpm run typecheck
pnpm run test
```

### Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to version and publish packages.

If your change affects any published package, add a changeset:

```bash
pnpm run changeset
```

Follow the prompts, then commit the generated `.changeset/*.md` file.

- Use `patch` for bug fixes and small changes.
- Use `minor` for new features.
- Use `major` for breaking API changes.

The root `@runcanon/root` package is ignored by Changesets.

### Adding a new package

1. Create a new directory under `packages/`, `apps/`, or `internal/`.
2. Add a `package.json` with the `@runcanon/*` scope and correct `private` flag.
3. Add workspace-local dependencies with `workspace:*`.
4. Add the new package to the relevant Turbo pipeline if it has `build`, `test`, `lint`, or `dev` tasks.
5. Run `pnpm install` and `pnpm run build`.

## Testing

```bash
pnpm run test
```

Run a single package's tests:

```bash
pnpm --filter @runcanon/core test
```

Add or update tests when changing skill generation, scoring, schema validation, or harness transformers.

## Releasing

Maintainers publish via:

```bash
pnpm run publish-packages
```

This runs `build`, `lint`, `test`, and then `changeset publish`. Do not run this from a contributor branch; releases are cut from `main`.

## Questions?

- Open an issue for bugs or feature requests.
- Keep changes focused and include context in the PR description.
- Follow the existing code style and commit conventions.

Thanks for contributing.
