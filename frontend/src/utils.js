/**
 * [WHO]: 提供 imageToBase64, getMediaType, extractDominantColors
 * [FROM]: 无外部依赖，纯浏览器 API (Canvas, FileReader)
 * [TO]: analyzer.js 使用
 * [HERE]: frontend/src/utils.js — 替代 Python 版 utils.py
 */

/**
 * 将 File 对象转为 base64 字符串（不含 data:... 前缀）
 */
export function imageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // reader.result = "data:image/png;base64,xxxx..."
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 从 File 对象获取 media type
 */
export function getMediaType(file) {
  const typeMap = {
    'image/png': 'image/png',
    'image/jpeg': 'image/jpeg',
    'image/gif': 'image/gif',
    'image/webp': 'image/webp',
  }
  return typeMap[file.type] || 'image/jpeg'
}

/**
 * 用 Canvas API 提取图片主色调（替代 Python PIL 的 quantize）
 * 返回格式："#AABBCC、#DDEEFF、..."
 */
export function extractDominantColors(file, n = 12) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const size = 120
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, size, size)
        const imageData = ctx.getImageData(0, 0, size, size).data

        // 简易中位切分量化
        const pixels = []
        for (let i = 0; i < imageData.length; i += 4) {
          pixels.push([imageData[i], imageData[i + 1], imageData[i + 2]])
        }
        const colors = medianCut(pixels, n)
        const hexColors = colors.map(([r, g, b]) =>
          `#${r.toString(16).padStart(2, '0').toUpperCase()}${g.toString(16).padStart(2, '0').toUpperCase()}${b.toString(16).padStart(2, '0').toUpperCase()}`
        )
        resolve(hexColors.join('、'))
      } catch (e) {
        reject(e)
      }
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('图片加载失败'))
    }
    img.src = URL.createObjectURL(file)
  })
}

/**
 * 中位切分算法 — 将像素列表量化为 n 种颜色
 */
function medianCut(pixels, n) {
  if (pixels.length === 0) return []

  let buckets = [pixels]

  while (buckets.length < n) {
    // 找到范围最大的 bucket 来切分
    let maxRange = -1
    let maxIdx = 0
    let maxChannel = 0

    for (let i = 0; i < buckets.length; i++) {
      for (let ch = 0; ch < 3; ch++) {
        const vals = buckets[i].map(p => p[ch])
        const range = Math.max(...vals) - Math.min(...vals)
        if (range > maxRange) {
          maxRange = range
          maxIdx = i
          maxChannel = ch
        }
      }
    }

    if (maxRange === 0) break

    const bucket = buckets.splice(maxIdx, 1)[0]
    bucket.sort((a, b) => a[maxChannel] - b[maxChannel])
    const mid = Math.floor(bucket.length / 2)
    buckets.push(bucket.slice(0, mid), bucket.slice(mid))
  }

  // 每个 bucket 取均值
  return buckets.map(bucket => {
    const avg = [0, 0, 0]
    for (const p of bucket) {
      avg[0] += p[0]; avg[1] += p[1]; avg[2] += p[2]
    }
    return avg.map(v => Math.round(v / bucket.length))
  })
}
