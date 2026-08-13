const userRepo = require('../repositories/userRepository');

exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `User role '${req.user ? req.user.role : 'Unknown'}' is not authorized to access this route`
      });
    }
    next();
  };
};

/**
 * The three roles that share the faculty console. HOD used to be missing from
 * every route outside /api/faculty/*, so an HOD saw Classes / MCQ / Import in the
 * nav but every action 403'd — which reads as a dead button, not a permission
 * error. Use this instead of spelling the list out per route.
 */
exports.facultyStaff = exports.authorize('faculty', 'admin', 'hod');

/**
 * May the requester modify a resource created by someone else?
 *   admin   → anything
 *   owner   → their own, always
 *   HOD     → anything owned by staff in their own department
 *   faculty → nothing beyond their own
 * `ownerDepartment` is the creator's department (null when unknown).
 */
exports.canManageResource = (req, ownerId, ownerDepartment) => {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  if (req.user.id === ownerId) return true;
  if (req.user.role === 'hod') {
    return req.user.department != null && (ownerDepartment ?? null) === req.user.department;
  }
  return false;
};

/**
 * Async companion to canManageResource for call sites that only know the owner's
 * id. Resolves the owner's department only when it can actually change the answer
 * (i.e. an HOD acting on someone else's resource), so the common paths stay
 * read-free.
 */
exports.canManageOwnedBy = async (req, ownerId) => {
  if (!req.user) return false;
  if (req.user.role === 'admin' || req.user.id === ownerId) return true;
  if (req.user.role !== 'hod') return false;
  const owner = await userRepo.getById(ownerId, 'faculty');
  return exports.canManageResource(req, ownerId, owner?.department ?? null);
};

/**
 * Department scope for analytics. Admin sees everything (returns null); HOD and
 * faculty are restricted to their own department. Returns the department string to
 * filter by, or null for "no restriction".
 */
exports.scopeDept = (req) => (req.user?.role === 'admin' ? null : (req.user?.department ?? null));

/** True when the requester may view data for the given department. */
exports.canSeeDepartment = (req, department) =>
  req.user?.role === 'admin' || (req.user?.department ?? null) === (department ?? null);
