const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

// List all users in company
router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    where: { companyId: req.user.companyId },
    select: {
      id: true, email: true, firstName: true, lastName: true, phone: true,
      jobTitle: true, role: true, isActive: true, createdAt: true,
      permissions: { include: { orgUnit: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
});

// Activate/deactivate user
router.patch('/:id/status', async (req, res) => {
  const { isActive } = req.body;
  const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  await prisma.user.update({ where: { id: req.params.id }, data: { isActive } });
  res.json({ message: `User ${isActive ? 'activated' : 'deactivated'}` });
});

// Delete user
router.delete('/:id', async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });

  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ message: 'User deleted' });
});

// Update permissions
router.put('/:id/permissions', async (req, res) => {
  const { permissions } = req.body; // [{ orgUnitId, canView, canUpload, canDelete }]
  const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Delete existing and recreate
  await prisma.userPermission.deleteMany({ where: { userId: req.params.id } });

  if (permissions && permissions.length > 0) {
    await prisma.userPermission.createMany({
      data: permissions.map((p) => ({
        userId: req.params.id,
        orgUnitId: p.orgUnitId,
        canView: !!p.canView,
        canUpload: !!p.canUpload,
        canDelete: !!p.canDelete,
      })),
    });
  }

  res.json({ message: 'Permissions updated' });
});

module.exports = router;
