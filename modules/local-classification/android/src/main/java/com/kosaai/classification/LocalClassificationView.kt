package com.kosaai.classification

import android.content.Context
import android.os.SystemClock
import android.util.Size
import android.view.Surface
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LiveData
import androidx.lifecycle.Observer
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors

class LocalClassificationView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onCameraReady by EventDispatcher()
  private val onPrediction by EventDispatcher()
  private val onMountError by EventDispatcher()
  private val worker = Executors.newSingleThreadExecutor()
  private val mainExecutor = ContextCompat.getMainExecutor(context)
  private val previewView = PreviewView(context).apply {
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    scaleType = PreviewView.ScaleType.FILL_CENTER
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
  }
  private var provider: ProcessCameraProvider? = null
  private var preview: Preview? = null
  @Volatile private var analysis: ImageAnalysis? = null
  private var cameraState: LiveData<CameraState>? = null
  private var cameraStateObserver: Observer<CameraState>? = null
  private var lifecycleOwner: LifecycleOwner? = null
  private var facing = "front"
  private var boundFacing: String? = null
  private var cameraGeneration = 0
  @Volatile private var inferenceEnabled = false
  @Volatile private var sessionId = 0
  @Volatile private var epoch = 0
  @Volatile private var attached = false
  @Volatile private var foreground = false
  private var destroyed = false
  // Worker-thread-only state:
  private var classifier: PoseClassifier? = null
  private var lastInferenceAt = 0L

  private val lifecycleObserver = LifecycleEventObserver { _, event ->
    if (event == Lifecycle.Event.ON_RESUME) foreground = true
    if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_STOP) {
      foreground = false
      epoch++
      releaseClassifier()
    }
  }

  init { addView(previewView) }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    previewView.measure(widthMeasureSpec, heightMeasureSpec)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    previewView.layout(0, 0, right - left, bottom - top)
  }

  fun setFacing(value: String) {
    if (facing != value) { facing = value; epoch++ }
  }

  fun setSessionId(value: Int) {
    if (sessionId != value) { sessionId = value; epoch++ }
  }

  fun setInferenceEnabled(value: Boolean) {
    if (inferenceEnabled == value) return
    inferenceEnabled = value
    epoch++
    if (!value) releaseClassifier()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    attached = true
    updateCamera()
  }

  override fun onDetachedFromWindow() {
    attached = false
    epoch++
    unbindCamera()
    releaseClassifier()
    super.onDetachedFromWindow()
  }

  fun updateCamera() {
    if (!attached || destroyed || boundFacing == facing) return
    unbindCamera()
    val bindingGeneration = cameraGeneration
    val selectedFacing = facing
    boundFacing = selectedFacing
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (!attached || destroyed || bindingGeneration != cameraGeneration) return@addListener
      try {
        val owner = requireNotNull(appContext.currentActivity as? LifecycleOwner) {
          "Camera requires an Android lifecycle owner"
        }
        lifecycleOwner = owner
        foreground = owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
        owner.lifecycle.addObserver(lifecycleObserver)
        val cameraProvider = future.get()
        provider = cameraProvider
        val resolution = ResolutionSelector.Builder().setResolutionStrategy(
          ResolutionStrategy(Size(640, 480), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER)
        ).build()
        val rotation = display?.rotation ?: Surface.ROTATION_0
        val newPreview = Preview.Builder().setResolutionSelector(resolution).setTargetRotation(rotation).build()
        newPreview.setSurfaceProvider(previewView.surfaceProvider)
        val newAnalysis = ImageAnalysis.Builder()
          .setResolutionSelector(resolution)
          .setTargetRotation(rotation)
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .build()
        preview = newPreview
        analysis = newAnalysis
        newAnalysis.setAnalyzer(worker) { frame ->
          val ticket = epoch
          val frameSession = sessionId
          try {
            val now = SystemClock.elapsedRealtime()
            if (!attached || !foreground || !inferenceEnabled || analysis !== newAnalysis ||
              now - lastInferenceAt < 250L) return@setAnalyzer
            lastInferenceAt = now
            val engine = classifier ?: PoseClassifier(context).also { classifier = it }
            val (pose, confidence) = engine.classify(frame)
            mainExecutor.execute {
              if (attached && foreground && inferenceEnabled && analysis === newAnalysis &&
                ticket == epoch && frameSession == sessionId) {
                onPrediction(mapOf("pose" to pose, "confidence" to confidence, "sessionId" to frameSession))
              }
            }
          } catch (error: Exception) {
            mainExecutor.execute {
              if (attached && ticket == epoch) {
                setInferenceEnabled(false)
                onMountError(mapOf("message" to "تعذرت المعالجة المحلية: ${error.message}"))
              }
            }
          } finally { frame.close() }
        }
        val selector = if (selectedFacing == "front") CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
        val camera = cameraProvider.bindToLifecycle(owner, selector, newPreview, newAnalysis)
        val observer = Observer<CameraState> { state ->
          if (attached && analysis === newAnalysis) {
            if (state.error != null) onMountError(mapOf("message" to "تعذر تشغيل الكاميرا (${state.error?.code})"))
            else if (state.type == CameraState.Type.OPEN) onCameraReady(emptyMap())
          }
        }
        cameraState = camera.cameraInfo.cameraState
        cameraStateObserver = observer
        cameraState?.observe(owner, observer)
      } catch (error: Exception) {
        unbindCamera()
        releaseClassifier()
        onMountError(mapOf("message" to "تعذر تشغيل الكاميرا: ${error.message}"))
      }
    }, mainExecutor)
  }

  private fun unbindCamera() {
    cameraGeneration++
    cameraStateObserver?.let { cameraState?.removeObserver(it) }
    cameraStateObserver = null
    cameraState = null
    analysis?.clearAnalyzer()
    val useCases = listOfNotNull(preview, analysis).toTypedArray()
    if (useCases.isNotEmpty()) provider?.unbind(*useCases)
    lifecycleOwner?.lifecycle?.removeObserver(lifecycleObserver)
    lifecycleOwner = null
    preview = null
    analysis = null
    boundFacing = null
  }

  private fun releaseClassifier() {
    if (!worker.isShutdown) worker.execute {
      classifier?.close()
      classifier = null
      lastInferenceAt = 0L
    }
  }

  fun destroy() {
    if (destroyed) return
    destroyed = true
    attached = false
    epoch++
    unbindCamera()
    releaseClassifier()
    worker.shutdown() // Already queued work/close finishes; never close mid-inference.
  }
}
