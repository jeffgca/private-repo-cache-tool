import packageJson from './package.json' assert { type: 'json' }
import yargs from 'yargs'
import type { Argv } from 'yargs'
import { hideBin } from 'yargs/helpers'
import {
	createGitHubClient as defaultCreateGitHubClient,
	listPrivateRepos as defaultListPrivateRepos,
	listPrivateReposWithActions as defaultListPrivateReposWithActions,
	disableActions as defaultDisableActions,
} from './lib/github.js'
import {
	filterStaleRepos as defaultFilterStaleRepos,
	disableStaleRepos as defaultDisableStaleRepos,
	clearCachesForRepos as defaultClearCachesForRepos,
	STALE_THRESHOLD_DAYS,
} from './lib/repos.js'

const version =
	typeof packageJson.version === 'string' ? packageJson.version : '0.0.0'

function getToken(): string {
	const token = process.env['GITHUB_TOKEN']
	if (!token) {
		console.error(
			'Error: GITHUB_TOKEN environment variable is not set.\n' +
				'Create a personal access token at https://github.com/settings/tokens\n' +
				'and export it as GITHUB_TOKEN or add it to a .env file.',
		)
		process.exit(1)
	}
	return token
}

function getUsername(): string {
	const username = process.env['GITHUB_USERNAME']
	if (!username) {
		console.error(
			'Error: GITHUB_USERNAME environment variable is not set.\n' +
				'Add GITHUB_USERNAME=<your-github-login> to your .env file.',
		)
		process.exit(1)
	}
	return username
}

function formatDate(date: Date | null): string {
	if (!date) return 'never'
	return date.toISOString().split('T')[0] ?? 'never'
}

export interface CliDeps {
	createGitHubClient: typeof defaultCreateGitHubClient
	listPrivateRepos: typeof defaultListPrivateRepos
	listPrivateReposWithActions: typeof defaultListPrivateReposWithActions
	disableActions: typeof defaultDisableActions
	filterStaleRepos: typeof defaultFilterStaleRepos
	disableStaleRepos: typeof defaultDisableStaleRepos
	clearCachesForRepos: typeof defaultClearCachesForRepos
}

const defaultCliDeps: CliDeps = {
	createGitHubClient: defaultCreateGitHubClient,
	listPrivateRepos: defaultListPrivateRepos,
	listPrivateReposWithActions: defaultListPrivateReposWithActions,
	disableActions: defaultDisableActions,
	filterStaleRepos: defaultFilterStaleRepos,
	disableStaleRepos: defaultDisableStaleRepos,
	clearCachesForRepos: defaultClearCachesForRepos,
}

export function buildCli(
	argv = hideBin(process.argv),
	deps: CliDeps = defaultCliDeps,
): Argv {
	return yargs(argv)
		.version(version)
		.alias('v', 'version')
		.scriptName(packageJson.appConfig?.appBaseName ?? 'index')
		.usage('$0 <command> [options]')
		.command(
			'list',
			'List all private repos that have Actions enabled, including the date of the last commit',
			(yargs) =>
				yargs.option('days', {
					alias: 'd',
					type: 'number',
					description: 'Highlight repos with no commits in the last N days',
					default: STALE_THRESHOLD_DAYS,
				}),
			async (argv) => {
				const octokit = deps.createGitHubClient(getToken())
				const username = getUsername()
				console.log('Fetching private repos with Actions enabled…')
				const repos = await deps.listPrivateReposWithActions(octokit, username)
				if (repos.length === 0) {
					console.log('No private repos with Actions enabled found.')
					return
				}
				const cutoff = new Date()
				cutoff.setDate(cutoff.getDate() - argv.days)
				console.log(
					`\n${'Repository'.padEnd(50)} ${'Last Commit'.padEnd(12)} ${'Stale?'}`,
				)
				console.log('-'.repeat(72))
				for (const repo of repos) {
					const stale =
						repo.lastCommitDate === null || repo.lastCommitDate < cutoff
					console.log(
						`${repo.fullName.padEnd(50)} ${formatDate(repo.lastCommitDate).padEnd(12)} ${stale ? '⚠ stale' : ''}`,
					)
				}
				console.log(`\nTotal: ${repos.length} repo(s) with Actions enabled.`)
			},
		)
		.command(
			'disable',
			`Disable Actions for private repos with no commits in the last N days (default: ${STALE_THRESHOLD_DAYS})`,
			(yargs) =>
				yargs.option('days', {
					alias: 'd',
					type: 'number',
					description: 'Disable repos with no commits in the last N days',
					default: STALE_THRESHOLD_DAYS,
				}),
			async (argv) => {
				const octokit = deps.createGitHubClient(getToken())
				const username = getUsername()
				console.log('Fetching private repos with Actions enabled…')
				const allRepos = await deps.listPrivateReposWithActions(
					octokit,
					username,
				)
				const stale = deps.filterStaleRepos(allRepos, argv.days)
				if (stale.length === 0) {
					console.log('No stale repos found — nothing to disable.')
					return
				}
				console.log(`Disabling Actions for ${stale.length} stale repo(s):`)
				for (const repo of stale) {
					process.stdout.write(`  ${repo.fullName}… `)
					await deps.disableActions(octokit, repo.owner, repo.name)
					console.log('✓ disabled')
				}
				console.log('\nDone.')
			},
		)
		.command(
			'clear-cache',
			`Delete all Actions caches for private repos with no commits in the last N days (default: ${STALE_THRESHOLD_DAYS})`,
			(yargs) =>
				yargs
					.option('days', {
						alias: 'd',
						type: 'number',
						description: 'Target repos with no commits in the last N days',
						default: STALE_THRESHOLD_DAYS,
					})
					.option('force-all', {
						type: 'boolean',
						description:
							'Clear caches for all stale private repos, even if Actions are currently disabled',
						default: false,
					}),
			async (argv) => {
				const octokit = deps.createGitHubClient(getToken())
				const username = getUsername()
				console.log(
					argv.forceAll
						? 'Fetching all private repos…'
						: 'Fetching private repos with Actions enabled…',
				)
				const allRepos = argv.forceAll
					? await deps.listPrivateRepos(octokit, username)
					: await deps.listPrivateReposWithActions(octokit, username)
				const stale = deps.filterStaleRepos(allRepos, argv.days, {
					requireActionsEnabled: !argv.forceAll,
				})
				if (stale.length === 0) {
					console.log('No stale repos found — nothing to clear.')
					return
				}
				console.log(`Clearing caches for ${stale.length} stale repo(s):`)
				const results = await deps.clearCachesForRepos(octokit, stale)
				for (const [name, count] of results) {
					console.log(`  ${name}: ${count} cache(s) deleted`)
				}
				console.log('\nDone.')
			},
		)
		.command(
			'cleanup',
			`Disable Actions AND clear caches for stale private repos (no commits in last N days, default: ${STALE_THRESHOLD_DAYS})`,
			(yargs) =>
				yargs.option('days', {
					alias: 'd',
					type: 'number',
					description: 'Target repos with no commits in the last N days',
					default: STALE_THRESHOLD_DAYS,
				}),
			async (argv) => {
				const octokit = deps.createGitHubClient(getToken())
				const username = getUsername()
				console.log('Fetching private repos with Actions enabled…')
				const stale = await deps.disableStaleRepos(octokit, username, argv.days)
				if (stale.length === 0) {
					console.log('No stale repos found — nothing to do.')
					return
				}
				console.log(`Disabled Actions for ${stale.length} repo(s).`)
				console.log('Clearing caches…')
				const results = await deps.clearCachesForRepos(octokit, stale)
				for (const [name, count] of results) {
					console.log(`  ${name}: ${count} cache(s) deleted`)
				}
				console.log('\nDone.')
			},
		)
		.demandCommand(1, 'Please specify a command. Run with --help for usage.')
		.strict()
		.help()
}

if (import.meta.main) {
	buildCli().parse()
}
