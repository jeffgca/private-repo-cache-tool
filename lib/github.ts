import { Octokit } from '@octokit/rest'

export interface Repo {
	owner: string
	name: string
	fullName: string
	actionsEnabled: boolean
	lastCommitDate: Date | null
}

export interface CacheEntry {
	id: number
	ref: string
	key: string
	sizeInBytes: number
	createdAt: string | null
	lastAccessedAt: string | null
}

export function createGitHubClient(token: string): Octokit {
	return new Octokit({ auth: token })
}

/**
 * Returns all private repos for the authenticated user that have Actions enabled.
 * Pagination is handled automatically.
 */
export async function listPrivateReposWithActions(
	octokit: Octokit
): Promise<Repo[]> {
	const repos: Repo[] = []

	for await (const response of octokit.paginate.iterator(
		octokit.rest.repos.listForAuthenticatedUser,
		{ type: 'private', per_page: 100 }
	)) {
		for (const repo of response.data) {
			// repos.listForAuthenticatedUser already filters to private repos
			const owner = repo.owner?.login ?? ''
			const name = repo.name

			let actionsEnabled = false
			try {
				const { data: perms } =
					await octokit.rest.actions.getGithubActionsPermissionsRepository({
						owner,
						repo: name,
					})
				actionsEnabled = perms.enabled
			} catch {
				// If we can't read permissions, assume disabled / inaccessible
				actionsEnabled = false
			}

			const lastCommitDate = await getLastCommitDate(octokit, owner, name)

			repos.push({
				owner,
				name,
				fullName: `${owner}/${name}`,
				actionsEnabled,
				lastCommitDate,
			})
		}
	}

	return repos
}

/**
 * Returns the date of the most recent commit on the default branch,
 * or null if the repo has no commits or is inaccessible.
 */
export async function getLastCommitDate(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<Date | null> {
	try {
		const { data: commits } = await octokit.rest.repos.listCommits({
			owner,
			repo,
			per_page: 1,
		})
		if (commits.length === 0) return null
		const dateStr = commits[0]?.commit?.committer?.date ?? commits[0]?.commit?.author?.date
		return dateStr ? new Date(dateStr) : null
	} catch {
		return null
	}
}

/**
 * Disables GitHub Actions for the given repository.
 */
export async function disableActions(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<void> {
	await octokit.rest.actions.setGithubActionsPermissionsRepository({
		owner,
		repo,
		enabled: false,
	})
}

/**
 * Lists all caches for the given repository.
 */
export async function listCaches(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<CacheEntry[]> {
	const caches: CacheEntry[] = []
	let page = 1
	while (true) {
		const { data } = await octokit.rest.actions.getActionsCacheList({
			owner,
			repo,
			per_page: 100,
			page,
		})
		const entries = data.actions_caches ?? []
		for (const c of entries) {
			caches.push({
				id: c.id ?? 0,
				ref: c.ref ?? '',
				key: c.key ?? '',
				sizeInBytes: c.size_in_bytes ?? 0,
				createdAt: c.created_at ?? null,
				lastAccessedAt: c.last_accessed_at ?? null,
			})
		}
		if (entries.length < 100) break
		page++
	}
	return caches
}

/**
 * Deletes all Actions caches for the given repository.
 * Returns the number of caches deleted.
 */
export async function clearAllCaches(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<number> {
	const caches = await listCaches(octokit, owner, repo)
	for (const cache of caches) {
		await octokit.rest.actions.deleteActionsCacheById({
			owner,
			repo,
			cache_id: cache.id,
		})
	}
	return caches.length
}
