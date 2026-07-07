const db = require('../config/db');

// @desc    List published courses with module/problem counts + caller's solved count
// @route   GET /api/courses
exports.getCourses = async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await db.query(
      `
      SELECT
        c.id,
        c.title,
        c.description,
        c.sort_order,
        COUNT(DISTINCT m.id)                               AS module_count,
        COUNT(DISTINCT mp.problem_id)                      AS problem_count,
        COUNT(DISTINCT cs.problem_id)                      AS solved_count
      FROM courses c
      LEFT JOIN course_modules m       ON m.course_id = c.id
      LEFT JOIN module_problems mp     ON mp.module_id = m.id
      LEFT JOIN code_submissions cs
             ON cs.problem_id = mp.problem_id
            AND cs.user_id = $1
            AND cs.verdict = 'Accepted'
      WHERE c.is_published = TRUE
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.created_at ASC
      `,
      [userId]
    );

    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        moduleCount: parseInt(r.module_count, 10) || 0,
        problemCount: parseInt(r.problem_count, 10) || 0,
        solvedCount: parseInt(r.solved_count, 10) || 0,
      })),
    });
  } catch (error) {
    console.error('getCourses error:', error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get one course with ordered modules → problems (+ per-problem solved flag)
// @route   GET /api/courses/:id
exports.getCourseById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const courseRes = await db.query(
      `SELECT id, title, description FROM courses WHERE id = $1 AND is_published = TRUE`,
      [id]
    );
    if (courseRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    const { rows } = await db.query(
      `
      SELECT
        m.id            AS module_id,
        m.title         AS module_title,
        m.sort_order    AS module_order,
        p.id            AS problem_id,
        p.title         AS problem_title,
        p.difficulty,
        p.tags,
        mp.sort_order   AS problem_order,
        EXISTS (
          SELECT 1 FROM code_submissions cs
          WHERE cs.user_id = $2 AND cs.problem_id = p.id AND cs.verdict = 'Accepted'
        ) AS is_solved
      FROM course_modules m
      LEFT JOIN module_problems mp ON mp.module_id = m.id
      LEFT JOIN problems p         ON p.id = mp.problem_id
      WHERE m.course_id = $1
      ORDER BY m.sort_order ASC, mp.sort_order ASC, p.title ASC
      `,
      [id, userId]
    );

    const moduleMap = new Map();
    for (const r of rows) {
      if (!moduleMap.has(r.module_id)) {
        moduleMap.set(r.module_id, {
          id: r.module_id,
          title: r.module_title,
          problems: [],
        });
      }
      if (r.problem_id) {
        moduleMap.get(r.module_id).problems.push({
          id: r.problem_id,
          title: r.problem_title,
          difficulty: r.difficulty,
          tags: r.tags || [],
          is_solved: r.is_solved === true,
        });
      }
    }

    res.json({
      success: true,
      data: {
        id: courseRes.rows[0].id,
        title: courseRes.rows[0].title,
        description: courseRes.rows[0].description,
        modules: Array.from(moduleMap.values()),
      },
    });
  } catch (error) {
    console.error('getCourseById error:', error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
