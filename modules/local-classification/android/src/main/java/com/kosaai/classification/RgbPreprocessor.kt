package com.kosaai.classification

import java.nio.ByteBuffer
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.roundToInt

/** Ultralytics classify_transforms(224): PIL bilinear Resize + CenterCrop + /255.
 * Separable, scale-aware triangle filtering supplies antialiasing on downscales.
 * Crop coordinates use Python/torchvision's round-to-even convention.
 */
class RgbPreprocessor {
  private data class Tap(val start: Int, val weights: FloatArray)
  private var width = 0
  private var height = 0
  private var horizontal = ByteArray(0)
  private var xTaps = emptyArray<Tap>()
  private var yTaps = emptyArray<Tap>()

  fun writeInput(rgb: ByteArray, sourceWidth: Int, sourceHeight: Int, input: ByteBuffer) {
    require(sourceWidth > 0 && sourceHeight > 0 && rgb.size >= sourceWidth * sourceHeight * 3)
    if (width != sourceWidth || height != sourceHeight) {
      width = sourceWidth
      height = sourceHeight
      val resizedWidth = if (width <= height) 224 else (224L * width / height).toInt()
      val resizedHeight = if (height <= width) 224 else (224L * height / width).toInt()
      val left = Math.rint((resizedWidth - 224) / 2.0).toInt()
      val top = Math.rint((resizedHeight - 224) / 2.0).toInt()
      xTaps = taps(width, resizedWidth, left)
      yTaps = taps(height, resizedHeight, top)
      horizontal = ByteArray(height * 224 * 3)
    }

    // PIL RGB resizing rounds to uint8 after each separable pass.
    for (y in 0 until height) {
      for (x in 0 until 224) {
        val tap = xTaps[x]
        for (channel in 0..2) {
          var sum = 0f
          for (i in tap.weights.indices) {
            sum += (rgb[(y * width + tap.start + i) * 3 + channel].toInt() and 255) * tap.weights[i]
          }
          horizontal[(y * 224 + x) * 3 + channel] = sum.roundToInt().coerceIn(0, 255).toByte()
        }
      }
    }
    input.rewind()
    for (y in 0 until 224) {
      val tap = yTaps[y]
      for (x in 0 until 224) {
        for (channel in 0..2) {
          var sum = 0f
          for (i in tap.weights.indices) {
            sum += (horizontal[((tap.start + i) * 224 + x) * 3 + channel].toInt() and 255) * tap.weights[i]
          }
          input.putFloat(sum.roundToInt().coerceIn(0, 255) / 255f)
        }
      }
    }
    input.rewind() // FLOAT32 NHWC, RGB interleaved, batch size one.
  }

  private fun taps(sourceSize: Int, resizedSize: Int, cropStart: Int): Array<Tap> {
    val scale = sourceSize.toDouble() / resizedSize
    val support = max(1.0, scale)
    return Array(224) { index ->
      val center = (cropStart + index + 0.5) * scale
      val start = max(0, floor(center - support + 0.5).toInt())
      val end = ceil(center + support - 0.5).toInt().coerceIn(start + 1, sourceSize)
      val weights = FloatArray(end - start) { i ->
        max(0.0, 1.0 - abs((start + i + 0.5 - center) / support)).toFloat()
      }
      val total = weights.sum()
      for (i in weights.indices) weights[i] /= total
      Tap(start, weights)
    }
  }
}
