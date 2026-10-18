"""
Builds the formula-recognition model shipped in vendor/models/mfr from Pix2Text MFR 1.5
(MIT, https://huggingface.co/breezedeus/pix2text-mfr-1.5): int8 weights (4x smaller,
same accuracy on our samples) and the vocabulary as a plain list for the browser decoder.

Usage (in a virtual environment):  pip install onnx onnxruntime && python scripts/build-ocr-model.py
"""
import json
import os
import urllib.request

from onnxruntime.quantization import QuantType, quantize_dynamic

REPO = 'breezedeus/pix2text-mfr-1.5'
REVISION = '1cef9f0bdcd6a4c63df7de1311fb0894593340cc'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.models', 'mfr')
OUT = os.path.join(ROOT, 'vendor', 'models', 'mfr')


def fetch(name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        urllib.request.urlretrieve(f'https://huggingface.co/{REPO}/resolve/{REVISION}/{name}', path)
    return path


os.makedirs(OUT, exist_ok=True)
for name in ('encoder_model', 'decoder_model'):
    quantize_dynamic(fetch(f'{name}.onnx'), os.path.join(OUT, f'{name.split("_")[0]}.int8.onnx'), weight_type=QuantType.QInt8)

# id -> token string (byte-level BPE symbols, decoded in src/ocr/tokenizer.ts)
tok = json.load(open(fetch('tokenizer.json'), encoding='utf-8'))
vocab = {**tok['model']['vocab'], **{t['content']: t['id'] for t in tok['added_tokens']}}
tokens = [''] * (max(vocab.values()) + 1)
for s, i in vocab.items():
    tokens[i] = s
with open(os.path.join(OUT, 'vocab.json'), 'w', encoding='utf-8') as f:
    json.dump(tokens, f, ensure_ascii=False, separators=(',', ':'))
print('written to', OUT)
