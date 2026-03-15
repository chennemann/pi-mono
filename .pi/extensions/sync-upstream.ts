import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface GitCommandResult {
	code: number;
	stdout: string;
	stderr: string;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function formatGitFailure(step: string, result: GitCommandResult): string {
	const details = result.stderr.trim() || result.stdout.trim() || `git exited with code ${result.code}`;
	return `${step} failed: ${details}`;
}

async function runGit(pi: ExtensionAPI, cwd: string, step: string, args: string[]): Promise<GitCommandResult> {
	const result = await pi.exec("git", args, { cwd });
	if (result.code !== 0) {
		throw new Error(formatGitFailure(step, result));
	}
	return result;
}

export default function syncUpstreamExtension(pi: ExtensionAPI) {
	pi.registerCommand("sync-upstream", {
		description: "Run the repository upstream sync workflow",
		handler: async (_args, ctx) => {
			try {
				await runGit(pi, ctx.cwd, "git fetch upstream --tags", ["fetch", "upstream", "--tags"]);

				const latestResult = await runGit(pi, ctx.cwd, "git describe --tags --abbrev=0 upstream/HEAD", [
					"describe",
					"--tags",
					"--abbrev=0",
					"upstream/HEAD",
				]);
				const latest = latestResult.stdout.trim();

				if (ctx.hasUI) {
					ctx.ui.notify(`rebasing on upstream tag ${latest}`, "info");
				}

				await runGit(pi, ctx.cwd, `git rebase ${latest}`, ["rebase", latest]);
				await runGit(pi, ctx.cwd, "git push --force-with-lease origin HEAD", [
					"push",
					"--force-with-lease",
					"origin",
					"HEAD",
				]);

				if (ctx.hasUI) {
					ctx.ui.notify(`Synced with upstream tag ${latest}`, "info");
				}
			} catch (error) {
				const message = getErrorMessage(error);
				if (ctx.hasUI) {
					ctx.ui.notify(message, "error");
					return;
				}
				throw error;
			}
		},
	});
}
