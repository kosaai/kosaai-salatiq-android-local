package com.kosaai.classification

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LocalClassificationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LocalClassification")

    AsyncFunction("checkAvailability") {
      val context = requireNotNull(appContext.reactContext)
      context.assets.openFd(PoseClassifier.MODEL_ASSET).use { asset ->
        require(asset.length > 0) { "Bundled classification model is empty" }
      }
      context.assets.open(PoseClassifier.MODEL_ASSET).use { stream ->
        val header = ByteArray(8)
        require(stream.read(header) == 8 && String(header, 4, 4, Charsets.US_ASCII) == "TFL3") {
          "Bundled asset is not a TFLite model"
        }
      }
      true
    }

    View(LocalClassificationView::class) {
      Events("onCameraReady", "onPrediction", "onMountError")
      Prop("facing") { view: LocalClassificationView, facing: String -> view.setFacing(facing) }
      Prop("inferenceEnabled") { view: LocalClassificationView, enabled: Boolean ->
        view.setInferenceEnabled(enabled)
      }
      Prop("sessionId") { view: LocalClassificationView, sessionId: Int -> view.setSessionId(sessionId) }
      OnViewDidUpdateProps { view: LocalClassificationView -> view.updateCamera() }
      OnViewDestroys { view: LocalClassificationView -> view.destroy() }
    }
  }
}
