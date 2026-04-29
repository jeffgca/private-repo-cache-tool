import { expect, test, describe } from 'bun:test'
import { filterStaleRepos, STALE_THRESHOLD_DAYS } from '../lib/repos'
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
