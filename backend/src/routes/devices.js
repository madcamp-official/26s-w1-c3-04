const express = require('express');
const router = express.Router();

// POST /api/devices
// deviceAuth 미들웨어가 이미 upsert를 처리하므로, 여기서는 결과만 반환한다.
router.post('/', (req, res) => {
  res.status(201).json({
    deviceId: req.deviceId,
    deviceUuid: req.deviceUuid,
  });
});

module.exports = router;
