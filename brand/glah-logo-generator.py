import math, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FD = "/usr/share/fonts/truetype/google-fonts/"
fonts = {w: TTFont(FD + f"Poppins-{w}.ttf") for w in ("Bold", "Medium", "Regular")}

NAVY, BLUE, BLUE_L, GOLD = "#12294a", "#1a5bb5", "#3d7fd6", "#f3b544"


def text_width(txt, w, size, track=0):
    f = fonts[w]; upm = f["head"].unitsPerEm; cmap = f.getBestCmap(); hm = f["hmtx"]
    s = size / upm
    return sum(hm[cmap[ord(c)]][0] * s for c in txt) + track * (len(txt) - 1)


def text_path(txt, w, size, x, y, track=0):
    """Return SVG path d for txt with baseline at y, starting at x."""
    f = fonts[w]; upm = f["head"].unitsPerEm; cmap = f.getBestCmap()
    gs = f.getGlyphSet(); hm = f["hmtx"]; s = size / upm
    pen = SVGPathPen(gs); cx = x
    for c in txt:
        g = cmap[ord(c)]
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, cx, y)))
        cx += hm[g][0] * s + track
    return pen.getCommands()


def fit_size(txt, w, width, track_em=0):
    # size such that width matches (track proportional to size)
    base = text_width(txt, w, 100, track_em * 100)
    return 100 * width / base


def mark(cx, cy, r, sw, gid="g"):
    """G-shaped sweep whose crossbar ends in a medical cross, gold accent dot."""
    a0 = math.radians(-48)
    sx, sy = cx + r * math.cos(a0), cy + r * math.sin(a0)
    ex, ey = cx + r, cy  # end at 3 o'clock
    th = sw; arm = sw * 1.25  # cross arm half-length, thickness
    ccx = cx - r * 0.02  # cross centre
    bar_end = ccx + arm
    d_g = f"M{sx:.1f},{sy:.1f} A{r},{r} 0 1 0 {ex:.1f},{ey:.1f}"
    h = th / 2; R = h * 0.9
    xr = cx + r + h  # outer right edge
    bar = (f"M{ccx+arm-1:.1f},{cy-h:.1f} H{xr-R:.1f} A{R:.1f},{R:.1f} 0 0 1 {xr:.1f},{cy-h+R:.1f} "
           f"V{cy+h:.1f} H{ccx+arm-1:.1f} Z")
    cross = (f"M{ccx-h:.1f},{cy-arm:.1f} h{th:.1f} v{arm-h:.1f} h{arm-h:.1f} v{th:.1f} "
             f"h{-(arm-h):.1f} v{arm-h:.1f} h{-th:.1f} v{-(arm-h):.1f} h{-(arm-h):.1f} "
             f"v{-th:.1f} h{arm-h:.1f} Z")
    dot_a = math.radians(-20)
    dx, dy = cx + (r + sw * 0.15) * math.cos(dot_a), cy + (r + sw * 0.15) * math.sin(dot_a)
    defs = f'''<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{cx-r:.0f}" y1="{cy-r:.0f}" x2="{cx+r*0.85:.0f}" y2="{cy+r*0.2:.0f}">
      <stop offset="0" stop-color="{BLUE_L}"/><stop offset=".5" stop-color="{BLUE}"/><stop offset="1" stop-color="{NAVY}"/></linearGradient>'''
    body = f'''<path d="{d_g}" fill="none" stroke="url(#{gid})" stroke-width="{sw}" stroke-linecap="round"/>
  <path d="{bar}" fill="{NAVY}"/>
  <path d="{cross}" fill="{NAVY}"/>
  <circle cx="{dx:.1f}" cy="{dy:.1f}" r="{sw*0.42:.1f}" fill="{GOLD}"/>'''
    return defs, body


def mark_wl(cx, cy, r, sw, gid="g", tick="#ffffff", trend=None, cross_c=None, curve=False):
    """G as a measuring tape, descending progress arrow inside, gold medical cross accent."""
    trend = trend or GOLD; cross_c = cross_c or GOLD
    a0 = math.radians(-48)
    sx, sy = cx + r * math.cos(a0), cy + r * math.sin(a0)
    d_g = f"M{sx:.1f},{sy:.1f} A{r},{r} 0 1 0 {cx+r:.1f},{cy:.1f}"
    h = sw / 2; R = h * 0.9; xr = cx + r + h; bx = cx + r * 0.12
    bar = (f"M{bx:.1f},{cy-h:.1f} H{xr-R:.1f} A{R:.1f},{R:.1f} 0 0 1 {xr:.1f},{cy-h+R:.1f} "
           f"V{cy+h:.1f} H{bx+h:.1f} A{h:.1f},{h:.1f} 0 0 1 {bx:.1f},{cy:.1f} Z")
    # tape ticks along the outer edge of the arc
    ticks = []
    i = 0; ang = -60
    while ang > -348:
        a = math.radians(ang); L = sw * (0.55 if i % 4 == 0 else 0.30)
        ro = r + h - sw * 0.06; ri = ro - L
        ticks.append(f'<line x1="{cx+ro*math.cos(a):.1f}" y1="{cy+ro*math.sin(a):.1f}" x2="{cx+ri*math.cos(a):.1f}" y2="{cy+ri*math.sin(a):.1f}"/>')
        ang -= 10; i += 1
    tk = f'<g stroke="{tick}" stroke-width="{sw*0.075:.1f}" stroke-linecap="round" opacity=".9">' + "".join(ticks) + "</g>"
    # descending progress line (top-left inside the G down toward the bar)
    S = lambda x, y: (cx + x * r, cy + y * r)
    p0, c1, c2, p3 = S(-0.50, -0.56), S(-0.40, -0.56), S(-0.30, -0.10), S(-0.03, -0.02)
    d_t = f"M{p0[0]:.1f},{p0[1]:.1f} C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p3[0]:.1f},{p3[1]:.1f}"
    (x1, y1), (x2, y2) = c2, p3
    ang = math.atan2(y2 - y1, x2 - x1); al = sw * 0.55
    def pt(t): return (x2 - al * math.cos(ang + t), y2 - al * math.sin(ang + t))
    pa, pb = pt(0.6), pt(-0.6)
    arrow = f'<path d="M{pa[0]:.1f},{pa[1]:.1f} L{x2:.1f},{y2:.1f} L{pb[0]:.1f},{pb[1]:.1f}" fill="none" stroke="{trend}" stroke-width="{sw*0.28:.1f}" stroke-linecap="round" stroke-linejoin="round"/>'
    tl = f'<path d="{d_t}" fill="none" stroke="{trend}" stroke-width="{sw*0.28:.1f}" stroke-linecap="round" stroke-linejoin="round"/>'
    if curve:
        # user-supplied concept: thick curved arrow sweeping counter-clockwise, head pointing down
        ac = (cx - 0.10 * r, cy + 0.02 * r); ar = 0.46 * r; aw = 0.19 * r
        A0, A1 = math.radians(-48), math.radians(118)  # start upper-right, end lower-left
        P = lambda ang, rad: (ac[0] + rad * math.cos(ang), ac[1] + rad * math.sin(ang))
        s0 = P(A0, ar); e0 = P(A1, ar)
        arcp = f"M{s0[0]:.1f},{s0[1]:.1f} A{ar:.1f},{ar:.1f} 0 1 0 {e0[0]:.1f},{e0[1]:.1f}"
        tl = f'<path d="{arcp}" fill="none" stroke="{trend}" stroke-width="{aw:.1f}" stroke-linecap="butt"/>'
        # arrowhead: tangent direction at A1 going counter-clockwise
        tx, ty = math.sin(A1), -math.cos(A1)
        nx, ny = math.cos(A1), math.sin(A1)
        hw = aw * 1.35; hl = aw * 1.55
        b1 = (e0[0] + nx * hw, e0[1] + ny * hw); b2 = (e0[0] - nx * hw, e0[1] - ny * hw)
        tip = (e0[0] + tx * hl, e0[1] + ty * hl)
        arrow = f'<path d="M{b1[0]:.1f},{b1[1]:.1f} L{tip[0]:.1f},{tip[1]:.1f} L{b2[0]:.1f},{b2[1]:.1f} Z" fill="{trend}" stroke="{trend}" stroke-width="2" stroke-linejoin="round"/>'
    # small gold cross in the G opening
    ca = math.radians(-22); ccx, ccy = cx + (r + sw * 0.2) * math.cos(ca), cy + (r + sw * 0.2) * math.sin(ca)
    t = sw * 0.30; a = sw * 0.46
    cross = (f'<path d="M{ccx-t/2:.1f},{ccy-a:.1f} h{t:.1f} v{a-t/2:.1f} h{a-t/2:.1f} v{t:.1f} h{-(a-t/2):.1f} '
             f'v{a-t/2:.1f} h{-t:.1f} v{-(a-t/2):.1f} h{-(a-t/2):.1f} v{-t:.1f} h{a-t/2:.1f} Z" fill="{cross_c}"/>')
    defs = f'''<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{cx-r:.0f}" y1="{cy-r:.0f}" x2="{cx+r*0.85:.0f}" y2="{cy+r*0.2:.0f}">
      <stop offset="0" stop-color="{BLUE_L}"/><stop offset=".5" stop-color="{BLUE}"/><stop offset="1" stop-color="{NAVY}"/></linearGradient>'''
    body = f'''<path d="{d_g}" fill="none" stroke="url(#{gid})" stroke-width="{sw}" stroke-linecap="round"/>
  <path d="{bar}" fill="{NAVY}"/>
  {tk}
  {tl}{arrow}
  {cross}'''
    return defs, body


def full_logo(dark=False, wl=False, curve=False, compact=False):
    W, H = 1740, 640
    navy = "#ffffff" if dark else NAVY
    blue = "#8fb8ef" if dark else BLUE
    mdefs, mbody = (mark_wl(310, 330, 215, 74, curve=curve) if wl else mark(310, 330, 215, 74))
    if dark:
        mbody = mbody.replace(f'fill="{NAVY}"', 'fill="#ffffff"')
        mdefs = mdefs.replace(f'stop-color="{BLUE_L}"', 'stop-color="#8fb8ef"').replace(f'stop-color="{BLUE}"', 'stop-color="#c3d9f7"').replace(f'stop-color="{NAVY}"', 'stop-color="#ffffff"')
    left = 700
    s1 = 340; tr1 = s1 * 0.04
    colw = text_width("GLAH", "Bold", s1, tr1); right = left + colw
    b1 = 395
    p1 = text_path("GLAH", "Bold", s1, left, b1, tr1)
    s2 = fit_size("MEDICAL GROUP", "Medium", colw, 0.15)
    b2 = b1 + 30 + s2 * 0.72
    p2 = text_path("MEDICAL GROUP", "Medium", s2, left + 2, b2, s2 * 0.15)
    tag = "Medical Weight Loss  ·  GLP-1  ·  Physicals" if wl else "Physicals  ·  Immigration  ·  Weight Loss"
    s3 = 40
    tw = text_width(tag, "Regular", s3, 1.5)
    tx = left + (colw - tw) / 2; ty = b2 + 78
    p3 = text_path(tag, "Regular", s3, tx, ty, 1.5)
    ly = ty - s3 * 0.33
    lines = (f'<line x1="{left}" y1="{ly:.1f}" x2="{tx-28:.1f}" y2="{ly:.1f}" stroke="{blue}" stroke-width="5" stroke-linecap="round"/>'
             f'<line x1="{tx+tw+28:.1f}" y1="{ly:.1f}" x2="{right}" y2="{ly:.1f}" stroke="{blue}" stroke-width="5" stroke-linecap="round"/>')
    arc = (f'<path d="M{left+10},{135} Q{(left+right)/2},{40} {right-10},{135}" fill="none" '
           f'stroke="url(#arc)" stroke-width="11" stroke-linecap="round"/>')
    divider = f'<line x1="630" y1="110" x2="630" y2="560" stroke="{navy}" stroke-width="5" stroke-linecap="round" opacity=".85"/>'
    vb = f"0 0 {W} {H}"
    if compact:
        arc = ""; p3 = ""; lines = ""; vb = f"30 70 {W-50} 520"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-labelledby="t">
  <title id="t">Glah Medical Group</title>
  <defs>{mdefs}
    <linearGradient id="arc" x1="0" x2="1"><stop offset="0" stop-color="{NAVY if not dark else '#8fb8ef'}"/><stop offset=".6" stop-color="{BLUE_L}"/><stop offset="1" stop-color="{GOLD}"/></linearGradient>
  </defs>
  {mbody}
  {divider}
  {arc}
  <path d="{p1}" fill="{navy}"/>
  <path d="{p2}" fill="{blue}"/>
  {f'<path d="{p3}" fill="{navy}"/>' if p3 else ""}
  {lines}
</svg>'''


def mark_only(tile=False, wl=False, curve=False):
    mdefs, mbody = (mark_wl(256, 262, 170, 60, tick=BLUE if tile else '#ffffff', curve=curve) if wl else mark(256, 262, 170, 60))
    bg = ""
    if tile:
        mbody = mbody.replace(f'fill="{NAVY}"', 'fill="#ffffff"')
        mdefs = mdefs.replace(f'stop-color="{BLUE_L}"', 'stop-color="#8fb8ef"').replace(f'stop-color="{BLUE}"', 'stop-color="#c3d9f7"').replace(f'stop-color="{NAVY}"', 'stop-color="#ffffff"').replace('url(#g)', '#ffffff')
        bg = f'<rect width="512" height="512" rx="112" fill="{BLUE}"/>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Glah Medical Group">
  <defs>{mdefs}</defs>{bg}
  {mbody}
</svg>'''


out = sys.argv[1]
for wl, cv, p in ((False, False, "glah"), (True, False, "glah-wl"), (True, True, "glah-wl2")):
    open(f"{out}/{p}-logo.svg", "w").write(full_logo(wl=wl, curve=cv))
    open(f"{out}/{p}-logo-white.svg", "w").write(full_logo(dark=True, wl=wl, curve=cv))
    open(f"{out}/{p}-mark.svg", "w").write(mark_only(wl=wl, curve=cv))
    open(f"{out}/{p}-mark-tile.svg", "w").write(mark_only(tile=True, wl=wl, curve=cv))
open(f"{out}/glah-wl2-logo-compact.svg", "w").write(full_logo(wl=True, curve=True, compact=True))
open(f"{out}/glah-wl2-logo-compact-white.svg", "w").write(full_logo(dark=True, wl=True, curve=True, compact=True))

def og():
    W, H = 1200, 630
    logo = full_logo(dark=True, wl=True, curve=True)
    inner = logo[logo.index('>', logo.index('<svg')) + 1: logo.rindex('</svg>')].replace('<title id="t">Glah Medical Group</title>', '')
    sc = 520 / 1740
    h1a = "Physician-guided weight loss"; h1b = "& GLP-1 medication"
    hs = 58
    p1 = text_path(h1a, "Bold", hs, 80, 370)
    p2 = text_path(h1b, "Bold", hs, 80, 440)
    sub = "Lancaster & Camp Hill, PA  ·  Immigration, driver's license & school physicals"
    p3 = text_path(sub, "Regular", 25, 80, 510)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">
  <rect width="{W}" height="{H}" fill="{NAVY}"/>
  <circle cx="1060" cy="120" r="300" fill="none" stroke="#3d7fd6" stroke-opacity=".18" stroke-width="3"/>
  <circle cx="1120" cy="60" r="200" fill="none" stroke="{GOLD}" stroke-opacity=".18" stroke-width="3"/>
  <g transform="translate(62,40) scale({sc:.4f})">{inner}</g>
  <path d="{p1}" fill="#ffffff"/><path d="{p2}" fill="{GOLD}"/><path d="{p3}" fill="#c3d2e8"/>
  <rect y="{H-14}" width="{W}" height="14" fill="url(#ogb)"/>
  <defs><linearGradient id="ogb" x1="0" x2="1"><stop offset="0" stop-color="#3d7fd6"/><stop offset=".6" stop-color="{BLUE}"/><stop offset="1" stop-color="{GOLD}"/></linearGradient></defs>
</svg>'''
open(f"{out}/glah-og-image.svg", "w").write(og())
