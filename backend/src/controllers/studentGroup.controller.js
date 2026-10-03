// Custom student groups and mixed-branch batches (review feedback item 6).
//
// Scoping rule, matching the rest of the faculty console: admin sees and edits
// every group; an HOD sees groups whose owner is in their department; faculty
// see their own plus any group shared with them read-only. A group may contain
// students from any branch — that is the point — but you can only ADD students
// you are allowed to see, so an HOD cannot quietly build a roster of another
// department's students.
const groupRepo = require('../repositories/studentGroupRepository');
const userRepo = require('../repositories/userRepository');
const { canManageResource, scopeDept } = require('../middleware/role.middleware');
const { logAction } = require('../middleware/audit');

const MAX_MEMBERS = 2000;
const MAX_NAME = 120;

/** Students this requester may put in a group: admin = everyone, otherwise own department. */
async function visibleStudents(req) {
  const dept = scopeDept(req);
  const all = [...(await userRepo.getMapByRole('student')).values()];
  return dept === null ? all : all.filter((s) => (s.department || null) === dept);
}

async function canEdit(req, group) {
  const owner = group.createdBy ? await userRepo.getById(group.createdBy, 'faculty') : null;
  return canManageResource(req, group.createdBy, owner?.department ?? null);
}

/** Groups this requester may see: admin all, HOD/faculty their own department's. */
async function listVisible(req) {
  const [groups, staff] = await Promise.all([groupRepo.listAll(), userRepo.getMapByRole('faculty')]);
  const dept = scopeDept(req);
  return groups.filter((g) => {
    if (dept === null) return true;
    if (g.createdBy === req.user.id) return true;
    return (staff.get(g.createdBy)?.department ?? null) === dept;
  });
}

const shape = (g, staffMap) => ({
  id: g.id,
  name: g.name,
  description: g.description || '',
  student_ids: g.studentIds || [],
  student_count: (g.studentIds || []).length,
  created_by: g.createdBy || null,
  owner_name: staffMap.get(g.createdBy)?.name || null,
  created_at: g.createdAt?.toDate?.()?.toISOString() ?? null,
});

// @route GET /api/faculty/groups
exports.listGroups = async (req, res) => {
  try {
    const [groups, staffMap] = await Promise.all([listVisible(req), userRepo.getMapByRole('faculty')]);
    const data = await Promise.all(groups.map(async (g) => ({
      ...shape(g, staffMap),
      can_edit: await canEdit(req, g),
    })));
    res.json({ success: true, data });
  } catch (error) {
    console.error('List groups error:', error);
    res.status(500).json({ success: false, error: 'Failed to load groups.' });
  }
};

// @route GET /api/faculty/groups/:id — group with its members expanded.
exports.getGroup = async (req, res) => {
  try {
    const group = await groupRepo.getById(req.params.id);
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });

    const dept = scopeDept(req);
    const studentsMap = await userRepo.getMapByRole('student');
    // Members outside the viewer's department are counted but not listed, so an
    // HOD sees "3 students from other departments" rather than their names.
    const members = [];
    let hidden = 0;
    for (const id of group.studentIds || []) {
      const s = studentsMap.get(id);
      if (!s) continue;
      if (dept !== null && (s.department || null) !== dept) { hidden += 1; continue; }
      members.push({
        id: s.id, name: s.name || 'Unknown', roll_no: s.rollNo || null,
        department: s.department || null, section: s.section || null, year: s.year || null,
      });
    }
    members.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const staffMap = await userRepo.getMapByRole('faculty');
    res.json({
      success: true,
      data: { ...shape(group, staffMap), can_edit: await canEdit(req, group), members, hidden_member_count: hidden },
    });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ success: false, error: 'Failed to load group.' });
  }
};

/** Students the requester may choose from, for the group builder. */
// @route GET /api/faculty/groups-candidates
exports.listCandidates = async (req, res) => {
  try {
    const students = await visibleStudents(req);
    const data = students
      .map((s) => ({
        id: s.id, name: s.name || 'Unknown', roll_no: s.rollNo || null,
        department: s.department || null, section: s.section || null, year: s.year || null,
      }))
      .sort((a, b) => (a.department || '').localeCompare(b.department || '')
        || (a.section || '').localeCompare(b.section || '')
        || (a.name || '').localeCompare(b.name || ''));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Group candidates error:', error);
    res.status(500).json({ success: false, error: 'Failed to load students.' });
  }
};

/** Keeps only ids that exist AND the requester may see — never trusts the body. */
async function sanitizeMembers(req, studentIds) {
  const ids = Array.isArray(studentIds) ? [...new Set(studentIds.map(String))] : [];
  if (ids.length > MAX_MEMBERS) return { error: `A group can hold at most ${MAX_MEMBERS} students.` };
  if (ids.length === 0) return { studentIds: [] };
  const allowed = new Set((await visibleStudents(req)).map((s) => s.id));
  const rejected = ids.filter((id) => !allowed.has(id));
  if (rejected.length) {
    return { error: `${rejected.length} selected student(s) are outside what you can manage.` };
  }
  return { studentIds: ids };
}

// @route POST /api/faculty/groups
exports.createGroup = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name || name.length > MAX_NAME) {
      return res.status(400).json({ success: false, error: `Name is required and must be ≤ ${MAX_NAME} characters.` });
    }
    const members = await sanitizeMembers(req, req.body.student_ids);
    if (members.error) return res.status(400).json({ success: false, error: members.error });

    const group = await groupRepo.create({
      name,
      description: String(req.body.description || '').trim().slice(0, 500),
      studentIds: members.studentIds,
      createdBy: req.user.id,
    });
    logAction(req, 'group.create', `"${name}" (${members.studentIds.length} students)`);
    const staffMap = await userRepo.getMapByRole('faculty');
    res.status(201).json({ success: true, data: { ...shape(group, staffMap), can_edit: true } });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ success: false, error: 'Failed to create group.' });
  }
};

// @route PATCH /api/faculty/groups/:id
exports.updateGroup = async (req, res) => {
  try {
    const group = await groupRepo.getById(req.params.id);
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    if (!(await canEdit(req, group))) {
      return res.status(403).json({ success: false, error: 'You cannot edit this group.' });
    }

    const partial = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name || name.length > MAX_NAME) {
        return res.status(400).json({ success: false, error: `Name is required and must be ≤ ${MAX_NAME} characters.` });
      }
      partial.name = name;
    }
    if (req.body.description !== undefined) {
      partial.description = String(req.body.description).trim().slice(0, 500);
    }
    if (req.body.student_ids !== undefined) {
      const members = await sanitizeMembers(req, req.body.student_ids);
      if (members.error) return res.status(400).json({ success: false, error: members.error });
      // Members the editor cannot see are preserved, not silently dropped: an HOD
      // editing a cross-branch batch must not erase another department's students.
      const dept = scopeDept(req);
      let preserved = [];
      if (dept !== null) {
        const studentsMap = await userRepo.getMapByRole('student');
        preserved = (group.studentIds || []).filter((id) => {
          const s = studentsMap.get(id);
          return s && (s.department || null) !== dept;
        });
      }
      partial.studentIds = [...new Set([...members.studentIds, ...preserved])];
    }

    const updated = await groupRepo.update(req.params.id, partial);
    logAction(req, 'group.update', `"${updated.name}" (${(updated.studentIds || []).length} students)`);
    const staffMap = await userRepo.getMapByRole('faculty');
    res.json({ success: true, data: { ...shape(updated, staffMap), can_edit: true } });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ success: false, error: 'Failed to update group.' });
  }
};

// @route DELETE /api/faculty/groups/:id
exports.deleteGroup = async (req, res) => {
  try {
    const group = await groupRepo.getById(req.params.id);
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    if (!(await canEdit(req, group))) {
      return res.status(403).json({ success: false, error: 'You cannot delete this group.' });
    }
    await groupRepo.remove(req.params.id);
    logAction(req, 'group.delete', `"${group.name}"`);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete group.' });
  }
};

exports.MAX_MEMBERS = MAX_MEMBERS;
