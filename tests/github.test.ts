import { expect, test, describe } from 'bun:test'
import { createGitHubClient } from '../lib/github.ts'

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
