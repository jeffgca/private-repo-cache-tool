# private-repo-cache-tool

A CLI tool to audit and clean up GitHub Actions on your private repositories.

It can:

1. **Authenticate** securely using a GitHub personal access token
2. **List** all private repos that have Actions enabled, including the date of the last commit
3. **Disable** Actions for repos with no commits in the last month (configurable)
4. **Clear** cached Actions data for stale repos

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- A GitHub [personal access token](https://github.com/settings/tokens) with the **`repo`** scope

## Setup

```bash
# Install dependencies
bun install

# Copy the example env file and add your token
cp .env.example .env
# Edit .env and set GITHUB_TOKEN=<your_token>
```

## Usage

```bash
# List all private repos with Actions enabled (marks stale repos)
bun run index.ts list

# List with a custom staleness threshold (e.g. 14 days)
bun run index.ts list --days 14

# Disable Actions on repos with no commits in the last 30 days
bun run index.ts disable

# Clear Actions caches on stale repos
bun run index.ts clear-cache

# Clear Actions caches on all stale private repos, even if Actions is disabled
bun run index.ts clear-cache --force-all

# Do both: disable Actions AND clear caches in one step
bun run index.ts cleanup

# All commands accept --days / -d to override the 30-day default
bun run index.ts cleanup --days 60
```

## Run tests

```bash
bun test
```

## Compile to a standalone binary

```bash
bun cc
```

The binaries are written to `./dist/`.

## Creating a new repo from this template

```bash
gh repo create $PROJECT_NAME --template jeffgca/bun-tpl --private --clone
```
