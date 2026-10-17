// A student's own portfolio (routes mount under /api/student/portfolio). Every
// read and write is scoped to the caller: an item id from someone else is a 404.
const portfolioRepo = require('../repositories/portfolioRepository');
const { validateItem, MAX_ITEMS_PER_STUDENT } = require('../utils/portfolio');

const shape = (i) => ({
  id: i.id, type: i.type, title: i.title, detail: i.detail || '', date: i.date || null, link: i.link || null,
  created_at: i.createdAt?.toDate?.()?.toISOString() ?? null,
});

// @route GET /api/student/portfolio
exports.list = async (req, res) => {
  try {
    res.json({ success: true, data: (await portfolioRepo.listByUser(req.user.id)).map(shape) });
  } catch (error) {
    console.error('List portfolio error:', error);
    res.status(500).json({ success: false, error: 'Failed to load your portfolio.' });
  }
};

// @route POST /api/student/portfolio  body { type, title, detail?, date?, link? }
exports.create = async (req, res) => {
  try {
    const v = validateItem(req.body);
    if (v.error) return res.status(400).json({ success: false, error: v.error });
    const existing = await portfolioRepo.listByUser(req.user.id);
    if (existing.length >= MAX_ITEMS_PER_STUDENT) {
      return res.status(400).json({ success: false, error: `You can keep at most ${MAX_ITEMS_PER_STUDENT} portfolio entries.` });
    }
    const item = await portfolioRepo.create(req.user.id, v.item);
    res.status(201).json({ success: true, data: shape(item) });
  } catch (error) {
    console.error('Create portfolio item error:', error);
    res.status(500).json({ success: false, error: 'Failed to save the entry.' });
  }
};

async function ownItem(req, res) {
  const item = await portfolioRepo.getById(req.params.id);
  // Someone else's item looks exactly like a missing one.
  if (!item || item.userId !== req.user.id) {
    res.status(404).json({ success: false, error: 'Entry not found.' });
    return null;
  }
  return item;
}

// @route PATCH /api/student/portfolio/:id  (full replacement of the editable fields)
exports.update = async (req, res) => {
  try {
    const item = await ownItem(req, res);
    if (!item) return;
    const v = validateItem({ type: item.type, ...req.body });
    if (v.error) return res.status(400).json({ success: false, error: v.error });
    res.json({ success: true, data: shape(await portfolioRepo.update(item.id, v.item)) });
  } catch (error) {
    console.error('Update portfolio item error:', error);
    res.status(500).json({ success: false, error: 'Failed to update the entry.' });
  }
};

// @route DELETE /api/student/portfolio/:id
exports.remove = async (req, res) => {
  try {
    const item = await ownItem(req, res);
    if (!item) return;
    await portfolioRepo.remove(item.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete portfolio item error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete the entry.' });
  }
};

exports.shape = shape;
