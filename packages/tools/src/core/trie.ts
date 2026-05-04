/**
 * Trie (prefix tree) for O(k) tool name prefix search.
 *
 * k = length of the query prefix (independent of total tools registered).
 * Designed for registries with 10 000+ tools where O(n) linear scan is too slow.
 *
 * Supports:
 * - O(k)    exact lookup by name
 * - O(k+m)  prefix search (m = number of matches)
 * - O(k)    prefix existence check
 * - O(k)    insert / delete
 *
 * The Trie stores tool IDs at leaf/terminal nodes. The ToolRegistry
 * keeps the authoritative Map<id, Tool>; the Trie is a pure index.
 */

// Each Trie node stores a Map of children keyed by character code
// (avoids string object allocation per edge)
class TrieNode {
    readonly children = new Map<number, TrieNode>();
    /** Tool IDs whose name ends exactly at this node */
    readonly terminals = new Set<string>();
}

export class ToolNameTrie {
    private readonly root = new TrieNode();
    private _size = 0;

    /** O(k) insert */
    insert(name: string, toolId: string): void {
        let node = this.root;
        for (let i = 0; i < name.length; i++) {
            const ch = name.charCodeAt(i);
            let child = node.children.get(ch);
            if (!child) {
                child = new TrieNode();
                node.children.set(ch, child);
            }
            node = child;
        }
        if (!node.terminals.has(toolId)) {
            node.terminals.add(toolId);
            this._size++;
        }
    }

    /** O(k) delete */
    delete(name: string, toolId: string): void {
        // Walk path and collect trail for backtrack pruning
        const trail: Array<{ node: TrieNode; ch: number }> = [];
        let node = this.root;
        for (let i = 0; i < name.length; i++) {
            const ch = name.charCodeAt(i);
            const child = node.children.get(ch);
            if (!child) return;
            trail.push({ node, ch });
            node = child;
        }
        if (!node.terminals.delete(toolId)) return;
        this._size--;

        // Prune empty leaf nodes back toward root
        for (let i = trail.length - 1; i >= 0; i--) {
            const { node: parent, ch } = trail[i]!;
            const child = parent.children.get(ch)!;
            if (child.terminals.size === 0 && child.children.size === 0) {
                parent.children.delete(ch);
            } else {
                break;
            }
        }
    }

    /** O(k) exact lookup — returns tool IDs at this name */
    exactMatch(name: string): Set<string> {
        const node = this._navigate(name);
        return node?.terminals ?? new Set();
    }

    /** O(k + m) prefix search — returns all tool IDs whose name starts with prefix */
    prefixSearch(prefix: string): string[] {
        const node = this._navigate(prefix);
        if (!node) return [];
        const result: string[] = [];
        this._collect(node, result);
        return result;
    }

    /** O(k) check if any tool name starts with prefix */
    hasPrefix(prefix: string): boolean {
        return this._navigate(prefix) !== null;
    }

    get size(): number { return this._size; }

    private _navigate(s: string): TrieNode | null {
        let node = this.root;
        for (let i = 0; i < s.length; i++) {
            const child = node.children.get(s.charCodeAt(i));
            if (!child) return null;
            node = child;
        }
        return node;
    }

    private _collect(node: TrieNode, out: string[]): void {
        for (const id of node.terminals) out.push(id);
        for (const child of node.children.values()) this._collect(child, out);
    }
}

// ── N-gram inverted index for fuzzy/substring search ───────────────────────

/**
 * NGram inverted index for O(k) substring search across tool names + descriptions.
 *
 * Build once on registry load; query in O(k·q) where q = ngram size (default 3).
 * Much faster than O(n·m) filter() for large registries.
 *
 * Implementation: tokenise each string into overlapping n-grams, store in an
 * inverted index Map<ngram, Set<toolId>>.  Query = intersect posting lists.
 */
export class NGramIndex {
    private readonly index = new Map<string, Set<string>>();
    private readonly n: number;

    constructor(n = 3) {
        this.n = Math.max(1, n);
    }

    /** Index a text string for a given tool ID */
    add(toolId: string, text: string): void {
        for (const gram of this._ngrams(text.toLowerCase())) {
            let set = this.index.get(gram);
            if (!set) { set = new Set(); this.index.set(gram, set); }
            set.add(toolId);
        }
    }

    /** Remove all entries for a tool ID (O(unique-grams)) */
    remove(toolId: string, text: string): void {
        for (const gram of this._ngrams(text.toLowerCase())) {
            this.index.get(gram)?.delete(toolId);
        }
    }

    /**
     * Query: returns IDs that match ALL n-grams in the query string.
     * O(k·q) where k = query length, q = n-gram size.
     */
    search(query: string): Set<string> {
        const grams = [...this._ngrams(query.toLowerCase())];
        if (grams.length === 0) return new Set();

        // Start with the smallest posting list for fastest intersection
        let result: Set<string> | null = null;
        for (const gram of grams) {
            const posting = this.index.get(gram);
            if (!posting || posting.size === 0) return new Set();
            if (!result || posting.size < result.size) result = posting;
        }
        if (!result) return new Set();

        // Intersect all posting lists
        const out = new Set<string>();
        for (const id of result) {
            if (grams.every(g => this.index.get(g)?.has(id))) {
                out.add(id);
            }
        }
        return out;
    }

    private *_ngrams(s: string): Iterable<string> {
        if (s.length < this.n) { yield s; return; }
        for (let i = 0; i <= s.length - this.n; i++) {
            yield s.slice(i, i + this.n);
        }
    }
}
