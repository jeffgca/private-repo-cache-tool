import packageJson from './package.json' assert { type: 'json' }
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import {
	createGitHubClient,
	listPrivateReposWithActions,
	disableActions,
} from './lib/github.js'
import {
	filterStaleRepos,
	disableStaleRepos,
	clearCachesForRepos,
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
				'and export it as GITHUB_TOKEN or add it to a .env file.'
		)
		process.exit(1)
	}
	return token
}

function formatDate(date: Date | null): string {
	if (!date) return 'never'
	return date.toISOString().split('T')[0] ?? 'never'
}

yargs(hideBin(process.argv))
	.version(version)
	.alias('v', 'version')
	.scriptName('clowncar')
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
			const octokit = createGitHubClient(getToken())
			console.log('Fetching private repos with Actions enabled…')
			const repos = await listPrivateReposWithActions(octokit)
			if (repos.length === 0) {
				console.log('No private repos with Actions enabled found.')
				return
			}
			const cutoff = new Date()
			cutoff.setDate(cutoff.getDate() - argv.days)
			console.log(
				`\n${'Repository'.padEnd(50)} ${'Last Commit'.padEnd(12)} ${'Stale?'}`
			)
			console.log('-'.repeat(72))
			for (const repo of repos) {
				const stale =
					repo.lastCommitDate === null || repo.lastCommitDate < cutoff
				console.log(
					`${repo.fullName.padEnd(50)} ${formatDate(repo.lastCommitDate).padEnd(12)} ${stale ? '⚠ stale' : ''}`
				)
			}
			console.log(
				`\nTotal: ${repos.length} repo(s) with Actions enabled.`
			)
		}
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
			const octokit = createGitHubClient(getToken())
			console.log('Fetching private repos with Actions enabled…')
			const allRepos = await listPrivateReposWithActions(octokit)
			const stale = filterStaleRepos(allRepos, argv.days)
			if (stale.length === 0) {
				console.log('No stale repos found — nothing to disable.')
				return
			}
			console.log(`Disabling Actions for ${stale.length} stale repo(s):`)
			for (const repo of stale) {
				process.stdout.write(`  ${repo.fullName}… `)
				await disableActions(octokit, repo.owner, repo.name)
				console.log('✓ disabled')
			}
			console.log('\nDone.')
		}
	)
	.command(
		'clear-cache',
		`Delete all Actions caches for private repos with no commits in the last N days (default: ${STALE_THRESHOLD_DAYS})`,
		(yargs) =>
			yargs.option('days', {
				alias: 'd',
				type: 'number',
				description: 'Target repos with no commits in the last N days',
				default: STALE_THRESHOLD_DAYS,
			}),
		async (argv) => {
			const octokit = createGitHubClient(getToken())
			console.log('Fetching private repos with Actions enabled…')
			const allRepos = await listPrivateReposWithActions(octokit)
			const stale = filterStaleRepos(allRepos, argv.days)
			if (stale.length === 0) {
				console.log('No stale repos found — nothing to clear.')
				return
			}
			console.log(`Clearing caches for ${stale.length} stale repo(s):`)
			const results = await clearCachesForRepos(octokit, stale)
			for (const [name, count] of results) {
				console.log(`  ${name}: ${count} cache(s) deleted`)
			}
			console.log('\nDone.')
		}
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
			const octokit = createGitHubClient(getToken())
			console.log('Fetching private repos with Actions enabled…')
			const stale = await disableStaleRepos(octokit, argv.days)
			if (stale.length === 0) {
				console.log('No stale repos found — nothing to do.')
				return
			}
			console.log(`Disabled Actions for ${stale.length} repo(s).`)
			console.log('Clearing caches…')
			const results = await clearCachesForRepos(octokit, stale)
			for (const [name, count] of results) {
				console.log(`  ${name}: ${count} cache(s) deleted`)
			}
			console.log('\nDone.')
		}
	)
	.demandCommand(1, 'Please specify a command. Run with --help for usage.')
	.strict()
	.help()
	.parse()
