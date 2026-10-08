#!/usr/bin/env python3
"""
Lumière Studio — static site builder (demo project).

Renders _src/pages/*.html into root-level HTML files using shared components
from _src/components/ and content from _src/data/*.json.

Usage:
    python _src/build.py                 # build all pages
    python _src/build.py --fetch-images  # download any missing photos, then build

Template syntax (deliberately tiny, no dependencies):
    {{> component-name }}   include _src/components/component-name.html
    {{ key }}               insert a context value (dotted keys allowed)
Context values are inserted as-is, so generators below escape data themselves.
"""

from __future__ import annotations

import html
import json
import re
import struct
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "_src"
PAGES_DIR = SRC / "pages"
COMPONENTS_DIR = SRC / "components"
DATA_DIR = SRC / "data"
IMG_DIR = ROOT / "assets" / "img"

UNSPLASH_CDN = "https://images.unsplash.com/photo-{id}?{params}&q=72&fm=jpg"
UNSPLASH_PAGE = "https://unsplash.com/photos/{id}"


def esc(value) -> str:
    return html.escape(str(value), quote=True)


def load(name: str):
    return json.loads((DATA_DIR / f"{name}.json").read_text(encoding="utf-8"))


SITE = load("site")
SERVICES = load("services")
PRICING = load("pricing")
TEAM = load("team")
GALLERY = load("gallery")
IMAGES = {img["key"]: img for img in load("images")["images"]}

CATEGORY_LABELS = {c["id"]: c["label"] for c in SERVICES["categories"]}
AUDIENCE_LABELS = {a["id"]: a["label"] for a in SERVICES["audiences"]}


# --------------------------------------------------------------------------
# Images
# --------------------------------------------------------------------------

def thumb_file(entry: dict) -> str:
    stem, ext = entry["file"].rsplit(".", 1)
    return f"{stem}-thumb.{ext}"


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "lumiere-demo-build/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        dest.write_bytes(resp.read())
    print(f"  downloaded {dest.relative_to(ROOT)}")


def fetch_images() -> None:
    print("Fetching missing images…")
    for entry in IMAGES.values():
        targets = [(entry["file"], entry["params"])]
        if "thumb" in entry:
            targets.append((thumb_file(entry), entry["thumb"]))
        for rel, params in targets:
            dest = IMG_DIR / rel
            if not dest.exists():
                download(UNSPLASH_CDN.format(id=entry["unsplash"], params=params), dest)


def jpeg_size(path: Path) -> tuple[int, int]:
    """Read width/height from a JPEG's SOF marker (no Pillow needed)."""
    with path.open("rb") as f:
        if f.read(2) != b"\xff\xd8":
            raise ValueError(f"{path} is not a JPEG")
        while True:
            byte = f.read(1)
            while byte and byte != b"\xff":
                byte = f.read(1)
            while byte == b"\xff":
                byte = f.read(1)
            marker = byte[0]
            length = struct.unpack(">H", f.read(2))[0]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                f.read(1)
                h, w = struct.unpack(">HH", f.read(4))
                return w, h
            f.seek(length - 2, 1)


def img(key: str, *, cls: str = "", sizes: str = "", eager: bool = False, thumb: bool = False, alt: str | None = None) -> str:
    entry = IMAGES[key]
    rel = thumb_file(entry) if thumb else entry["file"]
    path = IMG_DIR / rel
    if not path.exists():
        raise FileNotFoundError(f"Missing image {rel}. Run: python _src/build.py --fetch-images")
    w, h = jpeg_size(path)
    attrs = [
        f'src="assets/img/{esc(rel)}"',
        f'width="{w}" height="{h}"',
        f'alt="{esc(entry["alt"] if alt is None else alt)}"',
        'loading="eager" fetchpriority="high"' if eager else 'loading="lazy"',
        'decoding="async"',
    ]
    if cls:
        attrs.append(f'class="{esc(cls)}"')
    if sizes:
        attrs.append(f'sizes="{esc(sizes)}"')
    return f"<img {' '.join(attrs)}>"


def img_src(key: str) -> str:
    return f"assets/img/{IMAGES[key]['file']}"


# --------------------------------------------------------------------------
# Template engine
# --------------------------------------------------------------------------

INCLUDE_RE = re.compile(r"{{>\s*([\w-]+)\s*}}")
VAR_RE = re.compile(r"{{\s*([\w.-]+)\s*}}")


def component(name: str) -> str:
    return (COMPONENTS_DIR / f"{name}.html").read_text(encoding="utf-8")


def lookup(ctx: dict, dotted: str):
    value = ctx
    for part in dotted.split("."):
        if not isinstance(value, dict) or part not in value:
            raise KeyError(f"Template variable '{dotted}' is not defined")
        value = value[part]
    return value


def render(template: str, ctx: dict) -> str:
    for _ in range(10):  # allow nested includes
        expanded = INCLUDE_RE.sub(lambda m: component(m.group(1)), template)
        if expanded == template:
            break
        template = expanded
    return VAR_RE.sub(lambda m: str(lookup(ctx, m.group(1))), template)


def render_component(name: str, ctx: dict) -> str:
    return render(component(name), ctx)


# --------------------------------------------------------------------------
# Formatting helpers
# --------------------------------------------------------------------------

def inr(amount: int) -> str:
    """Indian digit grouping: 15000 -> ₹15,000, 150000 -> ₹1,50,000."""
    s = str(int(amount))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups + [tail])
    return f"₹{s}"


def page_href(page: str) -> str:
    return f"{page}.html"


# --------------------------------------------------------------------------
# Generators (all data is escaped here)
# --------------------------------------------------------------------------

def nav_links(current: str) -> str:
    out = []
    for item in SITE["nav"]:
        current_attr = ' aria-current="page"' if item["page"] == current else ""
        out.append(f'<li><a class="nav__link" href="{page_href(item["page"])}"{current_attr}>{esc(item["label"])}</a></li>')
    return "\n          ".join(out)


def footer_links() -> str:
    return "\n".join(f'<li><a href="{page_href(i["page"])}">{esc(i["label"])}</a></li>' for i in SITE["nav"])


def hours_list(cls: str = "hours") -> str:
    rows = "".join(f'<div class="{cls}__row"><dt>{esc(h["days"])}</dt><dd>{esc(h["time"])}</dd></div>' for h in SITE["hours"])
    return f'<dl class="{cls}">{rows}</dl>'


def service_card(s: dict, heading: str = "h3") -> str:
    return render_component("service-card", {
        "id": esc(s["id"]),
        "name": esc(s["name"]),
        "heading": heading,
        "category": esc(s["category"]),
        "category_label": esc(CATEGORY_LABELS[s["category"]]),
        "audience": esc(s["audience"]),
        "audience_label": esc(AUDIENCE_LABELS[s["audience"]]),
        "description": esc(s["description"]),
        "price": esc(inr(s["price"])),
        "duration": esc(s["duration"]),
        "image": img(s["image"], sizes="(min-width: 1200px) 380px, (min-width: 700px) 45vw, 92vw"),
    })


def services_grid(services: list[dict]) -> str:
    return "\n".join(service_card(s) for s in services)


def filter_buttons(options: list[dict], name: str) -> str:
    out = []
    for i, opt in enumerate(options):
        pressed = "true" if i == 0 else "false"
        out.append(
            f'<button type="button" class="chip" data-filter-{name}="{esc(opt["id"])}" aria-pressed="{pressed}">{esc(opt["label"])}</button>'
        )
    return "\n        ".join(out)


def audience_buttons() -> str:
    options = [{"id": "all", "label": "Everyone"}] + SERVICES["audiences"]
    return filter_buttons(options, "audience")


NOT_FOCUSABLE = ' tabindex="-1"'


def pricing_tabs() -> tuple[str, str]:
    tabs, panels = [], []
    for i, tab in enumerate(PRICING["tabs"]):
        selected = i == 0
        tabs.append(
            f'<button type="button" role="tab" class="tabs__tab" id="tab-{tab["id"]}" '
            f'aria-controls="panel-{tab["id"]}" aria-selected="{"true" if selected else "false"}"'
            f'{"" if selected else NOT_FOCUSABLE}>{esc(tab["label"])}</button>'
        )
        groups = []
        for group in tab["groups"]:
            rows = "\n".join(render_component("price-row", {
                "name": esc(item["name"]),
                "detail": esc(item["detail"]),
                "duration": esc(item["duration"]),
                "price": esc(inr(item["price"])),
            }) for item in group["items"])
            groups.append(
                f'<div class="price-group"><h3 class="price-group__title">{esc(group["title"])}</h3>'
                f'<ul class="price-list" role="list">{rows}</ul></div>'
            )
        panels.append(
            f'<div class="tabs__panel" role="tabpanel" id="panel-{tab["id"]}" aria-labelledby="tab-{tab["id"]}" tabindex="0"'
            f'{"" if selected else " hidden"}>{"".join(groups)}</div>'
        )
    return "\n".join(tabs), "\n".join(panels)


def team_cards(compact: bool = False) -> str:
    out = []
    for m in TEAM["team"]:
        focus = "".join(f"<li>{esc(f)}</li>" for f in m["focus"])
        out.append(render_component("team-card", {
            "name": esc(m["name"]),
            "role": esc(m["role"]),
            "bio": "" if compact else f'<p class="team-card__bio">{esc(m["bio"])}</p>',
            "focus": "" if compact else f'<ul class="team-card__focus" aria-label="Focus areas">{focus}</ul>',
            "image": img(m["image"], sizes="(min-width: 1100px) 280px, (min-width: 600px) 45vw, 92vw",
                         alt=f'{IMAGES[m["image"]]["alt"]} (stock photo for the fictional profile of {m["name"]})'),
            "modifier": " team-card--compact" if compact else "",
        }))
    return "\n".join(out)


def gallery_items(items: list[dict]) -> str:
    out = []
    for i, item in enumerate(items):
        entry = IMAGES[item["image"]]
        full_w, full_h = jpeg_size(IMG_DIR / entry["file"])
        out.append(render_component("gallery-item", {
            "index": str(i),
            "category": esc(item["category"]),
            "category_label": esc(dict((f["id"], f["label"]) for f in GALLERY["filters"])[item["category"]]),
            "caption": esc(item["caption"]),
            "full": f'assets/img/{esc(entry["file"])}',
            "full_w": str(full_w),
            "full_h": str(full_h),
            "alt": esc(entry["alt"]),
            "image": img(item["image"], thumb=True, sizes="(min-width: 1200px) 400px, (min-width: 640px) 45vw, 92vw"),
        }))
    return "\n".join(out)


def gallery_preview() -> str:
    picks = ["g-hair-blowdry", "g-groom-fade", "g-bridal-saree", "g-spa-overhead", "g-studio-barber"]
    out = []
    for i, key in enumerate(picks):
        out.append(f'<figure class="mosaic__item mosaic__item--{i + 1}">{img(key, thumb=True, sizes="(min-width: 900px) 33vw, 50vw")}</figure>')
    return "\n".join(out)


def featured_services() -> str:
    return services_grid([s for s in SERVICES["services"] if s.get("featured")])


def service_options() -> str:
    """Server-rendered <option>s (all services) so the form works without JS."""
    out = ['<option value="">Select a service</option>']
    for aud in SERVICES["audiences"]:
        opts = "".join(
            f'<option value="{esc(s["id"])}">{esc(s["name"])} — from {esc(inr(s["price"]))}</option>'
            for s in SERVICES["services"] if s["audience"] == aud["id"]
        )
        out.append(f'<optgroup label="{esc(aud["label"])}">{opts}</optgroup>')
    return "".join(out)


def services_json() -> str:
    data = [
        {k: s[k] for k in ("id", "name", "category", "audience", "price", "duration")}
        for s in SERVICES["services"]
    ]
    # Safe inside <script type="application/json">: neutralise "</".
    return json.dumps({"services": data, "audiences": SERVICES["audiences"]}, ensure_ascii=False).replace("</", "<\\/")


def credits_rows() -> str:
    seen, rows = set(), []
    for entry in IMAGES.values():
        rows.append(
            "<tr>"
            f'<td><code>assets/img/{esc(entry["file"])}</code></td>'
            f'<td>{esc(entry["subject"])}</td>'
            f'<td><a href="{UNSPLASH_CDN.format(id=entry["unsplash"], params="w=1200").replace("&", "&amp;")}" '
            f'rel="noopener" target="_blank">Unsplash photo {esc(entry["unsplash"])}<span class="visually-hidden"> (opens in a new tab)</span></a></td>'
            "</tr>"
        )
        seen.add(entry["unsplash"])
    return "\n".join(rows), len(seen)


def scripts(page: str) -> str:
    modules = ["core", "nav", *SITE["pages"][page]["scripts"]]
    tags = [f'<script src="assets/js/modules/{m}.js" defer></script>' for m in modules]
    tags.append('<script src="assets/js/main.js" defer></script>')
    return "\n  ".join(tags)


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

def base_context(page: str) -> dict:
    meta = SITE["pages"][page]
    base = SITE["baseUrl"].rstrip("/")
    url = f"{base}/{'' if page == 'index' else page_href(page)}" if base else ""
    canonical = f'<link rel="canonical" href="{esc(url)}">' if base else "<!-- canonical: set baseUrl in _src/data/site.json -->"
    og_url = f'<meta property="og:url" content="{esc(url)}">' if base else ""
    og_image = f"{base}/{SITE['ogImage']}" if base else SITE["ogImage"]
    c = SITE["contact"]
    return {
        "page": page,
        "title": esc(meta["title"]),
        "description": esc(meta["description"]),
        "canonical": canonical,
        "og_url": og_url,
        "og_image": esc(og_image),
        "brand": esc(SITE["brand"]),
        "subtitle": esc(SITE["subtitle"]),
        "tagline": esc(SITE["tagline"]),
        "year": esc(SITE["year"]),
        "nav_links": nav_links(page),
        "footer_links": footer_links(),
        "hours": hours_list(),
        "phone": esc(c["phoneDisplay"]),
        "phone_href": esc(c["phoneHref"]),
        "email": esc(c["email"]),
        "whatsapp_href": esc(c["whatsappHref"]),
        "instagram_href": esc(c["instagramHref"]),
        "city": esc(c["city"]),
        "scripts": scripts(page),
    }


def page_context(page: str) -> dict:
    ctx = base_context(page)
    if page == "index":
        ctx.update({
            "hero_women": img("hero-women", eager=True, sizes="(min-width: 960px) 26vw, 46vw"),
            "hero_men": img("hero-men", eager=True, sizes="(min-width: 960px) 26vw, 46vw"),
            "featured_services": featured_services(),
            "studio_wide": img("studio-wide", sizes="100vw"),
            "team_cards_compact": team_cards(compact=True),
            "gallery_preview": gallery_preview(),
            "aud_women": img("svc-hair-styling", sizes="(min-width: 900px) 30vw, 92vw"),
            "aud_men": img("svc-mens-haircut", sizes="(min-width: 900px) 30vw, 92vw"),
            "aud_unisex": img("svc-relaxation-spa", sizes="(min-width: 900px) 30vw, 92vw"),
        })
    elif page == "about":
        ctx.update({
            "about_interior": img("about-interior", sizes="(min-width: 960px) 40vw, 92vw"),
            "about_workspace": img("about-workspace", sizes="(min-width: 960px) 28vw, 60vw"),
            "studio_wide": img("studio-wide", sizes="100vw"),
        })
    elif page == "services":
        ctx.update({
            "category_filters": filter_buttons(SERVICES["categories"], "category"),
            "audience_filters": audience_buttons(),
            "services_grid": services_grid(SERVICES["services"]),
            "service_count": str(len(SERVICES["services"])),
        })
    elif page == "pricing":
        tabs, panels = pricing_tabs()
        ctx.update({"pricing_tabs": tabs, "pricing_panels": panels})
    elif page == "team":
        ctx.update({"team_cards": team_cards()})
    elif page == "gallery":
        ctx.update({
            "gallery_filters": filter_buttons(GALLERY["filters"], "category"),
            "gallery_items": gallery_items(GALLERY["items"]),
            "gallery_count": str(len(GALLERY["items"])),
        })
    elif page == "appointment":
        ctx.update({
            "service_options": service_options(),
            "services_json": services_json(),
            "appointment_image": img("about-interior", sizes="(min-width: 960px) 30vw, 92vw"),
        })
    elif page == "legal":
        rows, unique = credits_rows()
        ctx.update({"credit_rows": rows, "credit_count": str(len(IMAGES)), "credit_unique": str(unique)})
    return ctx


def build() -> None:
    layout = component("layout")
    pages = sorted(p.stem for p in PAGES_DIR.glob("*.html"))
    missing = set(SITE["pages"]) - set(pages)
    if missing:
        raise SystemExit(f"Pages configured in site.json but missing in _src/pages: {sorted(missing)}")
    for page in pages:
        ctx = page_context(page)
        ctx["content"] = render((PAGES_DIR / f"{page}.html").read_text(encoding="utf-8"), ctx)
        out = render(layout, ctx)
        (ROOT / f"{page}.html").write_text(out, encoding="utf-8", newline="\n")
        print(f"  built {page}.html")
    print(f"Done — {len(pages)} pages.")


if __name__ == "__main__":
    if "--fetch-images" in sys.argv:
        fetch_images()
    build()
