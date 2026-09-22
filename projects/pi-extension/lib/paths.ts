/**
 * Repo jail — port of confine() from exoskeleton.py, hardened for Pi:
 * resolves `..`, `~`, Pi's leading-`@` convention and symlinks (including a
 * symlinked parent of a file that does not exist yet, so `write` cannot escape
 * through a link either).
 */
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

/** realpath of the longest existing prefix, with the missing tail re-appended. */
export function realpathLenient(p: string): string {
	const abs = resolve(p);
	try {
		return realpathSync(abs);
	} catch {
		const parent = dirname(abs);
		if (parent === abs) return abs;
		return join(realpathLenient(parent), basename(abs));
	}
}

/** Expand the way Pi's resolveToCwd does: strip a leading @, expand ~, resolve against cwd. */
export function expandUserPath(userPath: string, cwd: string): string {
	let p = userPath.trim();
	if (p.startsWith("@")) p = p.slice(1);
	if (p === "~") p = homedir();
	else if (p.startsWith("~/")) p = join(homedir(), p.slice(2));
	else if (p === "$HOME" || p === "${HOME}") p = homedir();
	else if (p.startsWith("$HOME/")) p = join(homedir(), p.slice(6));
	else if (p.startsWith("${HOME}/")) p = join(homedir(), p.slice(8));
	return isAbsolute(p) ? resolve(p) : resolve(cwd, p);
}

export function isInside(root: string, candidate: string): boolean {
	return candidate === root || candidate.startsWith(root.endsWith(sep) ? root : root + sep);
}

export class JailError extends Error {}

/** Resolve userPath (relative to cwd) and require it to stay inside root. Returns the real path. */
export function confine(root: string, userPath: string, cwd: string = root): string {
	const realRoot = realpathLenient(root);
	const candidate = realpathLenient(expandUserPath(userPath, cwd));
	if (!isInside(realRoot, candidate)) {
		throw new JailError(
			`Path '${userPath}' is outside the project root ${realRoot}. ` +
				`All paths must stay inside the project. Use a path inside the project.`,
		);
	}
	return candidate;
}
