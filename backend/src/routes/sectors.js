const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/sectors (대분류 + 하위 분야 + 디바이스별 on/off 상태)
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.group_name, s.group_order, s.display_order, s.name,
              EXISTS(
                SELECT 1 FROM \`Device_Sector_Subscription\` d
                WHERE d.device_id = ? AND d.sector_id = s.id
              ) AS is_on
       FROM \`Sectors\` s
       ORDER BY s.group_order, s.display_order`,
      [req.deviceId]
    );

    const groupMap = new Map();
    for (const row of rows) {
      if (!groupMap.has(row.group_name)) groupMap.set(row.group_name, []);
      groupMap.get(row.group_name).push({
        id: row.id,
        name: row.name,
        isOn: !!row.is_on,
      });
    }

    res.json({
      groups: Array.from(groupMap.entries()).map(([groupName, sectors]) => ({
        groupName,
        sectors,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sectors/:id/subscriptions (개별 분야 스위치 켜기)
router.post('/:id/subscriptions', async (req, res, next) => {
  try {
    await pool.query(
      `INSERT INTO \`Device_Sector_Subscription\` (device_id, sector_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE sector_id = sector_id`,
      [req.deviceId, req.params.id]
    );
    res.status(201).json({ sectorId: Number(req.params.id), on: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/sectors/:id/subscriptions (개별 분야 스위치 끄기)
router.delete('/:id/subscriptions', async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM `Device_Sector_Subscription` WHERE device_id = ? AND sector_id = ?',
      [req.deviceId, req.params.id]
    );
    res.json({ sectorId: Number(req.params.id), on: false });
  } catch (err) {
    next(err);
  }
});

// POST /api/sectors/groups/:groupName/subscriptions (대분류 일괄 켜기)
router.post('/groups/:groupName/subscriptions', async (req, res, next) => {
  const { groupName } = req.params;
  try {
    const [sectors] = await pool.query(
      'SELECT id FROM `Sectors` WHERE group_name = ?',
      [groupName]
    );
    if (sectors.length === 0) {
      return res.status(404).json({
        error_code: 'RESOURCE_NOT_FOUND',
        message: '존재하지 않는 대분류입니다.',
      });
    }

    const values = sectors.map((s) => [req.deviceId, s.id]);
    await pool.query(
      `INSERT INTO \`Device_Sector_Subscription\` (device_id, sector_id) VALUES ?
       ON DUPLICATE KEY UPDATE sector_id = sector_id`,
      [values]
    );

    res.status(201).json({ groupName, sectorIds: sectors.map((s) => s.id) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/sectors/groups/:groupName/subscriptions (대분류 일괄 끄기)
router.delete('/groups/:groupName/subscriptions', async (req, res, next) => {
  const { groupName } = req.params;
  try {
    const [sectors] = await pool.query(
      'SELECT id FROM `Sectors` WHERE group_name = ?',
      [groupName]
    );
    if (sectors.length === 0) {
      return res.status(404).json({
        error_code: 'RESOURCE_NOT_FOUND',
        message: '존재하지 않는 대분류입니다.',
      });
    }

    const ids = sectors.map((s) => s.id);
    const [result] = await pool.query(
      'DELETE FROM `Device_Sector_Subscription` WHERE device_id = ? AND sector_id IN (?)',
      [req.deviceId, ids]
    );

    res.json({ groupName, deletedCount: result.affectedRows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
