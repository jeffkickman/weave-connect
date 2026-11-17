#!/usr/bin/env python3
"""Generate Weave Time PNG icons (no dependencies). Run at Pages deploy time:
   python3 tools/make-icons.py  ->  icons/icon-192.png, icons/icon-512.png, icons/apple-touch-icon.png
Design: navy square, gold clock ring with two hands (full-bleed so it is maskable-safe)."""
import math, os, struct, zlib

NAVY = (11, 31, 58)
GOLD = (196, 163, 90)
PAPER = (244, 239, 230)

def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

def cov(d, half):  # anti-aliased coverage for a shape whose edge is at distance `half`
    return max(0.0, min(1.0, half - d + 0.5))

def mix(c1, c2, a):
    return tuple(round(c1[i] * (1 - a) + c2[i] * a) for i in range(3))

def render(n):
    s = n / 512.0
    cx = cy = n / 2.0
    R, ring = 150 * s, 13 * s           # ring radius / half-width
    hands = [((cx, cy), (cx, cy - 105 * s), 13 * s, PAPER),   # hour hand to 12
             ((cx, cy), (cx + 85 * s, cy + 40 * s), 11 * s, GOLD)]
    rows = []
    for y in range(n):
        row = bytearray([0])
        for x in range(n):
            px, py = x + 0.5, y + 0.5
            c = NAVY
            c = mix(c, GOLD, cov(abs(math.hypot(px - cx, py - cy) - R), ring))
            for (a, b, w, col) in hands:
                c = mix(c, col, cov(seg_dist(px, py, a[0], a[1], b[0], b[1]), w))
            c = mix(c, GOLD, cov(math.hypot(px - cx, py - cy), 18 * s))
            row += bytes(c)
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

if __name__ == '__main__':
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
    os.makedirs(root, exist_ok=True)
    for name, n in (('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)):
        with open(os.path.join(root, name), 'wb') as f:
            f.write(render(n))
        print('wrote icons/' + name)
