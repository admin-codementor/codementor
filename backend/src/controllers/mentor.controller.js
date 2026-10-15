// Mentor mapping for HOD/admin (routes mount under /api/faculty/mentors).
const mentorService = require('../services/mentorService');
const { logAction } = require('../middleware/audit');

// @route GET /api/faculty/mentors?period=monthly|overall
exports.listMentors = async (req, res) => {
  try {
    res.json({ success: true, data: await mentorService.getBoard(req, req.query.period) });
  } catch (error) {
    console.error('List mentors error:', error);
    res.status(500).json({ success: false, error: 'Failed to load mentors.' });
  }
};

// @route PUT /api/faculty/mentors/assign  body { mentor_id: string|null, student_ids: string[] }
// A null mentor_id removes the mentor from the chosen students.
exports.assignMentees = async (req, res) => {
  try {
    const mentorId = req.body?.mentor_id == null || req.body.mentor_id === '' ? null : String(req.body.mentor_id);
    const result = await mentorService.assign(req, { mentorId, studentIds: req.body?.student_ids });
    if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });
    logAction(req, 'mentor.assign', `${result.updated} student(s) → ${result.mentorName ?? 'no mentor'}`);
    res.json({ success: true, data: { updated: result.updated } });
  } catch (error) {
    console.error('Assign mentees error:', error);
    res.status(500).json({ success: false, error: 'Failed to assign mentees.' });
  }
};
