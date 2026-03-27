const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { paginate } = require('../utils/helpers');

router.use(authenticate);

router.get('/', async (req, res) => {
  const { fileType, status, search, page, limit } = req.query;
  const { skip, take } = paginate(page, limit);

  const where = { companyId: req.user.companyId };
  if (fileType) where.fileType = fileType;
  if (status) where.status = status;
  if (search) where.fileName = { contains: search, mode: 'insensitive' };

  const [records, total] = await Promise.all([
    prisma.uploadHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
    prisma.uploadHistory.count({ where }),
  ]);

  res.json({ records, total, page: Math.floor(skip / take) + 1, totalPages: Math.ceil(total / take) });
});

module.exports = router;
