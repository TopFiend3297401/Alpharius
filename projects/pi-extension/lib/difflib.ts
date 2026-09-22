/**
 * A faithful port of Python's difflib.SequenceMatcher(None, a, b).ratio().
 *
 * The exoskeleton ranks candidates with SequenceMatcher, so the port must score
 * the same way or the "nearest actual text" and path candidates drift. Ported:
 * the b2j index, the autojunk "popular element" heuristic (len(b) >= 200), the
 * non-junk extension loops in find_longest_match, and the matching-blocks
 * recursion. isjunk is always None here, exactly as in exoskeleton.py.
 *
 * Strings are compared by code point (Array.from), matching Python's str.
 */

type Seq = string[];

function buildB2j(b: Seq): Map<string, number[]> {
	const b2j = new Map<string, number[]>();
	for (let i = 0; i < b.length; i++) {
		const el = b[i]!;
		let arr = b2j.get(el);
		if (!arr) {
			arr = [];
			b2j.set(el, arr);
		}
		arr.push(i);
	}
	const n = b.length;
	if (n >= 200) {
		const ntest = Math.floor(n / 100) + 1;
		for (const [el, idxs] of [...b2j]) {
			if (idxs.length > ntest) b2j.delete(el);
		}
	}
	return b2j;
}

function findLongestMatch(
	a: Seq,
	b: Seq,
	b2j: Map<string, number[]>,
	alo: number,
	ahi: number,
	blo: number,
	bhi: number,
): [number, number, number] {
	let besti = alo;
	let bestj = blo;
	let bestsize = 0;
	let j2len = new Map<number, number>();
	for (let i = alo; i < ahi; i++) {
		const newj2len = new Map<number, number>();
		const js = b2j.get(a[i]!);
		if (js) {
			for (const j of js) {
				if (j < blo) continue;
				if (j >= bhi) break;
				const k = (j2len.get(j - 1) ?? 0) + 1;
				newj2len.set(j, k);
				if (k > bestsize) {
					besti = i - k + 1;
					bestj = j - k + 1;
					bestsize = k;
				}
			}
		}
		j2len = newj2len;
	}
	// bjunk is empty (isjunk=None), so only the "non-junk" extension applies; it
	// matters because autojunk removed popular elements from b2j.
	while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
		besti--;
		bestj--;
		bestsize++;
	}
	while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) {
		bestsize++;
	}
	return [besti, bestj, bestsize];
}

export function matchingSize(aStr: string, bStr: string): number {
	const a = Array.from(aStr);
	const b = Array.from(bStr);
	const b2j = buildB2j(b);
	let total = 0;
	const queue: Array<[number, number, number, number]> = [[0, a.length, 0, b.length]];
	while (queue.length) {
		const [alo, ahi, blo, bhi] = queue.pop()!;
		const [i, j, k] = findLongestMatch(a, b, b2j, alo, ahi, blo, bhi);
		if (k) {
			total += k;
			if (alo < i && blo < j) queue.push([alo, i, blo, j]);
			if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
		}
	}
	return total;
}

/** SequenceMatcher(None, a, b).ratio() */
export function ratio(a: string, b: string): number {
	const la = Array.from(a).length;
	const lb = Array.from(b).length;
	if (la + lb === 0) return 1.0;
	return (2.0 * matchingSize(a, b)) / (la + lb);
}
