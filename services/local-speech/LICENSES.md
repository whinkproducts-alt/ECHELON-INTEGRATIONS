# Private speech runtime license notices

The owner approved GPL/LGPL components for this separate private runtime on
2026-11-10. Retain this notice and the licenses embedded in installed Python
distributions and downloaded model assets. Do not copy this exception to the
general Echelon dependency policy.

- faster-whisper: MIT; its PyAV dependency links LGPL FFmpeg components.
- Kokoro: Apache-2.0 package; Misaki English pronunciation depends on GPL
  phonemizer/eSpeak NG and LGPL num2words. Check the exact installed wheel
  metadata before distributing any combined package.
- PyTorch CPU and spaCy are installed only in the private speech container.
- Systran faster-whisper-small.en, hexgrad Kokoro-82M and individual voice
  files are downloaded directly from their official repositories during an
  explicit preparation step. Their repository and voice license terms must be
  reviewed before public redistribution. Model files are never bundled in the
  Echelon source archive.

The private runtime is not a statement that every model or voice permits a
future commercial or public redistribution. Preserve their individual notices.
