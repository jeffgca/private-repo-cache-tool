import { type Mock, beforeEach, describe, expect, mock, test } from 'bun:test'
import { buildCli, type CliDeps } from '../index.ts'

type MockedDeps = { [K in keyof CliDeps]: Mock<CliDeps[K]> }

const deps: MockedDeps = {
	createGitHubClient: mock(() => ({ mocked: true }) as never),
	listPrivateRepos: mock(async () => []),
	listPrivateReposWithActions: mock(async () => []),
	disableActions: mock(async () => undefined),
	filterStaleRepos: mock((repos: unknown[]) => repos as never),
	disableStaleRepos: mock(async () => []),
	clearCachesForRepos: mock(async () => new Map<string, number>()),
}

beforeEach(() => {
	deps.createGitHubClient.mockReset()
	deps.createGitHubClient.mockImplementation(() => ({ mocked: true }) as never)
	deps.listPrivateRepos.mockReset()
	deps.listPrivateRepos.mockImplementation(async () => [])
	deps.listPrivateReposWithActions.mockReset()
	deps.listPrivateReposWithActions.mockImplementation(async () => [])
	deps.disableActions.mockReset()
	deps.disableActions.mockImplementation(async () => undefined)

	deps.filterStaleRepos.mockReset()
	deps.filterStaleRepos.mockImplementation((repos: unknown[]) => repos as never)
	deps.disableStaleRepos.mockReset()
	deps.disableStaleRepos.mockImplementation(async () => [])
	deps.clearCachesForRepos.mockReset()
	deps.clearCachesForRepos.mockImplementation(
		async () => new Map<string, number>(),
	)
})

describe('buildCli', () => {
	test('clear-cache --force-all targets stale private repos even when actions are disabled', async () => {
		const originalToken = process.env.GITHUB_TOKEN
		const originalUsername = process.env.GITHUB_USERNAME
		const originalLog = console.log
		console.log = mock(() => undefined)

		process.env.GITHUB_TOKEN = 'test-token'
		process.env.GITHUB_USERNAME = 'testuser'

		const repoWithActionsDisabled = {
			owner: 'testuser',
			name: 'stale-disabled',
			fullName: 'testuser/stale-disabled',
			actionsEnabled: false,
			lastCommitDate: new Date('2024-01-01T00:00:00.000Z'),
		}

		deps.listPrivateRepos.mockImplementation(async () => [
			repoWithActionsDisabled,
		])
		deps.filterStaleRepos.mockImplementation((repos) => repos as never)
		deps.clearCachesForRepos.mockImplementation(
			async () => new Map([[repoWithActionsDisabled.fullName, 3]]),
		)

		try {
			await buildCli(
				['clear-cache', '--force-all', '--days', '30'],
				deps,
			).parseAsync()

			expect(deps.listPrivateRepos).toHaveBeenCalledWith(
				{ mocked: true },
				'testuser',
			)
			expect(deps.listPrivateReposWithActions).not.toHaveBeenCalled()
			expect(deps.filterStaleRepos).toHaveBeenCalledWith(
				[repoWithActionsDisabled],
				30,
				{ requireActionsEnabled: false },
			)
			expect(deps.clearCachesForRepos).toHaveBeenCalledWith({ mocked: true }, [
				repoWithActionsDisabled,
			])
		} finally {
			console.log = originalLog
			if (originalToken === undefined) delete process.env.GITHUB_TOKEN
			else process.env.GITHUB_TOKEN = originalToken
			if (originalUsername === undefined) delete process.env.GITHUB_USERNAME
			else process.env.GITHUB_USERNAME = originalUsername
		}
	})
})
