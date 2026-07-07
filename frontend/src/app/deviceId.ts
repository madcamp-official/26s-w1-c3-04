// deviceId.ts (새 파일)
function getOrCreateDeviceId(): string {
  const KEY = 'device_uuid';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
export const DEVICE_ID = getOrCreateDeviceId();