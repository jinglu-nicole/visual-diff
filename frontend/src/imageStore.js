/**
 * [WHO]: 提供 saveImages / loadImages / deleteImages — IndexedDB 图片存取
 * [FROM]: 无外部依赖，纯浏览器 IndexedDB API
 * [TO]: App.jsx 在保存/查看/删除历史记录时调用
 * [HERE]: frontend/src/imageStore.js — 大图存储层，与 localStorage 历史元数据配合
 */

const DB_NAME = 'visual-diff-images'
const DB_VERSION = 1
const STORE_NAME = 'previews'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * 保存一组图片到 IndexedDB
 * @param {string} taskId
 * @param {{ artPreview: string|null, gamePreview: string|null }} images
 */
export async function saveImages(taskId, images) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(images, taskId)
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // IndexedDB 不可用时静默失败
  }
}

/**
 * 从 IndexedDB 加载图片
 * @param {string} taskId
 * @returns {Promise<{ artPreview: string|null, gamePreview: string|null }|null>}
 */
export async function loadImages(taskId) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(taskId)
    const result = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return result
  } catch {
    return null
  }
}

/**
 * 从 IndexedDB 删除图片
 * @param {string} taskId
 */
export async function deleteImages(taskId) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(taskId)
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // 静默
  }
}
