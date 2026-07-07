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
 * Department scope for analytics. Admin sees everything (returns null); HOD and
 * faculty are restricted to their own department. Returns the department string to
 * filter by, or null for "no restriction".
 */
exports.scopeDept = (req) => (req.user?.role === 'admin' ? null : (req.user?.department ?? null));

/** True when the requester may view data for the given department. */
exports.canSeeDepartment = (req, department) =>
  req.user?.role === 'admin' || (req.user?.department ?? null) === (department ?? null);
