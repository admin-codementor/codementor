// Curated placement tracks → topic requirements mapped to recruitment patterns.
// `target` = number of DISTINCT accepted problems in that tag to be "ready".
// Readiness is then derived from each student's actual solved problems.
//
// `topic` is the canonical name; `aliases` are the tag spellings real problems
// actually carry. They are needed because the two vocabularies never agreed:
// this file says "array" and "hashmap" while imported problems are tagged
// "arrays" and "hashing", so a literal lookup scored almost every topic at
// zero and the placement page quietly under-reported every student. Matching
// goes through `tagMatches`, which also ignores a trailing "s", so an alias is
// only needed where the word itself differs.

const TRACKS = [
  {
    key: 'faang',
    label: 'FAANG / Big Tech',
    color: 'var(--brand)',
    companies: ['Google', 'Meta', 'Amazon', 'Microsoft', 'Apple'],
    focus: 'Hard DSA · System Design · Behavioral',
    topics: [
      { topic: 'array',                label: 'Arrays',              target: 8, aliases: ['arrays', 'array', 'prefix sum', 'matrix'] },
      { topic: 'string',               label: 'Strings',             target: 5, aliases: ['strings', 'string'] },
      { topic: 'tree',                 label: 'Trees',               target: 6, aliases: ['trees', 'tree', 'binary tree'] },
      { topic: 'graph',                label: 'Graphs',              target: 5, aliases: ['graphs', 'graph', 'bfs', 'dfs'] },
      { topic: 'dynamic programming',  label: 'Dynamic Programming', target: 8, aliases: ['dynamic programming', 'dp', 'memoization'] },
      { topic: 'backtracking',         label: 'Backtracking',        target: 3, aliases: ['backtracking', 'recursion'] },
      { topic: 'heap',                 label: 'Heaps',               target: 3, aliases: ['heap', 'priority queue'] },
      { topic: 'binary search',        label: 'Binary Search',       target: 4, aliases: ['binary search', 'searching'] },
    ],
  },
  {
    key: 'product',
    label: 'Product Companies',
    color: 'var(--purple)',
    companies: ['Flipkart', 'Swiggy', 'Zomato', 'Razorpay', 'CRED'],
    focus: 'Medium DSA · OOD',
    topics: [
      { topic: 'array',               label: 'Arrays',              target: 6, aliases: ['arrays', 'array', 'prefix sum', 'matrix'] },
      { topic: 'string',              label: 'Strings',             target: 5, aliases: ['strings', 'string'] },
      { topic: 'hashmap',             label: 'Hash Maps',           target: 4, aliases: ['hashing', 'hash map', 'hashmap', 'hash table'] },
      { topic: 'tree',                label: 'Trees',               target: 4, aliases: ['trees', 'tree', 'binary tree'] },
      { topic: 'dynamic programming', label: 'Dynamic Programming', target: 4, aliases: ['dynamic programming', 'dp', 'memoization'] },
      { topic: 'sorting',             label: 'Sorting',             target: 3, aliases: ['sorting', 'sort'] },
    ],
  },
  {
    key: 'service',
    label: 'Service Companies',
    color: 'var(--success)',
    companies: ['TCS', 'Infosys', 'Wipro', 'HCL', 'Cognizant'],
    focus: 'Easy–Medium DSA · Aptitude',
    topics: [
      { topic: 'array',       label: 'Arrays',       target: 5, aliases: ['arrays', 'array', 'prefix sum', 'matrix'] },
      { topic: 'string',      label: 'Strings',      target: 4, aliases: ['strings', 'string'] },
      { topic: 'sorting',     label: 'Sorting',      target: 3, aliases: ['sorting', 'sort'] },
      { topic: 'linked list', label: 'Linked Lists', target: 3, aliases: ['linked list'] },
      { topic: 'hashmap',     label: 'Hash Maps',    target: 2, aliases: ['hashing', 'hash map', 'hashmap', 'hash table'] },
    ],
  },
  {
    key: 'gate',
    label: 'GATE / Higher Studies',
    color: 'var(--warning)',
    companies: ['IITs', 'IISc', 'NITs', 'PSUs'],
    focus: 'Algorithms · Complexity · Core CS',
    topics: [
      { topic: 'array',               label: 'Arrays',              target: 3, aliases: ['arrays', 'array', 'prefix sum', 'matrix'] },
      { topic: 'sorting',             label: 'Sorting',             target: 3, aliases: ['sorting', 'sort'] },
      { topic: 'tree',                label: 'Trees',               target: 3, aliases: ['trees', 'tree', 'binary tree'] },
      { topic: 'graph',               label: 'Graphs',              target: 3, aliases: ['graphs', 'graph', 'bfs', 'dfs'] },
      { topic: 'dynamic programming', label: 'Dynamic Programming', target: 3, aliases: ['dynamic programming', 'dp', 'memoization'] },
      { topic: 'greedy',              label: 'Greedy',              target: 2, aliases: ['greedy'] },
    ],
  },
];

module.exports = { TRACKS };
