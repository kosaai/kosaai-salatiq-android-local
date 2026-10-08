package com.kosaai.classification

import android.content.Context
import androidx.camera.core.ImageProxy
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel

/** Owned and called exclusively by the camera's single background executor. */
class PoseClassifier(context: Context) : AutoCloseable {
  companion object {
    const val MODEL_ASSET = "salatiq_yolo26n_cls_fp16.tflite"
    // Authoritative original model.names order. Never derive from metadata.
    val POSES = arrayOf("BOWING", "PROSTRATING", "SITTING", "STANDING")
  }

  private val input = ByteBuffer.allocateDirect(224 * 224 * 3 * 4).order(ByteOrder.nativeOrder())
  private val output = ByteBuffer.allocateDirect(4 * 4).order(ByteOrder.nativeOrder())
  private val preprocessor = FramePreprocessor()
  private val interpreter: Interpreter

  init {
    val model = context.assets.openFd(MODEL_ASSET).use { asset ->
      FileInputStream(asset.fileDescriptor).use { stream ->
        stream.channel.map(FileChannel.MapMode.READ_ONLY, asset.startOffset, asset.declaredLength)
      }
    }
    val candidate = Interpreter(model, Interpreter.Options().setNumThreads(2).setUseXNNPACK(true))
    try {
      val inTensor = candidate.getInputTensor(0)
      val outTensor = candidate.getOutputTensor(0)
      require(inTensor.dataType() == DataType.FLOAT32 && inTensor.shape().contentEquals(intArrayOf(1, 224, 224, 3))) {
        "Expected FLOAT32 NHWC [1,224,224,3] input"
      }
      require(outTensor.dataType() == DataType.FLOAT32 && outTensor.shape().contentEquals(intArrayOf(1, 4))) {
        "Expected FLOAT32 [1,4] Softmax output"
      }
      interpreter = candidate
    } catch (error: Exception) {
      candidate.close()
      throw error
    }
  }

  fun classify(frame: ImageProxy): Pair<String, Float> {
    preprocessor.writeInput(frame, input)
    output.rewind()
    interpreter.run(input, output)
    output.rewind()
    var bestIndex = 0
    var bestScore = Float.NEGATIVE_INFINITY
    for (index in POSES.indices) {
      val score = output.float
      require(score.isFinite()) { "Non-finite classification output" }
      if (score > bestScore) {
        bestIndex = index
        bestScore = score
      }
    }
    // The model already applies Softmax. No second Softmax or confidence gate.
    return POSES[bestIndex] to bestScore
  }

  override fun close() = interpreter.close()
}
