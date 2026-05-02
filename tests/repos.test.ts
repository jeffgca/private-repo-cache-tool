import { expect, mock, test, describe } from 'bun:test'
import {
	filterStaleRepos,
	STALE_THRESHOLD_DAYS,
	listArtifactsForRepos,
	deleteArtifactsForRepos,
	deleteLogsForRepos,
} from '../lib/repos'
import type { Repo } from '../lib/github'

// Helper to build a Repo fixture
function makeRepo(partial: Partial<Repo> & { name: string }): Repo {
	return {
		owner: 'testuser',
		fullName: `testuser/${partial.name}`,
		actionsEnabled: true,
		lastCommitDate: null,
		...partial,
	}
}

function daysAgo(n: number): Date {
	const d = new Date()
	d.setDate(d.getDate() - n)
	return d
}

describe('filterStaleRepos', () => {
	test('returns repos with no commits (null date) that have actions enabled', () => {
		const repos: Repo[] = [
			makeRepo({ name: 'empty-repo', lastCommitDate: null }),
		]
		const stale = filterStaleRepos(repos, STALE_THRESHOLD_DAYS)
		expect(stale).toHaveLength(1)
		expect(stale[0]?.name).toBe('empty-repo')
	})

	test('returns repos whose last commit is older than the threshold', () => {
		const repos: Repo[] = [
			makeRepo({ name: 'old-repo', lastCommitDate: daysAgo(60) }),
		]
		const stale = filterStaleRepos(repos, STALE_THRESHOLD_DAYS)
		expect(stale).toHaveLength(1)
	})

	test('does not return repos with recent commits', () => {
		const repos: Repo[] = [
			makeRepo({ name: 'active-repo', lastCommitDate: daysAgo(5) }),
		]
		const stale = filterStaleRepos(repos, STALE_THRESHOLD_DAYS)
		expect(stale).toHaveLength(0)
	})

	test('does not return repos where actions are disabled', () => {
		const repos: Repo[] = [
			makeRepo({
				name: 'actions-off-repo',
				actionsEnabled: false,
				lastCommitDate: daysAgo(60),
			}),
		]
		const stale = filterStaleRepos(repos, STALE_THRESHOLD_DAYS)
		expect(stale).toHaveLength(0)
	})

	test('includes repos with actions disabled when requireActionsEnabled is false', () => {
		const repos: Repo[] = [
			makeRepo({
				name: 'actions-off-repo',
				actionsEnabled: false,
				lastCommitDate: daysAgo(60),
			}),
		]
		const stale = filterStaleRepos(repos, STALE_THRESHOLD_DAYS, {
			requireActionsEnabled: false,
		})
		expect(stale).toHaveLength(1)
		expect(stale[0]?.name).toBe('actions-off-repo')
	})

	test('respects a custom threshold', () => {
		const repos: Repo[] = [
			makeRepo({ name: 'borderline-repo', lastCommitDate: daysAgo(10) }),
		]
		// With a 5-day threshold the 10-day-old repo is stale
		expect(filterStaleRepos(repos, 5)).toHaveLength(1)
		// With a 30-day threshold it is not
		expect(filterStaleRepos(repos, 30)).toHaveLength(0)
	})

	test('handles mixed repos correctly', () => {
		const repos: Repo[] = [
			makeRepo({ name: 'active', lastCommitDate: daysAgo(2) }),
			makeRepo({ name: 'stale', lastCommitDate: daysAgo(90) }),
			makeRepo({ name: 'never-committed', lastCommitDate: null }),
			makeRepo({
				name: 'disabled',
				actionsEnabled: false,
				lastCommitDate: daysAgo(90),
			}),
		]
		const stale = filterStaleRepos(repos, STALE_THRESHOLD_DAYS)
		expect(stale).toHaveLength(2)
		const names = stale.map((r) => r.name)
		expect(names).toContain('stale')
		expect(names).toContain('never-committed')
	})

	test('returns empty array when given empty input', () => {
		expect(filterStaleRepos([], STALE_THRESHOLD_DAYS)).toEqual([])
	})
})

describe('listArtifactsForRepos', () => {
	test('returns a map from fullName to artifact list', async () => {
		const repos: Repo[] = [
			{ owner: 'u', name: 'r', fullName: 'u/r', actionsEnabled: true, lastCommitDate: null },
		]
		const octokitStub = {
			rest: {
				actions: {
					listArtifactsForRepo: mock(async () => ({
						data: { artifacts: [{ id: 1, name: 'build', size_in_bytes: 100, created_at: '2024-01-01T00:00:00Z', expires_at: null, expired: false }] },
					})),
				},
			},
		} as never
		const result = await listArtifactsForRepos(octokitStub, repos)
		expect(result.get('u/r')).toHaveLength(1)
		expect(result.get('u/r')?.[0]?.name).toBe('build')
	})

	test('returns empty lists for repos with no artifacts', async () => {
		const octokitStub = {
			rest: {
				actions: {
					listArtifactsForRepo: mock(async () => ({ data: { artifacts: [] } })),
				},
			},
		} as never
		const repos: Repo[] = [
			{ owner: 'u', name: 'r', fullName: 'u/r', actionsEnabled: true, lastCommitDate: null },
		]
		const result = await listArtifactsForRepos(octokitStub, repos)
		expect(result.get('u/r')).toHaveLength(0)
	})
})

describe('deleteArtifactsForRepos', () => {
	test('returns a map of deleted artifact counts', async () => {
		const deleteFn = mock(async () => ({}))
		const octokitStub = {
			rest: {
				actions: {
					listArtifactsForRepo: mock(async () => ({
						data: {
							artifacts: [
								{ id: 10, name: 'a', size_in_bytes: 0, created_at: null, expires_at: null, expired: false },
								{ id: 11, name: 'b', size_in_bytes: 0, created_at: null, expires_at: null, expired: false },
							],
						},
					})),
					deleteArtifact: deleteFn,
				},
			},
		} as never
		const repos: Repo[] = [
			{ owner: 'u', name: 'r', fullName: 'u/r', actionsEnabled: true, lastCommitDate: null },
		]
		const result = await deleteArtifactsForRepos(octokitStub, repos)
		expect(result.get('u/r')).toBe(2)
		expect(deleteFn).toHaveBeenCalledTimes(2)
	})
})

describe('deleteLogsForRepos', () => {
	test('returns a map of deleted log counts', async () => {
		const deleteLogsFn = mock(async () => ({}))
		const octokitStub = {
			rest: {
				actions: {
					listWorkflowRunsForRepo: mock(async () => ({
						data: {
							workflow_runs: [
								{ id: 1, name: 'CI', status: 'completed', conclusion: 'success', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:01:00Z' },
							],
						},
					})),
					deleteWorkflowRunLogs: deleteLogsFn,
				},
			},
		} as never
		const repos: Repo[] = [
			{ owner: 'u', name: 'r', fullName: 'u/r', actionsEnabled: true, lastCommitDate: null },
		]
		const result = await deleteLogsForRepos(octokitStub, repos)
		expect(result.get('u/r')).toBe(1)
		expect(deleteLogsFn).toHaveBeenCalledTimes(1)
	})
})
