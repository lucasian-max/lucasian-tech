#!/usr/bin/env python3
"""Synthesize the lucasian.tech studio ambient loop.

The loop is built circularly: every note, pad and texture is written with
wrap-around tails, so the last sample flows into the first with no click and no
crossfade artefact.  A slow Rhodes-like progression in D major (Dmaj9 -> Bm9 ->
Gmaj9 -> A6/9) is layered under a soft sub pad, sparse bell accents and a very
quiet band-limited tape hiss, then gently low-passed and peak-normalised to
-3 dBFS before being encoded to a 128 kbps stereo MP3.

Only the Python standard library is used for synthesis; ffmpeg does the encode.
"""

from __future__ import annotations

import array
import json
import math
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import wave

SR = 44100
DURATION = 48.0
N = int(round(SR * DURATION))
SEGMENT = DURATION / 4.0  # one chord per 12 seconds

TABLE_SIZE = 4096
TABLE_MASK = TABLE_SIZE - 1
TWO_PI = math.pi * 2.0

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
OUT_DIR = os.path.join(PROJECT, "assets", "audio")
OUT_MP3 = os.path.join(OUT_DIR, "studio-ambient.mp3")
FFMPEG = "/usr/bin/ffmpeg" if os.path.exists("/usr/bin/ffmpeg") else shutil.which("ffmpeg")
FFPROBE = "/usr/bin/ffprobe" if os.path.exists("/usr/bin/ffprobe") else shutil.which("ffprobe")

# D major, slow and warm.  MIDI note numbers.
CHORDS = (
    {"name": "Dmaj9", "notes": (50, 54, 57, 61, 64), "bass": 38},   # D  F# A  C# E
    {"name": "Bm9",   "notes": (47, 50, 54, 57, 61), "bass": 35},   # B  D  F# A  C#
    {"name": "Gmaj9", "notes": (43, 50, 54, 57, 59), "bass": 43},   # G  D  F# A  B
    {"name": "A6/9",  "notes": (45, 49, 52, 54, 59), "bass": 33},   # A  C# E  F# B
)

# Equal-power stereo placement per chord voice, mirrored on alternate chords.
PANS = (-0.38, 0.22, -0.08, 0.34, -0.48)

BELLS = (
    # (time seconds, MIDI note, gain, pan)
    (2.6, 74, 0.075, -0.42),
    (8.3, 81, 0.060, 0.46),
    (14.1, 78, 0.070, -0.30),
    (20.7, 86, 0.050, 0.40),
    (26.3, 83, 0.062, -0.50),
    (31.7, 88, 0.045, 0.30),
    (35.4, 76, 0.068, 0.42),
    (40.9, 81, 0.055, -0.36),
    (46.2, 74, 0.070, 0.30),
)


def midi_to_hz(note: int) -> float:
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


_tables: dict[tuple[str, int, int], array.array] = {}


def wavetable(kind: str, note: int, side: int) -> array.array:
    """Single-cycle table for one pitch.  Cached per timbre/pitch/channel."""
    key = (kind, note, side)
    cached = _tables.get(key)
    if cached is not None:
        return cached

    kind_seed = {"rhodes": 11, "bell": 23, "pad": 37, "sine": 51}.get(kind, 61)
    rng = random.Random(7919 * (note + 12) + 104729 * side + kind_seed)
    if kind == "rhodes":
        partials = ((1.0, 1.00), (2.0, 0.30), (3.0, 0.125), (4.0, 0.052),
                    (5.0, 0.026), (6.0, 0.013))
    elif kind == "bell":
        partials = ((1.0, 1.00), (2.76, 0.26), (5.40, 0.09))
    elif kind == "pad":
        partials = ((1.0, 1.00), (2.0, 0.10), (3.0, 0.035))
    else:  # pure sine
        partials = ((1.0, 1.00),)

    phases = [rng.random() * TWO_PI for _ in partials]
    norm = sum(amp for _, amp in partials)
    table = array.array("d", bytes(8 * TABLE_SIZE))
    for i in range(TABLE_SIZE):
        phase = TWO_PI * i / TABLE_SIZE
        value = 0.0
        for (ratio, amp), offset in zip(partials, phases):
            value += amp * math.sin(phase * ratio + offset)
        table[i] = value / norm

    _tables[key] = table
    return table


_bell_tables: dict[tuple[int, int], array.array] = {}


def bell_table(note: int, side: int) -> array.array:
    # Bells need a little more sparkle than the Rhodes table set.
    key = (note, side)
    cached = _bell_tables.get(key)
    if cached is not None:
        return cached
    rng = random.Random(31337 * (note + 7) + 17 * side)
    ratios = (1.0, 2.76, 5.40)
    amps = (1.0, 0.26, 0.09)
    phases = [rng.random() * TWO_PI for _ in ratios]
    norm = sum(amps)
    table = array.array("d", bytes(8 * TABLE_SIZE))
    for i in range(TABLE_SIZE):
        phase = TWO_PI * i / TABLE_SIZE
        value = 0.0
        for ratio, amp, offset in zip(ratios, amps, phases):
            value += amp * math.sin(phase * ratio + offset)
        table[i] = value / norm
    _bell_tables[key] = table
    return table


def pan_gains(pan: float) -> tuple[float, float]:
    theta = (max(-1.0, min(1.0, pan)) + 1.0) * math.pi / 4.0
    return math.cos(theta), math.sin(theta)


def add_tone(
    left: list[float],
    right: list[float],
    start: float,
    note: int,
    timbre: str,
    gain: float,
    decay: float,
    attack: float,
    pan: float,
    ring: float,
    release: float = 0.7,
    detune: float = 0.00045,
) -> None:
    """Add one decaying, stereo-spread note with a smooth attack and release."""
    if timbre == "bell":
        table_l = bell_table(note, 0)
        table_r = bell_table(note, 1)
    else:
        table_l = wavetable(timbre, note, 0)
        table_r = wavetable(timbre, note, 1)

    freq = midi_to_hz(note)
    step_l = freq * (1.0 - detune) * TABLE_SIZE / SR
    step_r = freq * (1.0 + detune) * TABLE_SIZE / SR
    rng = random.Random(int(start * 1000) + note * 31)
    phase_l = rng.random() * TABLE_SIZE
    phase_r = rng.random() * TABLE_SIZE

    total = int(ring * SR)
    attack_n = max(1, int(attack * SR))
    release_n = max(1, int(release * SR))
    release_start = max(attack_n, total - release_n)
    decay_step = math.exp(-1.0 / (decay * SR))
    gl, gr = pan_gains(pan)
    gl *= gain
    gr *= gain

    index = int(round(start * SR)) % N
    env = 0.0
    for s in range(total):
        if s < attack_n:
            env = s / attack_n
        else:
            env *= decay_step
        if s >= release_start:
            # Equal-power-ish fade over the final release window.
            remain = total - s
            window = math.sin(0.5 * math.pi * remain / release_n) ** 2
            env_now = env * window
        else:
            env_now = env
        env_now_r = env_now

        il = int(phase_l)
        fl = phase_l - il
        sl = table_l[il & TABLE_MASK]
        sl += (table_l[(il + 1) & TABLE_MASK] - sl) * fl

        ir = int(phase_r)
        fr = phase_r - ir
        sr = table_r[ir & TABLE_MASK]
        sr += (table_r[(ir + 1) & TABLE_MASK] - sr) * fr

        j = index + s
        if j >= N:
            j -= N
        left[j] += sl * env_now
        right[j] += sr * env_now_r

        phase_l += step_l
        if phase_l >= TABLE_SIZE:
            phase_l -= TABLE_SIZE
        phase_r += step_r
        if phase_r >= TABLE_SIZE:
            phase_r -= TABLE_SIZE


def add_pad(
    left: list[float],
    right: list[float],
    start: float,
    note: int,
    gain: float,
    pan: float,
    duration: float = SEGMENT,
    attack: float = 2.6,
    release: float = 1.8,
) -> None:
    """Soft sustained sine pad with a long breath in and out."""
    table_l = wavetable("pad", note, 0)
    table_r = wavetable("pad", note, 1)
    freq = midi_to_hz(note)
    step_l = freq * 0.9997 * TABLE_SIZE / SR
    step_r = freq * 1.0003 * TABLE_SIZE / SR
    rng = random.Random(note * 977 + int(start))
    phase_l = rng.random() * TABLE_SIZE
    phase_r = rng.random() * TABLE_SIZE
    total = int(duration * SR)
    attack_n = max(1, int(attack * SR))
    release_n = max(1, int(release * SR))
    release_start = max(attack_n, total - release_n)
    gl, gr = pan_gains(pan)
    gl *= gain
    gr *= gain
    index = int(round(start * SR)) % N

    for s in range(total):
        if s < attack_n:
            w = math.sin(0.5 * math.pi * s / attack_n) ** 2
        elif s > release_start:
            w = math.sin(0.5 * math.pi * (total - s) / release_n) ** 2
        else:
            w = 1.0

        il = int(phase_l)
        fl = phase_l - il
        vl = table_l[il & TABLE_MASK]
        vl += (table_l[(il + 1) & TABLE_MASK] - vl) * fl

        ir = int(phase_r)
        fr = phase_r - ir
        vr = table_r[ir & TABLE_MASK]
        vr += (table_r[(ir + 1) & TABLE_MASK] - vr) * fr

        j = index + s
        if j >= N:
            j -= N
        left[j] += vl * gl * w
        right[j] += vr * gr * w

        phase_l += step_l
        if phase_l >= TABLE_SIZE:
            phase_l -= TABLE_SIZE
        phase_r += step_r
        if phase_r >= TABLE_SIZE:
            phase_r -= TABLE_SIZE


def add_tape_air(left: list[float], right: list[float]) -> None:
    """Very quiet, band-limited hiss with slow drift, written circularly."""
    rng_l = random.Random(2004)
    rng_r = random.Random(2005)
    fast = 0.30
    slow = 0.012
    fast_l = slow_l = 0.0
    fast_r = slow_r = 0.0
    # Pre-roll the filters so the seam is at steady state.
    for _ in range(2):
        for i in range(N):
            noise_l = rng_l.uniform(-1.0, 1.0)
            noise_r = rng_r.uniform(-1.0, 1.0)
            fast_l += fast * (noise_l - fast_l)
            slow_l += slow * (noise_l - slow_l)
            fast_r += fast * (noise_r - fast_r)
            slow_r += slow * (noise_r - slow_r)
            if _ == 1:
                t = i / SR
                drift = 0.0032 + 0.0016 * (0.5 + 0.5 * math.sin(TWO_PI * t / 16.0))
                left[i] += (fast_l - slow_l) * drift
                right[i] += (fast_r - slow_r) * drift


def one_pole_lowpass(buf: list[float], cutoff_hz: float) -> None:
    """Gentle warm rolloff, run twice so the loop seam stays continuous."""
    alpha = 1.0 - math.exp(-TWO_PI * cutoff_hz / SR)
    y = 0.0
    for _ in range(2):
        if _ == 1:
            for i in range(N):
                y += alpha * (buf[i] - y)
                buf[i] = y
        else:
            for i in range(N):
                y += alpha * (buf[i] - y)


def build() -> tuple[list[float], list[float]]:
    left = [0.0] * N
    right = [0.0] * N

    # Rhodes chords: two soft strikes per 12-second chord.
    for chord_index, chord in enumerate(CHORDS):
        base = chord_index * SEGMENT
        for strike, (offset, gain) in enumerate(((0.00, 0.52), (6.10, 0.38))):
            for voice, note in enumerate(chord["notes"]):
                pan = PANS[voice] if chord_index % 2 == 0 else -PANS[voice]
                # A tiny strum keeps the attacks from feeling machine-stacked.
                stagger = 0.012 * voice + 0.006 * strike
                add_tone(
                    left,
                    right,
                    base + offset + stagger + 0.004 * math.sin(voice * 1.7),
                    note,
                    "rhodes",
                    gain * (0.94 + 0.06 * math.sin(voice + chord_index)),
                    decay=2.9,
                    attack=0.018,
                    pan=pan,
                    ring=8.6,
                    release=0.9,
                )

        # Sub pad + a quiet root octave for body.
        add_pad(left, right, base, chord["bass"], gain=0.070, pan=-0.10,
                duration=SEGMENT, attack=2.7, release=1.9)
        add_pad(left, right, base, chord["notes"][0], gain=0.034, pan=0.16,
                duration=SEGMENT, attack=3.1, release=2.0)

    for t, note, gain, pan in BELLS:
        add_tone(left, right, t, note, "bell", gain, decay=1.9, attack=0.006,
                 pan=pan, ring=4.2, release=1.1, detune=0.0002)

    add_tape_air(left, right)

    for buf in (left, right):
        one_pole_lowpass(buf, 6400.0)

    # Remove any DC offset before peak-normalising.
    for buf in (left, right):
        mean = sum(buf) / N
        if mean:
            for i in range(N):
                buf[i] -= mean

    # Peak-normalise; no compression, so the loop keeps its gentle dynamics.
    peak = max(max(abs(v) for v in left), max(abs(v) for v in right))
    if peak <= 0.0:
        raise RuntimeError("Synthesis produced silence")
    target = 10.0 ** (-3.0 / 20.0)  # -3 dBFS
    scale = target / peak
    rng = random.Random(99)
    for buf in (left, right):
        for i in range(N):
            # Triangular dither at half an LSB keeps the quiet tail smooth.
            buf[i] = buf[i] * scale + (rng.random() - rng.random()) / 65536.0

    return left, right


def write_wav(path: str, left: list[float], right: list[float]) -> None:
    pcm = array.array("h")
    append = pcm.append
    for l, r in zip(left, right):
        append(int(max(-1.0, min(1.0, l)) * 32767.0))
        append(int(max(-1.0, min(1.0, r)) * 32767.0))
    with wave.open(path, "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(SR)
        handle.writeframes(pcm.tobytes())


def encode(wav_path: str) -> None:
    if not FFMPEG:
        raise RuntimeError("ffmpeg not found")
    os.makedirs(OUT_DIR, exist_ok=True)
    command = [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
        "-i", wav_path,
        "-c:a", "libmp3lame", "-b:a", "128k",
        "-ar", str(SR), "-ac", "2",
        "-map_metadata", "-1",
        "-metadata", "title=Midnight Desk",
        "-metadata", "artist=Studio Ambient",
        "-metadata", "album=lucasian.tech",
        OUT_MP3,
    ]
    subprocess.run(command, check=True)


def probe() -> dict:
    if not FFPROBE:
        raise RuntimeError("ffprobe not found")
    result = subprocess.run(
        [FFPROBE, "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", OUT_MP3],
        check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout)


def volume_stats() -> tuple[float, float]:
    """Return (mean, max) volume in dBFS using ffmpeg volumedetect."""
    if not FFMPEG:
        raise RuntimeError("ffmpeg not found")
    result = subprocess.run(
        [FFMPEG, "-hide_banner", "-nostats", "-i", OUT_MP3,
         "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    text = result.stderr
    mean_match = re.search(r"mean_volume:\s*(-?[\d.]+) dB", text)
    max_match = re.search(r"max_volume:\s*(-?[\d.]+) dB", text)
    if not mean_match or not max_match:
        raise RuntimeError("Could not read volumedetect output")
    return float(mean_match.group(1)), float(max_match.group(1))


def verify() -> None:
    info = probe()
    streams = info.get("streams", [])
    if not streams:
        raise RuntimeError("No audio stream in encoded file")
    stream = streams[0]
    duration = float(info.get("format", {}).get("duration", 0.0))
    size = os.path.getsize(OUT_MP3)
    mean_db, max_db = volume_stats()

    checks = {
        "codec": stream.get("codec_name") == "mp3",
        "channels": stream.get("channels") == 2,
        "sample rate": int(stream.get("sample_rate", 0)) == SR,
        "duration 45-50s": 45.0 <= duration <= 50.0,
        "under 900 KB": size < 900 * 1024,
        "non-silent": mean_db > -35.0,
        "peak <= -2.5 dBFS": max_db <= -2.5,
    }
    for label, ok in checks.items():
        print(f"  {'ok ' if ok else 'FAIL'} {label}")
    if not all(checks.values()):
        raise RuntimeError("Encoded MP3 failed verification")

    print(f"  codec={stream.get('codec_name')} channels={stream.get('channels')} "
          f"rate={stream.get('sample_rate')} duration={duration:.3f}s")
    print(f"  size={size} bytes ({size / 1024:.1f} KB) "
          f"mean={mean_db:.1f} dBFS peak={max_db:.1f} dBFS")


def main() -> int:
    print("Synthesizing studio ambient loop ...")
    left, right = build()

    seam_l = abs(left[0] - left[-1])
    seam_r = abs(right[0] - right[-1])
    avg_step_l = sum(abs(left[i] - left[i - 1]) for i in range(1, 10000)) / 9999
    avg_step_r = sum(abs(right[i] - right[i - 1]) for i in range(1, 10000)) / 9999
    print(f"  seam step L={seam_l:.6f} (avg {avg_step_l:.6f}), "
          f"R={seam_r:.6f} (avg {avg_step_r:.6f})")
    if seam_l > 4.0 * avg_step_l or seam_r > 4.0 * avg_step_r:
        raise RuntimeError("Loop seam is not continuous")

    fd, wav_path = tempfile.mkstemp(prefix="studio-ambient-", suffix=".wav")
    os.close(fd)
    try:
        write_wav(wav_path, left, right)
        encode(wav_path)
    finally:
        os.unlink(wav_path)

    print(f"Wrote {OUT_MP3}")
    verify()
    return 0


if __name__ == "__main__":
    sys.exit(main())
