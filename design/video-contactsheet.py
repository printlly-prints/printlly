"""Decode physical-device recordings for visual QA, without changing the app.

Usage: python video-contactsheet.py recording.mp4 output.jpg [interval_seconds] [end_seconds]
PyAV may be installed outside the repo at D:/Android/qa-python.
"""
import math
import pathlib
import sys

sys.path.insert(0, 'D:/Android/qa-python')
import av
from PIL import Image, ImageDraw

source, destination = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
interval = float(sys.argv[3]) if len(sys.argv) > 3 else 0.3
end_time = float(sys.argv[4]) if len(sys.argv) > 4 else float('inf')
frames = []
next_time = 0
with av.open(str(source)) as recording:
    stream = recording.streams.video[0]
    for frame in recording.decode(stream):
        time = float(frame.time or 0)
        if time > end_time:
            break
        if time + 0.001 < next_time:
            continue
        image = frame.to_image()
        image.thumbnail((180, 400))
        tile = Image.new('RGB', (180, 424), '#161616')
        tile.paste(image, ((180 - image.width) // 2, 24))
        ImageDraw.Draw(tile).text((6, 5), f'{time:.2f}s', fill='white')
        frames.append(tile)
        next_time = time + interval
columns = min(8, max(1, len(frames)))
sheet = Image.new('RGB', (columns * 180, math.ceil(len(frames) / columns) * 424), '#161616')
for index, frame in enumerate(frames):
    sheet.paste(frame, ((index % columns) * 180, (index // columns) * 424))
destination.parent.mkdir(parents=True, exist_ok=True)
sheet.save(destination, quality=90)
print(f'Decoded {len(frames)} samples to {destination}')
