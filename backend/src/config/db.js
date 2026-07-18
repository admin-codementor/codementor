const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Utility to run queries
const query = (text, params) => pool.query(text, params);

const scaffoldDatabase = async () => {
  try {
    // Scaffold Users Table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'student',
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP DEFAULT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Add permissions column (JSONB) — stores per-faculty capability flags.
    // Uses ADD COLUMN IF NOT EXISTS so it's safe to run on existing DBs.
    await query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}';
    `);

    // Scaffold Problems Table
    await query(`
      CREATE TABLE IF NOT EXISTS problems (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        difficulty VARCHAR(10),
        tags TEXT[],
        created_by UUID REFERENCES users(id),
        time_limit INTEGER DEFAULT 2,
        memory_limit INTEGER DEFAULT 256,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Add created_at if it's missing (for existing databases)
    try {
      await query(`ALTER TABLE problems ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();`);
    } catch (e) {
      console.log('Column created_at might already exist or error altering table:', e.message);
    }

    // Add stubs column — JSONB map of language_id (number) → starter code string.
    await query(`
      ALTER TABLE problems
        ADD COLUMN IF NOT EXISTS stubs JSONB NOT NULL DEFAULT '{}';
    `);

    // Scoring mode: 'acm' (binary, penalty-based) or 'oi' (partial score per test case).
    await query(`
      ALTER TABLE problems
        ADD COLUMN IF NOT EXISTS scoring_mode VARCHAR(3) NOT NULL DEFAULT 'acm';
    `);
    await query(`
      ALTER TABLE problems
        ADD COLUMN IF NOT EXISTS max_score INTEGER NOT NULL DEFAULT 100;
    `);

    // Scaffold Test Cases Table (essential for judging)
    await query(`
      CREATE TABLE IF NOT EXISTS test_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
        input_data TEXT NOT NULL,
        expected_output TEXT NOT NULL,
        is_public BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Scaffold Submissions Table
    await query(`
      CREATE TABLE IF NOT EXISTS code_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        problem_id UUID REFERENCES problems(id),
        code TEXT NOT NULL,
        language VARCHAR(20),
        verdict VARCHAR(20),
        runtime INTEGER,
        memory INTEGER,
        submitted_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Per-test-case score used in OI mode (evenly split if all 0).
    // (Runs AFTER test_cases & code_submissions exist — order matters on a fresh DB.)
    await query(`
      ALTER TABLE test_cases
        ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0;
    `);
    // Store the final score (OI partial) alongside each submission.
    await query(`
      ALTER TABLE code_submissions
        ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT NULL;
    `);
    // Per-test-case pass/fail array (ordered) — powers the faculty concept heatmap.
    await query(`
      ALTER TABLE code_submissions
        ADD COLUMN IF NOT EXISTS test_results JSONB DEFAULT NULL;
    `);
    // Indexes for profile/analytics stats (period + verdict breakdowns) — keep
    // per-user time-ranged and verdict-grouped queries fast at scale.
    await query(`CREATE INDEX IF NOT EXISTS idx_submissions_user_time ON code_submissions (user_id, submitted_at DESC);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_submissions_user_verdict ON code_submissions (user_id, verdict);`);

    // Scaffold Assignments Table
    await query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        faculty_id UUID REFERENCES users(id),
        title VARCHAR(200) NOT NULL,
        deadline TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Add allowed_cidrs column for IP restriction (exam mode)
    await query(`
      ALTER TABLE assignments
        ADD COLUMN IF NOT EXISTS allowed_cidrs TEXT[] NOT NULL DEFAULT '{}';
    `);

    // Mark an assignment as a proctored exam (vs. normal assignment / practice)
    await query(`
      ALTER TABLE assignments
        ADD COLUMN IF NOT EXISTS is_exam BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // Scaffold Assignment Problems Table
    await query(`
      CREATE TABLE IF NOT EXISTS assignment_problems (
        assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
        problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
        PRIMARY KEY (assignment_id, problem_id)
      );
    `);

    // Tag graded code submissions with the assignment/exam they were made under, so
    // "My Submissions" can show only assessed work (assignment_id IS NOT NULL) rather
    // than every practice run. NULL = free practice. (Added after `assignments` for FK.)
    await query(`
      ALTER TABLE code_submissions
        ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL;
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_submissions_user_assignment ON code_submissions (user_id, assignment_id);`);

    // Scaffold AI Tutor Conversations Table
    await query(`
      CREATE TABLE IF NOT EXISTS ai_tutor_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Scaffold Student Topic Mastery Table
    await query(`
      CREATE TABLE IF NOT EXISTS student_topic_mastery (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        topic VARCHAR(50) NOT NULL,
        solved_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        hint_usage_count INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, topic)
      );
    `);

    // ── Courses → modules → problems (module-based catalogue) ──
    // Mirrors the assignments/assignment_problems grouping pattern. A course groups
    // ordered modules (subcategories like "Arrays" or "TCS Programs"); each module
    // maps to problems many-to-many. Progress is derived from accepted submissions —
    // no separate progress table.
    await query(`
      CREATE TABLE IF NOT EXISTS courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(200) NOT NULL,
        description TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_published BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS course_modules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(120) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS module_problems (
        module_id UUID REFERENCES course_modules(id) ON DELETE CASCADE,
        problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (module_id, problem_id)
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_course_modules_course ON course_modules(course_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_module_problems_module ON module_problems(module_id);`);

    // Scaffold Contests Table
    await query(`
      CREATE TABLE IF NOT EXISTS contests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        faculty_id UUID REFERENCES users(id),
        title VARCHAR(200) NOT NULL,
        description TEXT,
        starts_at TIMESTAMP NOT NULL,
        ends_at TIMESTAMP NOT NULL,
        -- 'public'  = live updates visible to all
        -- 'frozen'  = scoreboard frozen at freeze_at, live updates hidden from students
        -- 'hidden'  = scoreboard never shown to students during contest
        scoreboard_mode VARCHAR(10) NOT NULL DEFAULT 'public',
        freeze_at TIMESTAMP DEFAULT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Scaffold Contest Problems Table
    await query(`
      CREATE TABLE IF NOT EXISTS contest_problems (
        contest_id UUID REFERENCES contests(id) ON DELETE CASCADE,
        problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (contest_id, problem_id)
      );
    `);

    // Scaffold Contest Registrations Table
    await query(`
      CREATE TABLE IF NOT EXISTS contest_registrations (
        contest_id UUID REFERENCES contests(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        registered_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (contest_id, user_id)
      );
    `);

    // Scaffold Contest Submissions Table (separate from code_submissions for penalty tracking)
    await query(`
      CREATE TABLE IF NOT EXISTS contest_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contest_id UUID REFERENCES contests(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id),
        problem_id UUID REFERENCES problems(id),
        verdict VARCHAR(20),
        score INTEGER DEFAULT 0,
        penalty_minutes INTEGER DEFAULT 0,
        submitted_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS contest_subs_contest_idx
        ON contest_submissions (contest_id);
    `);

    // Feature 6: Virtual participation
    await query(`
      CREATE TABLE IF NOT EXISTS virtual_participations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contest_id UUID REFERENCES contests(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        started_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (contest_id, user_id)
      );
    `);

    // Mark contest_submissions as virtual (for virtual participation runs)
    await query(`
      ALTER TABLE contest_submissions
        ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await query(`
      ALTER TABLE contest_submissions
        ADD COLUMN IF NOT EXISTS virtual_elapsed_minutes INTEGER DEFAULT NULL;
    `);

    // Feature 7: Auto-publishing editorials on problems
    await query(`
      ALTER TABLE problems
        ADD COLUMN IF NOT EXISTS editorial TEXT DEFAULT NULL;
    `);
    await query(`
      ALTER TABLE problems
        ADD COLUMN IF NOT EXISTS editorial_visible_at TIMESTAMP DEFAULT NULL;
    `);

    // Pass C: randomized test generation (generator + reference solution)
    await query(`ALTER TABLE problems ADD COLUMN IF NOT EXISTS generator_code TEXT DEFAULT NULL;`);
    await query(`ALTER TABLE problems ADD COLUMN IF NOT EXISTS generator_language_id INTEGER DEFAULT NULL;`);
    await query(`ALTER TABLE problems ADD COLUMN IF NOT EXISTS reference_code TEXT DEFAULT NULL;`);
    await query(`ALTER TABLE problems ADD COLUMN IF NOT EXISTS reference_language_id INTEGER DEFAULT NULL;`);

    // Feature 12: Special judge / custom checker
    await query(`ALTER TABLE problems ADD COLUMN IF NOT EXISTS uses_checker BOOLEAN NOT NULL DEFAULT FALSE;`);
    await query(`ALTER TABLE problems ADD COLUMN IF NOT EXISTS checker_code TEXT DEFAULT NULL;`);
    await query(`ALTER TABLE problems ADD COLUMN IF NOT EXISTS checker_language_id INTEGER DEFAULT NULL;`);

    // Pass F0: academic metadata (enables class/section/department analytics + departmental leaderboards)
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(60) DEFAULT NULL;`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS section VARCHAR(20) DEFAULT NULL;`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS year INTEGER DEFAULT NULL;`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS roll_no VARCHAR(40) DEFAULT NULL;`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP DEFAULT NULL;`);

    // Feature 14: 2FA (TOTP) + Google OAuth
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT DEFAULT NULL;`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT DEFAULT NULL;`);

    // Phase 1: Firebase Auth migration
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE DEFAULT NULL;`);

    // Phase 2: Postgres no longer verifies passwords — Firebase owns that entirely.
    await query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;`);

    // Feature 15: Elo-style contest rating
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT 1200;`);
    await query(`
      CREATE TABLE IF NOT EXISTS rating_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        contest_id UUID REFERENCES contests(id) ON DELETE CASCADE,
        old_rating INTEGER,
        new_rating INTEGER,
        rank INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS rating_history_user_idx ON rating_history (user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS rating_history_contest_idx ON rating_history (contest_id);`);

    // Scaffold Proctor Events (exam integrity: tab-switch, fullscreen exit, paste, etc.)
    await query(`
      CREATE TABLE IF NOT EXISTS proctor_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        assignment_id UUID,
        problem_id UUID,
        event_type VARCHAR(40) NOT NULL,
        detail TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS proctor_events_assignment_idx ON proctor_events (assignment_id);`);

    // Scaffold Classrooms + join codes (faculty create a class → students enroll by code)
    await query(`
      CREATE TABLE IF NOT EXISTS classrooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        faculty_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        department VARCHAR(60),
        section VARCHAR(20),
        join_code VARCHAR(12) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS classroom_members (
        classroom_id UUID REFERENCES classrooms(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (classroom_id, user_id)
      );
    `);

    // Scaffold Plagiarism Results Table
    await query(`
      CREATE TABLE IF NOT EXISTS plagiarism_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
        student_a UUID REFERENCES users(id),
        student_b UUID REFERENCES users(id),
        similarity NUMERIC(5,2) NOT NULL,
        language VARCHAR(20),
        ran_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS plagiarism_results_assignment_idx
        ON plagiarism_results (assignment_id);
    `);

    // Audit log — accountability trail for sensitive faculty/admin actions.
    await query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(60) NOT NULL,
        detail TEXT,
        ip VARCHAR(64),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
    `);

    // ── MCQ / Aptitude assessment module ──────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS mcq_tests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        faculty_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        category VARCHAR(40) DEFAULT 'aptitude',
        duration_minutes INT DEFAULT 30,
        is_published BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS mcq_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        test_id UUID REFERENCES mcq_tests(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        options JSONB NOT NULL,
        correct_index INT NOT NULL,
        marks INT DEFAULT 1,
        topic VARCHAR(60),
        explanation TEXT,
        position INT DEFAULT 0
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS mcq_questions_test_idx ON mcq_questions (test_id);`);
    await query(`
      CREATE TABLE IF NOT EXISTS mcq_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        test_id UUID REFERENCES mcq_tests(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        started_at TIMESTAMP DEFAULT NOW(),
        submitted_at TIMESTAMP,
        score INT,
        total INT,
        responses JSONB,
        UNIQUE (test_id, user_id)
      );
    `);

    // ── External coding-profile aggregation (LeetCode / Codeforces / etc.) ────--
    await query(`
      CREATE TABLE IF NOT EXISTS coding_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        platform VARCHAR(20) NOT NULL,
        handle VARCHAR(80) NOT NULL,
        solved INT DEFAULT 0,
        rating INT,
        max_rating INT,
        extra JSONB,
        sync_status VARCHAR(20) DEFAULT 'pending',
        last_synced TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (user_id, platform)
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS coding_profiles_user_idx ON coding_profiles (user_id);`);

    console.log('✅ Database tables initialized successfully.');
  } catch (error) {
    console.error('❌ Failed to initialize database tables:', error);
  }
};

module.exports = {
  query,
  pool,
  scaffoldDatabase,
};
