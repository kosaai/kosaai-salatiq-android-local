"""Run the actual bundled model on the host (not an Android/device test).

Requires ai-edge-litert and numpy. Does not infer or change class order.
"""
import hashlib
from pathlib import Path

from ai_edge_litert.interpreter import Interpreter
import numpy as np

root = Path(__file__).resolve().parent.parent
model = root / "android/app/src/main/assets/salatiq_yolo26n_cls_fp16.tflite"
interpreter = Interpreter(model_path=str(model), num_threads=2)
interpreter.allocate_tensors()
input_tensor = interpreter.get_input_details()[0]
output_tensor = interpreter.get_output_details()[0]
assert input_tensor["dtype"] == np.float32 and input_tensor["shape"].tolist() == [1, 224, 224, 3]
assert output_tensor["dtype"] == np.float32 and output_tensor["shape"].tolist() == [1, 4]
assert any(t["dtype"] == np.float16 for t in interpreter.get_tensor_details())
ops = [op["op_name"] for op in interpreter._get_ops_details() if op["op_name"] != "DELEGATE"]
assert ops[-1] == "SOFTMAX"
for value in [0.0, 0.5, 1.0]:
    interpreter.set_tensor(input_tensor["index"], np.full((1, 224, 224, 3), value, dtype=np.float32))
    interpreter.invoke()
    scores = interpreter.get_tensor(output_tensor["index"])[0]
    assert np.isfinite(scores).all() and abs(float(scores.sum()) - 1) < 1e-4
    pose = ["BOWING", "PROSTRATING", "SITTING", "STANDING"][int(scores.argmax())]
    print("Actual model smoke inference:", pose, scores.tolist())
print("Verified FP16 weights, FLOAT32 NHWC input, FLOAT32 output and terminal Softmax.")
print("Bundled source SHA256:", hashlib.sha256(model.read_bytes()).hexdigest())
