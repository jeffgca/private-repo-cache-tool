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
 * Returns all private repos owned by `username`.
 * Pagination is handled automatically.
 */
export async function listPrivateRepos(
	octokit: Octokit,
	username: string,
): Promise<Repo[]> {
	const repos: Repo[] = []

	for await (const response of octokit.paginate.iterator(
		octokit.rest.repos.listForAuthenticatedUser,
		{ type: 'private', per_page: 100 },
	)) {
		for (const repo of response.data) {
			const owner = repo.owner?.login ?? ''
			// Only include repos owned by the specified account
			if (owner !== username) continue
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

			let lastCommitDate: Date | null = null
			try {
				lastCommitDate = await getLastCommitDate(octokit, owner, name)
			} catch (err) {
				console.warn(
					`  Warning: could not fetch commits for ${owner}/${name}:`,
					err,
				)
			}

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
 * Returns all private repos owned by `username` that have Actions enabled.
 */
export async function listPrivateReposWithActions(
	octokit: Octokit,
	username: string,
): Promise<Repo[]> {
	const repos = await listPrivateRepos(octokit, username)
	return repos.filter((repo) => repo.actionsEnabled)
}

/**
 * Returns the date of the most recent commit on the default branch,
 * or null if the repo has no commits.
 * Throws for any other error (permissions, network, etc.).
 */
export async function getLastCommitDate(
	octokit: Octokit,
	owner: string,
	repo: string,
): Promise<Date | null> {
	try {
		const { data: commits } = await octokit.rest.repos.listCommits({
			owner,
			repo,
			per_page: 1,
		})
		if (commits.length === 0) return null
		const dateStr =
			commits[0]?.commit?.committer?.date ?? commits[0]?.commit?.author?.date
		return dateStr ? new Date(dateStr) : null
	} catch (err) {
		// GitHub returns 409 "Git Repository is empty" for repos with zero commits
		// console.log('caught err', err)
		if (
			err != null &&
			typeof err === 'object' &&
			'status' in err &&
			(err as { status: number }).status === 409
		) {
			return null
		}
		throw err
	}
}

/**
 * Disables GitHub Actions for the given repository.
 */
export async function disableActions(
	octokit: Octokit,
	owner: string,
	repo: string,
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
	repo: string,
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
	repo: string,
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

export interface ArtifactEntry {
	id: number
	name: string
	sizeInBytes: number
	createdAt: string | null
	expiresAt: string | null
	expired: boolean
}

/**
 * Lists all artifacts for the given repository.
 * Pagination is handled automatically.
 */
export async function listArtifacts(
	octokit: Octokit,
	owner: string,
	repo: string,
): Promise<ArtifactEntry[]> {
	const artifacts: ArtifactEntry[] = []
	let page = 1
	while (true) {
		const { data } = await octokit.rest.actions.listArtifactsForRepo({
			owner,
			repo,
			per_page: 100,
			page,
		})
		const entries = data.artifacts ?? []
		for (const a of entries) {
			artifacts.push({
				id: a.id,
				name: a.name,
				sizeInBytes: a.size_in_bytes,
				createdAt: a.created_at ?? null,
				expiresAt: a.expires_at ?? null,
				expired: a.expired,
			})
		}
		if (entries.length < 100) break
		page++
	}
	return artifacts
}

/**
 * Deletes all artifacts for the given repository.
 * Returns the number of artifacts deleted.
 */
export async function deleteAllArtifacts(
	octokit: Octokit,
	owner: string,
	repo: string,
): Promise<number> {
	const artifacts = await listArtifacts(octokit, owner, repo)
	for (const artifact of artifacts) {
		await octokit.rest.actions.deleteArtifact({
			owner,
			repo,
			artifact_id: artifact.id,
		})
	}
	return artifacts.length
}

export interface WorkflowRun {
	id: number
	name: string | null
	status: string | null
	conclusion: string | null
	createdAt: string
	updatedAt: string
}

/**
 * Lists all workflow runs for the given repository.
 * Pagination is handled automatically.
 */
export async function listWorkflowRuns(
	octokit: Octokit,
	owner: string,
	repo: string,
): Promise<WorkflowRun[]> {
	const runs: WorkflowRun[] = []
	let page = 1
	while (true) {
		const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
			owner,
			repo,
			per_page: 100,
			page,
		})
		const entries = data.workflow_runs ?? []
		for (const r of entries) {
			runs.push({
				id: r.id,
				name: r.name ?? null,
				status: r.status ?? null,
				conclusion: r.conclusion ?? null,
				createdAt: r.created_at,
				updatedAt: r.updated_at,
			})
		}
		if (entries.length < 100) break
		page++
	}
	return runs
}

/**
 * Deletes the logs for all workflow runs in the given repository.
 * Returns the number of runs whose logs were deleted.
 */
export async function deleteAllWorkflowRunLogs(
	octokit: Octokit,
	owner: string,
	repo: string,
): Promise<number> {
	const runs = await listWorkflowRuns(octokit, owner, repo)
	let deleted = 0
	for (const run of runs) {
		try {
			await octokit.rest.actions.deleteWorkflowRunLogs({
				owner,
				repo,
				run_id: run.id,
			})
			deleted++
		} catch (err) {
			// Some runs may already have no logs; skip silently
			if (
				err != null &&
				typeof err === 'object' &&
				'status' in err &&
				(err as { status: number }).status === 404
			) {
				continue
			}
			throw err
		}
	}
	return deleted
}
