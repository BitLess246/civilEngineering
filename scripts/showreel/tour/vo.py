# Piper narration, one clip per script line → audio/vo_<id>.f32 (48 kHz mono) + audio/vo.json durations.
#   python3 vo.py [voice=lessac]
import json, os, subprocess, sys
import numpy as np
R = os.path.dirname(os.path.abspath(__file__))
VOICES = os.environ.get('PIPER_VOICES', '/tmp/claude-0/-home-user-civilEngineering/a814ac4c-ce38-5d46-80c9-b1e9213b9e70/scratchpad/piper-voices')
voice = sys.argv[1] if len(sys.argv) > 1 else 'lessac'
FF = subprocess.check_output([sys.executable, '-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
os.makedirs(f'{R}/audio', exist_ok=True)
out = {}
for s in json.load(open(f'{R}/script.json')):
    raw, clip = f'{R}/audio/vo_{s["id"]}.raw.wav', f'{R}/audio/vo_{s["id"]}.f32'
    subprocess.run([sys.executable, '-m', 'piper', '-m', f'{VOICES}/en_US-{voice}-high.onnx', '--length-scale', '1.0', '--sentence-silence', '0.2', '-f', raw], input=s['text'], text=True, check=True, capture_output=True)
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', raw, '-ar', '48000', '-ac', '1', '-af',
                    'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse', '-f', 'f32le', clip], check=True)
    out[s['id']] = round(len(np.fromfile(clip, dtype=np.float32)) / 48000, 3)
    print(s['id'], out[s['id']], 's')
json.dump(out, open(f'{R}/audio/vo.json', 'w'), indent=1)
print('total speech', round(sum(out.values()), 1), 's')
