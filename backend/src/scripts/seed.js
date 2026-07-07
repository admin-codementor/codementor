const { Pool } = require('pg');
require('dotenv').config({ path: '../../.env' }); // Load .env if run directly

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://judge0:judge0_secret@localhost:5432/judge0',
});

const SEED_PROBLEMS = [
  // Arrays
  {
    title: 'Two Sum',
    description: 'Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.\n\n**Example:**\nInput: nums = [2,7,11,15], target = 9\nOutput: [0,1]',
    difficulty: 'easy',
    tags: ['arrays', 'hash-table'],
    testCases: [
      { input: '4\n2 7 11 15\n9', output: '0 1' },
      { input: '3\n3 2 4\n6', output: '1 2' },
      { input: '2\n3 3\n6', output: '0 1' }
    ]
  },
  {
    title: 'Reverse Array',
    description: 'Reverse the elements of a given array.\n\n**Example:**\nInput: [1,2,3,4,5]\nOutput: [5,4,3,2,1]',
    difficulty: 'easy',
    tags: ['arrays'],
    testCases: [
      { input: '5\n1 2 3 4 5', output: '5 4 3 2 1' },
      { input: '3\n10 20 30', output: '30 20 10' }
    ]
  },
  {
    title: 'Find Maximum Element',
    description: 'Find the largest number in a given array.\n\n**Example:**\nInput: [1, 5, 3, 9, 2]\nOutput: 9',
    difficulty: 'easy',
    tags: ['arrays'],
    testCases: [
      { input: '5\n1 5 3 9 2', output: '9' },
      { input: '4\n-1 -5 -2 -9', output: '-1' }
    ]
  },
  {
    title: 'Move Zeroes',
    description: 'Given an integer array `nums`, move all 0s to the end of it while maintaining the relative order of the non-zero elements.\n\n**Example:**\nInput: [0,1,0,3,12]\nOutput: [1,3,12,0,0]',
    difficulty: 'easy',
    tags: ['arrays'],
    testCases: [
      { input: '5\n0 1 0 3 12', output: '1 3 12 0 0' }
    ]
  },
  {
    title: 'Subarray Sum Equals K',
    description: 'Given an array of integers `nums` and an integer `k`, return the total number of continuous subarrays whose sum equals to `k`.\n\n**Example:**\nInput: nums = [1,1,1], k = 2\nOutput: 2',
    difficulty: 'medium',
    tags: ['arrays', 'prefix-sum'],
    testCases: [
      { input: '3 2\n1 1 1', output: '2' },
      { input: '3 3\n1 2 3', output: '2' }
    ]
  },

  // Strings
  {
    title: 'Valid Palindrome',
    description: 'Given a string `s`, return true if it is a palindrome, or false otherwise. (Ignore spaces and case)\n\n**Example:**\nInput: "A man, a plan, a canal: Panama"\nOutput: true',
    difficulty: 'easy',
    tags: ['strings'],
    testCases: [
      { input: 'racecar', output: 'true' },
      { input: 'hello', output: 'false' }
    ]
  },
  {
    title: 'Reverse String',
    description: 'Write a function that reverses a string.\n\n**Example:**\nInput: "hello"\nOutput: "olleh"',
    difficulty: 'easy',
    tags: ['strings'],
    testCases: [
      { input: 'hello', output: 'olleh' },
      { input: 'world', output: 'dlrow' }
    ]
  },
  {
    title: 'First Unique Character',
    description: 'Given a string `s`, find the first non-repeating character in it and return its index. If it does not exist, return -1.\n\n**Example:**\nInput: "leetcode"\nOutput: 0',
    difficulty: 'easy',
    tags: ['strings', 'hash-table'],
    testCases: [
      { input: 'leetcode', output: '0' },
      { input: 'loveleetcode', output: '2' },
      { input: 'aabb', output: '-1' }
    ]
  },
  {
    title: 'Valid Anagram',
    description: 'Given two strings `s` and `t`, return true if `t` is an anagram of `s`, and false otherwise.\n\n**Example:**\nInput: s = "anagram", t = "nagaram"\nOutput: true',
    difficulty: 'easy',
    tags: ['strings', 'hash-table'],
    testCases: [
      { input: 'anagram\nnagaram', output: 'true' },
      { input: 'rat\ncar', output: 'false' }
    ]
  },
  {
    title: 'Longest Substring Without Repeating Characters',
    description: 'Given a string `s`, find the length of the longest substring without repeating characters.\n\n**Example:**\nInput: "abcabcbb"\nOutput: 3',
    difficulty: 'medium',
    tags: ['strings', 'sliding-window'],
    testCases: [
      { input: 'abcabcbb', output: '3' },
      { input: 'bbbbb', output: '1' },
      { input: 'pwwkew', output: '3' }
    ]
  },

  // Math
  {
    title: 'Fibonacci Number',
    description: 'The Fibonacci numbers form a sequence, such that each number is the sum of the two preceding ones. Given `n`, calculate `F(n)`.\n\n**Example:**\nInput: 2\nOutput: 1',
    difficulty: 'easy',
    tags: ['math', 'dp'],
    testCases: [
      { input: '2', output: '1' },
      { input: '3', output: '2' },
      { input: '4', output: '3' }
    ]
  },
  {
    title: 'Factorial',
    description: 'Calculate the factorial of a given non-negative integer `n`.\n\n**Example:**\nInput: 5\nOutput: 120',
    difficulty: 'easy',
    tags: ['math'],
    testCases: [
      { input: '5', output: '120' },
      { input: '0', output: '1' }
    ]
  },
  {
    title: 'Check Prime',
    description: 'Determine if a given number is a prime number.\n\n**Example:**\nInput: 7\nOutput: true',
    difficulty: 'easy',
    tags: ['math'],
    testCases: [
      { input: '7', output: 'true' },
      { input: '10', output: 'false' },
      { input: '2', output: 'true' }
    ]
  },
  {
    title: 'Power of Two',
    description: 'Given an integer `n`, return true if it is a power of two. Otherwise, return false.\n\n**Example:**\nInput: 16\nOutput: true',
    difficulty: 'easy',
    tags: ['math', 'bit-manipulation'],
    testCases: [
      { input: '16', output: 'true' },
      { input: '3', output: 'false' }
    ]
  },
  {
    title: 'Climbing Stairs',
    description: 'You are climbing a staircase. It takes `n` steps to reach the top. Each time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?\n\n**Example:**\nInput: 2\nOutput: 2',
    difficulty: 'easy',
    tags: ['math', 'dp'],
    testCases: [
      { input: '2', output: '2' },
      { input: '3', output: '3' },
      { input: '5', output: '8' }
    ]
  },

  // Linked Lists / Data Structures (Simulated via Arrays for this basic auto judge)
  {
    title: 'Merge Sorted Arrays',
    description: 'You are given two integer arrays `nums1` and `nums2`, sorted in non-decreasing order. Merge `nums1` and `nums2` into a single array sorted in non-decreasing order.\n\n**Example:**\nInput: nums1 = [1,2,3], nums2 = [2,5,6]\nOutput: [1,2,2,3,5,6]',
    difficulty: 'easy',
    tags: ['arrays', 'two-pointers'],
    testCases: [
      { input: '3\n1 2 3\n3\n2 5 6', output: '1 2 2 3 5 6' }
    ]
  },
  
  // Hard Problems
  {
    title: 'Trapping Rain Water',
    description: 'Given `n` non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.\n\n**Example:**\nInput: [0,1,0,2,1,0,1,3,2,1,2,1]\nOutput: 6',
    difficulty: 'hard',
    tags: ['arrays', 'two-pointers'],
    testCases: [
      { input: '12\n0 1 0 2 1 0 1 3 2 1 2 1', output: '6' }
    ]
  },
  {
    title: 'Median of Two Sorted Arrays',
    description: 'Given two sorted arrays `nums1` and `nums2` of size `m` and `n` respectively, return the median of the two sorted arrays.\n\n**Example:**\nInput: nums1 = [1,3], nums2 = [2]\nOutput: 2.0',
    difficulty: 'hard',
    tags: ['arrays', 'binary-search'],
    testCases: [
      { input: '2\n1 3\n1\n2', output: '2.0' }
    ]
  },
  {
    title: 'N-Queens',
    description: 'The n-queens puzzle is the problem of placing `n` queens on an `n x n` chessboard such that no two queens attack each other. Print the number of distinct solutions.\n\n**Example:**\nInput: 4\nOutput: 2',
    difficulty: 'hard',
    tags: ['backtracking'],
    testCases: [
      { input: '4', output: '2' },
      { input: '8', output: '92' }
    ]
  },
  {
    title: 'Word Search',
    description: 'Given an `m x n` grid of characters `board` and a string `word`, return true if `word` exists in the grid.\n\n**Example:**\nInput: board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], word = "ABCCED"\nOutput: true',
    difficulty: 'medium',
    tags: ['backtracking', 'dfs'],
    testCases: [
      { input: '3 4\nA B C E\nS F C S\nA D E E\nABCCED', output: 'true' }
    ]
  }
];

// Replicate arrays to reach roughly 30 if needed, but 20 is a very solid start. 
// Adding 10 more simple ones...

const MORE_PROBLEMS = [
  { title: 'Contains Duplicate', difficulty: 'easy', tags: ['arrays'], testCases: [{ input: '4\n1 2 3 1', output: 'true' }, { input: '4\n1 2 3 4', output: 'false' }] },
  { title: 'Missing Number', difficulty: 'easy', tags: ['math'], testCases: [{ input: '3\n3 0 1', output: '2' }] },
  { title: 'Reverse Bits', difficulty: 'easy', tags: ['bit-manipulation'], testCases: [{ input: '43261596', output: '964176192' }] },
  { title: 'Number of 1 Bits', difficulty: 'easy', tags: ['bit-manipulation'], testCases: [{ input: '11', output: '3' }] },
  { title: 'Plus One', difficulty: 'easy', tags: ['arrays'], testCases: [{ input: '3\n1 2 3', output: '1 2 4' }] },
  { title: 'Sqrt(x)', difficulty: 'easy', tags: ['math'], testCases: [{ input: '4', output: '2' }, { input: '8', output: '2' }] },
  { title: 'Majority Element', difficulty: 'easy', tags: ['arrays'], testCases: [{ input: '3\n3 2 3', output: '3' }] },
  { title: 'Length of Last Word', difficulty: 'easy', tags: ['strings'], testCases: [{ input: 'Hello World', output: '5' }] },
  { title: 'Palindrome Number', difficulty: 'easy', tags: ['math'], testCases: [{ input: '121', output: 'true' }, { input: '-121', output: 'false' }] },
  { title: 'Two Sum II', difficulty: 'medium', tags: ['arrays', 'two-pointers'], testCases: [{ input: '4\n2 7 11 15\n9', output: '1 2' }] }
];

const ALL_PROBLEMS = [...SEED_PROBLEMS, ...MORE_PROBLEMS.map(p => ({
  ...p,
  description: `Solve the problem: ${p.title}. Default description.`
}))];

// ── Course / module seed definitions ───────────────────────────────────────────
// CDP 699 groups the seeded problems into topic modules by tag. "Advanced DSA for
// Top Companies" is a company-oriented course; there are no company-tagged problems
// yet, so a few modules get sample problems and the rest are intentional placeholders.

const CDP_MODULES = [
  { title: 'Basics', tags: ['math'] },
  { title: 'Arrays', tags: ['arrays', 'prefix-sum'] },
  { title: 'Strings', tags: ['strings'] },
  { title: 'Hashing', tags: ['hash-table'] },
  { title: 'Searching & Sorting', tags: ['two-pointers', 'sliding-window'] },
  { title: 'Recursion & Backtracking', tags: ['backtracking'] },
  { title: 'Dynamic Programming', tags: ['dp'] },
  { title: 'Bit Manipulation', tags: ['bit-manipulation'] },
  { title: 'Graphs', tags: ['dfs', 'graphs'] },
  { title: 'Trees', tags: ['trees'] },
];

const COMPANY_MODULES = [
  'TCS', 'Accenture', 'Wipro', 'Infosys', 'Cognizant',
  'Capgemini', 'Microsoft', 'Amazon', 'Google', 'Adobe',
];

async function seedCourses(inserted) {
  // Tag → problem ids
  const byTag = new Map();
  for (const p of inserted) {
    for (const t of p.tags) {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t).push(p.id);
    }
  }

  // Reset course tables (cascades to modules + module_problems).
  await pool.query('DELETE FROM courses');

  const insertCourse = async (title, description, sortOrder, modules) => {
    const c = await pool.query(
      `INSERT INTO courses (title, description, sort_order) VALUES ($1, $2, $3) RETURNING id`,
      [title, description, sortOrder]
    );
    const courseId = c.rows[0].id;
    let mOrder = 0;
    for (const mod of modules) {
      const m = await pool.query(
        `INSERT INTO course_modules (course_id, title, sort_order) VALUES ($1, $2, $3) RETURNING id`,
        [courseId, mod.title, mOrder++]
      );
      const moduleId = m.rows[0].id;
      const pids = mod.problemIds
        ? mod.problemIds
        : [...new Set((mod.tags || []).flatMap((t) => byTag.get(t) || []))];
      let pOrder = 0;
      for (const pid of pids) {
        await pool.query(
          `INSERT INTO module_problems (module_id, problem_id, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [moduleId, pid, pOrder++]
        );
      }
    }
    return courseId;
  };

  await insertCourse(
    'CDP 699 – Career Placement Program – AIML – 2025',
    'The Coding and Problem-Solving Series accommodates varying proficiency levels, offering challenges ranging from foundational to intermediate and advanced complexities.',
    0,
    CDP_MODULES
  );

  // Sample a handful of problems into the first few company modules so the course
  // isn't empty; the remaining companies are placeholders until real sets are added.
  const sample = inserted.slice(0, 4).map((p) => p.id);
  const companyModuleDefs = COMPANY_MODULES.map((name, i) => ({
    title: `${name} Programs`,
    problemIds: i < 3 ? sample : [],
  }));

  await insertCourse(
    'Advanced DSA for Top Companies',
    'Company-focused problem sets curated for top-tier placement preparation across service and product companies.',
    1,
    companyModuleDefs
  );

  console.log(`✅ Seeded 2 courses (CDP 699 + Advanced DSA). Note: company modules are sample/placeholder until company-specific problems are added.`);
}

const seedDB = async () => {
  try {
    console.log('Seeding Database...');
    
    // Clear old data
    await pool.query('DELETE FROM test_cases');
    await pool.query('DELETE FROM code_submissions');
    await pool.query('DELETE FROM problems');

    const inserted = []; // { id, title, tags } — used to build course modules
    for (const problem of ALL_PROBLEMS) {
      const pRes = await pool.query(
        `INSERT INTO problems (title, description, difficulty, tags) VALUES ($1, $2, $3, $4) RETURNING id`,
        [problem.title, problem.description, problem.difficulty, problem.tags]
      );
      const pid = pRes.rows[0].id;
      inserted.push({ id: pid, title: problem.title, tags: problem.tags || [] });

      for (const tc of problem.testCases) {
        await pool.query(
          `INSERT INTO test_cases (problem_id, input_data, expected_output, is_public) VALUES ($1, $2, $3, $4)`,
          [pid, tc.input, tc.output, true]
        );
      }
    }

    console.log(`✅ Successfully seeded ${ALL_PROBLEMS.length} problems with test cases.`);

    await seedCourses(inserted);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seedDB();
