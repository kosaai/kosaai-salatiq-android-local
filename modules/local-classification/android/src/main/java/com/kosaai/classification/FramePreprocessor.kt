package com.kosaai.classification

import android.graphics.ImageFormat
import androidx.camera.core.ImageProxy
import java.nio.ByteBuffer

/** CameraX YUV planes remain native; no bitmap, JPEG, Base64 or JS pixel copies. */
class FramePreprocessor {
  private var rgb = ByteArray(0)
  private val resize = RgbPreprocessor()

  fun writeInput(frame: ImageProxy, input: ByteBuffer) {
    require(frame.format == ImageFormat.YUV_420_888) { "Expected CameraX YUV_420_888" }
    val crop = frame.cropRect
    val width = crop.width()
    val height = crop.height()
    val rotation = frame.imageInfo.rotationDegrees
    require(rotation in intArrayOf(0, 90, 180, 270)) { "Unsupported camera rotation" }
    val uprightWidth = if (rotation == 90 || rotation == 270) height else width
    val uprightHeight = if (rotation == 90 || rotation == 270) width else height
    if (rgb.size != width * height * 3) rgb = ByteArray(width * height * 3)
    val yPlane = frame.planes[0]
    val uPlane = frame.planes[1]
    val vPlane = frame.planes[2]
    val yBuffer = yPlane.buffer
    val uBuffer = uPlane.buffer
    val vBuffer = vPlane.buffer
    val yOffset = yBuffer.position()
    val uOffset = uBuffer.position()
    val vOffset = vBuffer.position()

    for (y in 0 until height) {
      val sourceY = y + crop.top
      for (x in 0 until width) {
        val sourceX = x + crop.left
        val luma = (yBuffer.get(yOffset + sourceY * yPlane.rowStride + sourceX * yPlane.pixelStride).toInt() and 255) - 16
        val u = (uBuffer.get(uOffset + (sourceY / 2) * uPlane.rowStride + (sourceX / 2) * uPlane.pixelStride).toInt() and 255) - 128
        val v = (vBuffer.get(vOffset + (sourceY / 2) * vPlane.rowStride + (sourceX / 2) * vPlane.pixelStride).toInt() and 255) - 128
        // Standard limited-range BT.601 YUV -> RGB, respecting plane strides.
        val base = 298 * luma.coerceAtLeast(0)
        val r = ((base + 409 * v + 128) shr 8).coerceIn(0, 255)
        val g = ((base - 100 * u - 208 * v + 128) shr 8).coerceIn(0, 255)
        val b = ((base + 516 * u + 128) shr 8).coerceIn(0, 255)
        val target = when (rotation) {
          90 -> (x * uprightWidth + height - 1 - y) * 3
          180 -> ((height - 1 - y) * uprightWidth + width - 1 - x) * 3
          270 -> ((width - 1 - x) * uprightWidth + y) * 3
          else -> (y * uprightWidth + x) * 3
        }
        rgb[target] = r.toByte()
        rgb[target + 1] = g.toByte()
        rgb[target + 2] = b.toByte()
      }
    }
    // Front preview is mirrored by CameraX; inference uses the unmirrored scene.
    resize.writeInput(rgb, uprightWidth, uprightHeight, input)
  }
}
