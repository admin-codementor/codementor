const crypto = require('crypto');
const { canManageOwnedBy } = require('../middleware/role.middleware');
const userRepo = require('../repositories/userRepository');
const classroomRepo = require('../repositories/classroomRepository');

// Unambiguous alphabet (no 0/O/1/I) for human-typeable join codes.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const makeCode = (len = 6) => {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
};

const generateUniqueCode = async () => {
  for (let i = 0; i < 8; i++) {
    const code = makeCode(6);
    if (!(await classroomRepo.isJoinCodeTaken(code))) return code;
  }
  // Extremely unlikely fallback
  return makeCode(8);
};

// ── Faculty: create a classroom ────────────────────────────────────────────────
exports.createClassroom = async (req, res) => {
  try {
    const { name, department, section } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Class name is required' });
    }
    if (name.trim().length > 120) {
      return res.status(400).json({ success: false, error: 'Class name must be ≤ 120 characters.' });
    }
    const joinCode = await generateUniqueCode();
    const c = await classroomRepo.create({
      facultyId: req.user.id, name: name.trim(),
      department: department?.trim() || null, section: section?.trim()?.toUpperCase() || null,
      joinCode,
    });
    res.status(201).json({ success: true, data: { ...c, join_code: c.joinCode, member_count: 0 } });
  } catch (e) {
    console.error('Create classroom error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── List classrooms (role-aware) ───────────────────────────────────────────────
exports.listClassrooms = async (req, res) => {
  try {
    // 'hod' used to fall through to the student branch here, so an HOD's class
    // list came back empty (they are enrolled in nothing). Staff see their own
    // classes; admin/HOD see all of them for oversight (decision D1).
    const isStaff = ['faculty', 'admin', 'hod'].includes(req.user.role);
    if (isStaff) {
      const seesAll = req.user.role === 'admin' || req.user.role === 'hod';
      const classrooms = seesAll
        ? await classroomRepo.listAll()
        : await classroomRepo.listByFacultyId(req.user.id);
      const data = await Promise.all(classrooms.map(async (c) => ({
        ...c, join_code: c.joinCode, member_count: await classroomRepo.getMemberCount(c.id),
      })));
      return res.json({ success: true, data });
    }
    // Student: classrooms they've joined
    const classrooms = await classroomRepo.listByStudentId(req.user.id);
    const usersMap = await userRepo.getAllUsersMap();
    const data = classrooms.map(c => ({
      id: c.id, name: c.name, department: c.department, section: c.section,
      created_at: c.createdAt, faculty_id: c.facultyId, joined_at: c.joinedAt,
      faculty_name: usersMap.get(c.facultyId)?.name || 'Unknown',
    }));
    res.json({ success: true, data });
  } catch (e) {
    console.error('List classrooms error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Student: join by code ──────────────────────────────────────────────────────
exports.joinClassroom = async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ success: false, error: 'Join code is required' });

    const c = await classroomRepo.getByJoinCode(code);
    if (!c) return res.status(404).json({ success: false, error: 'Invalid join code' });
    const facultyProfile = await userRepo.getById(c.facultyId, 'faculty');
    const facultyName = facultyProfile?.name || 'Unknown';

    await classroomRepo.addMember(c.id, req.user.id);
    res.json({ success: true, data: { id: c.id, name: c.name, faculty_name: facultyName } });
  } catch (e) {
    console.error('Join classroom error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Faculty: members of a classroom ────────────────────────────────────────────
exports.getMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const classroom = await classroomRepo.getById(id);
    if (!classroom || !(await canManageOwnedBy(req, classroom.facultyId))) {
      return res.status(404).json({ success: false, error: 'Classroom not found' });
    }

    const members = await classroomRepo.listMembers(id);
    const usersMap = await userRepo.getAllUsersMap();
    const data = members.map(m => {
      const profile = usersMap.get(m.userId) || {};
      return {
        id: m.userId, name: profile.name || 'Unknown', email: profile.email || null,
        roll_no: profile.rollNo || null, department: profile.department || null, section: profile.section || null,
        joined_at: m.joinedAt,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, data });
  } catch (e) {
    console.error('Classroom members error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
