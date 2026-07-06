const pool = require('../db');

// 모든 요청에 X-Device-Id 헤더(device_uuid)를 요구하고,
// 처음 보는 uuid면 Device row를 자동 생성(upsert)한다.
async function deviceAuth(req, res, next) {
  const deviceUuid = req.header('X-Device-Id');

  if (!deviceUuid) {
    return res.status(400).json({
      error_code: 'DEVICE_ID_MISSING',
      message: 'X-Device-Id 헤더가 필요합니다.',
    });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id FROM `Device` WHERE device_uuid = ?',
      [deviceUuid]
    );

    let deviceId;
    if (rows.length === 0) {
      const [result] = await pool.query(
        'INSERT INTO `Device` (device_uuid, created_at) VALUES (?, NOW())',
        [deviceUuid]
      );
      deviceId = result.insertId;
    } else {
      deviceId = rows[0].id;
    }

    req.deviceId = deviceId;
    req.deviceUuid = deviceUuid;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = deviceAuth;
