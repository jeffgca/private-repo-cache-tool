import type { Octokit } from '@octokit/rest'
import {
	listPrivateReposWithActions,
	disableActions,
	clearAllCaches,
	listArtifacts,
	deleteAllArtifacts,
	deleteAllWorkflowRunLogs,
	type Repo,
	type ArtifactEntry,
} from './github.js'

export const STALE_THRESHOLD_DAYS = 30

export interface FilterStaleReposOptions {
	requireActionsEnabled?: boolean
}

/**
 * Returns repos whose last commit is older than `thresholdDays` days ago,
 * or that have never had a commit (null date).
 */
export function filterStaleRepos(
	repos: Repo[],
	thresholdDays: number = STALE_THRESHOLD_DAYS,
	options: FilterStaleReposOptions = {},
): Repo[] {
	const { requireActionsEnabled = true } = options
	const cutoff = new Date()
	cutoff.setDate(cutoff.getDate() - thresholdDays)
	return repos.filter(
		(r) =>
			(!requireActionsEnabled || r.actionsEnabled) &&
			(r.lastCommitDate === null || r.lastCommitDate < cutoff),
	)
}

/**
 * Fetches all private repos with Actions enabled, then disables Actions on
 * those with no commits in the last `thresholdDays` days.
 * Returns the list of repos that were disabled.
 */
export async function disableStaleRepos(
	octokit: Octokit,
	username: string,
	thresholdDays: number = STALE_THRESHOLD_DAYS,
): Promise<Repo[]> {
	const allRepos = await listPrivateReposWithActions(octokit, username)
	const stale = filterStaleRepos(allRepos, thresholdDays)
	for (const repo of stale) {
		await disableActions(octokit, repo.owner, repo.name)
	}
	return stale
}

/**
 * Clears all Actions caches for each repo in the provided list.
 * Returns a map of fullName -> number of caches deleted.
 */
export async function clearCachesForRepos(
	octokit: Octokit,
	repos: Repo[],
): Promise<Map<string, number>> {
	const results = new Map<string, number>()
	for (const repo of repos) {
		const count = await clearAllCaches(octokit, repo.owner, repo.name)
		results.set(repo.fullName, count)
	}
	return results
}

/**
 * Lists all artifacts for each repo in the provided list.
 * Returns a map of fullName -> list of ArtifactEntry.
 */
export async function listArtifactsForRepos(
	octokit: Octokit,
	repos: Repo[],
): Promise<Map<string, ArtifactEntry[]>> {
	const results = new Map<string, ArtifactEntry[]>()
	for (const repo of repos) {
		const artifacts = await listArtifacts(octokit, repo.owner, repo.name)
		results.set(repo.fullName, artifacts)
	}
	return results
}

/**
 * Deletes all artifacts for each repo in the provided list.
 * Returns a map of fullName -> number of artifacts deleted.
 */
export async function deleteArtifactsForRepos(
	octokit: Octokit,
	repos: Repo[],
): Promise<Map<string, number>> {
	const results = new Map<string, number>()
	for (const repo of repos) {
		const count = await deleteAllArtifacts(octokit, repo.owner, repo.name)
		results.set(repo.fullName, count)
	}
	return results
}

/**
 * Deletes workflow run logs for each repo in the provided list.
 * Returns a map of fullName -> number of runs whose logs were deleted.
 */
export async function deleteLogsForRepos(
	octokit: Octokit,
	repos: Repo[],
): Promise<Map<string, number>> {
	const results = new Map<string, number>()
	for (const repo of repos) {
		const count = await deleteAllWorkflowRunLogs(
			octokit,
			repo.owner,
			repo.name,
		)
		results.set(repo.fullName, count)
	}
	return results
}
