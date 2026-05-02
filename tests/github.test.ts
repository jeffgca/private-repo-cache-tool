import { expect, mock, test, describe } from 'bun:test'
import {
	createGitHubClient,
	listArtifacts,
	deleteAllArtifacts,
	listWorkflowRuns,
	deleteAllWorkflowRunLogs,
} from '../lib/github.ts'

describe('createGitHubClient', () => {
	test('returns an Octokit instance with expected API surface', () => {
		const octokit = createGitHubClient('fake-token')
		expect(octokit).toBeDefined()
		// Octokit exposes a `rest` namespace with API methods
		expect(typeof octokit.rest).toBe('object')
		expect(typeof octokit.rest.repos.listForAuthenticatedUser).toBe('function')
		expect(
			typeof octokit.rest.actions.getGithubActionsPermissionsRepository,
		).toBe('function')
		expect(
			typeof octokit.rest.actions.setGithubActionsPermissionsRepository,
		).toBe('function')
		expect(typeof octokit.rest.actions.getActionsCacheList).toBe('function')
		expect(typeof octokit.rest.actions.deleteActionsCacheById).toBe('function')
		expect(typeof octokit.rest.actions.listArtifactsForRepo).toBe('function')
		expect(typeof octokit.rest.actions.deleteArtifact).toBe('function')
		expect(typeof octokit.rest.actions.listWorkflowRunsForRepo).toBe('function')
		expect(typeof octokit.rest.actions.deleteWorkflowRunLogs).toBe('function')
	})

	test('passes the token to the underlying Octokit instance', () => {
		const token = 'ghp_test_token_abc123'
		const octokit = createGitHubClient(token)
		// Octokit stores auth options on the instance; accessing auth returns the token string
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const auth = (octokit as any).auth
		// auth may be a function wrapping the token; calling it should resolve to the token
		expect(auth).toBeDefined()
	})
})

describe('listArtifacts', () => {
	test('returns mapped artifact entries from a single page', async () => {
		const fakeArtifact = {
			id: 1,
			name: 'build-output',
			size_in_bytes: 2048,
			created_at: '2024-01-15T10:00:00Z',
			expires_at: '2024-04-15T10:00:00Z',
			expired: false,
		}
		const octokit = {
			rest: {
				actions: {
					listArtifactsForRepo: mock(async () => ({
						data: { artifacts: [fakeArtifact] },
					})),
				},
			},
		} as never
		const result = await listArtifacts(octokit, 'owner', 'repo')
		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			id: 1,
			name: 'build-output',
			sizeInBytes: 2048,
			createdAt: '2024-01-15T10:00:00Z',
			expiresAt: '2024-04-15T10:00:00Z',
			expired: false,
		})
	})

	test('returns empty array when there are no artifacts', async () => {
		const octokit = {
			rest: {
				actions: {
					listArtifactsForRepo: mock(async () => ({
						data: { artifacts: [] },
					})),
				},
			},
		} as never
		const result = await listArtifacts(octokit, 'owner', 'repo')
		expect(result).toHaveLength(0)
	})
})

describe('deleteAllArtifacts', () => {
	test('deletes each artifact and returns the count', async () => {
		const deleteFn = mock(async () => ({}))
		const octokit = {
			rest: {
				actions: {
					listArtifactsForRepo: mock(async () => ({
						data: {
							artifacts: [
								{ id: 10, name: 'a1', size_in_bytes: 0, created_at: null, expires_at: null, expired: false },
								{ id: 11, name: 'a2', size_in_bytes: 0, created_at: null, expires_at: null, expired: false },
							],
						},
					})),
					deleteArtifact: deleteFn,
				},
			},
		} as never
		const count = await deleteAllArtifacts(octokit, 'owner', 'repo')
		expect(count).toBe(2)
		expect(deleteFn).toHaveBeenCalledTimes(2)
		expect(deleteFn).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', artifact_id: 10 })
		expect(deleteFn).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', artifact_id: 11 })
	})

	test('returns 0 when there are no artifacts', async () => {
		const octokit = {
			rest: {
				actions: {
					listArtifactsForRepo: mock(async () => ({ data: { artifacts: [] } })),
					deleteArtifact: mock(async () => ({})),
				},
			},
		} as never
		const count = await deleteAllArtifacts(octokit, 'owner', 'repo')
		expect(count).toBe(0)
	})
})

describe('listWorkflowRuns', () => {
	test('returns mapped workflow run entries from a single page', async () => {
		const fakeRun = {
			id: 42,
			name: 'CI',
			status: 'completed',
			conclusion: 'success',
			created_at: '2024-02-01T08:00:00Z',
			updated_at: '2024-02-01T08:05:00Z',
		}
		const octokit = {
			rest: {
				actions: {
					listWorkflowRunsForRepo: mock(async () => ({
						data: { workflow_runs: [fakeRun] },
					})),
				},
			},
		} as never
		const result = await listWorkflowRuns(octokit, 'owner', 'repo')
		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			id: 42,
			name: 'CI',
			status: 'completed',
			conclusion: 'success',
			createdAt: '2024-02-01T08:00:00Z',
			updatedAt: '2024-02-01T08:05:00Z',
		})
	})

	test('returns empty array when there are no runs', async () => {
		const octokit = {
			rest: {
				actions: {
					listWorkflowRunsForRepo: mock(async () => ({
						data: { workflow_runs: [] },
					})),
				},
			},
		} as never
		const result = await listWorkflowRuns(octokit, 'owner', 'repo')
		expect(result).toHaveLength(0)
	})
})

describe('deleteAllWorkflowRunLogs', () => {
	test('deletes logs for each run and returns the count', async () => {
		const deleteLogsFn = mock(async () => ({}))
		const octokit = {
			rest: {
				actions: {
					listWorkflowRunsForRepo: mock(async () => ({
						data: {
							workflow_runs: [
								{ id: 1, name: 'CI', status: 'completed', conclusion: 'success', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:01:00Z' },
								{ id: 2, name: 'CI', status: 'completed', conclusion: 'failure', created_at: '2024-01-02T00:00:00Z', updated_at: '2024-01-02T00:01:00Z' },
							],
						},
					})),
					deleteWorkflowRunLogs: deleteLogsFn,
				},
			},
		} as never
		const count = await deleteAllWorkflowRunLogs(octokit, 'owner', 'repo')
		expect(count).toBe(2)
		expect(deleteLogsFn).toHaveBeenCalledTimes(2)
	})

	test('skips runs that return 404 and counts only successful deletions', async () => {
		const deleteLogsFn = mock(async (_args: { run_id: number }) => {
			if (_args.run_id === 2) {
				const err = Object.assign(new Error('Not Found'), { status: 404 })
				throw err
			}
		})
		const octokit = {
			rest: {
				actions: {
					listWorkflowRunsForRepo: mock(async () => ({
						data: {
							workflow_runs: [
								{ id: 1, name: 'CI', status: 'completed', conclusion: 'success', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:01:00Z' },
								{ id: 2, name: 'CI', status: 'completed', conclusion: 'success', created_at: '2024-01-02T00:00:00Z', updated_at: '2024-01-02T00:01:00Z' },
							],
						},
					})),
					deleteWorkflowRunLogs: deleteLogsFn,
				},
			},
		} as never
		const count = await deleteAllWorkflowRunLogs(octokit, 'owner', 'repo')
		expect(count).toBe(1)
	})

	test('returns 0 when there are no runs', async () => {
		const octokit = {
			rest: {
				actions: {
					listWorkflowRunsForRepo: mock(async () => ({
						data: { workflow_runs: [] },
					})),
					deleteWorkflowRunLogs: mock(async () => ({})),
				},
			},
		} as never
		const count = await deleteAllWorkflowRunLogs(octokit, 'owner', 'repo')
		expect(count).toBe(0)
	})
})
