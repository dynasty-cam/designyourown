import { useState, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { jsPDF } from "jspdf";
import heroPolo from "./assets/dynasty-polo-hero.png";

const ORANGE = "#e95428";
const BG     = "#121210"; // page background
const BG2    = "#1c1c19"; // secondary / active surface
const INK    = "#f3f1ec"; // primary text + primary button fill
const MUTED  = "#96938a"; // secondary text
const BORDER = "#2d2d29"; // subtle dividers
const WHITE  = "#191916"; // card/panel surfaces + text on light buttons (kept the name so every existing reference below still makes sense — it's the "opposite of INK" role, which happens to be dark now)

const FONT = '"Libre Franklin", sans-serif';
const T = {
  heading: { fontFamily: FONT, fontWeight: 900, fontStyle: "italic" },
  body:    { fontFamily: FONT, fontWeight: 500, fontStyle: "normal" },
};

// Sport/garment selection cards are deliberately white (not part of the dark theme) with orange as the selected state
const CARD_BG      = "#ffffff";
const CARD_TEXT    = "#161614";
const CARD_SUBTEXT = "#726f66";

const SPORTS = [
  { id: "rugby-league", label: "Rugby League", sub: "Available now" },
  { id: "rugby-union",  label: "Rugby Union",  sub: "Available now" },
  { id: "netball",      label: "Netball",       sub: "Coming soon"  },
  { id: "soccer",       label: "Soccer",        sub: "Coming soon"  },
  { id: "basketball",   label: "Basketball",    sub: "Coming soon"  },
  { id: "touch",        label: "Touch Football",sub: "Coming soon"  },
];

const BASE_COLOURS = [
  { name: "Black",      hex: "#111111" },
  { name: "White",      hex: "#ffffff" },
  { name: "Orange",     hex: "#e95428" },
  { name: "Navy",       hex: "#0a1f44" },
  { name: "Royal Blue", hex: "#1a56c4" },
  { name: "Sky Blue",   hex: "#3ab4f2" },
  { name: "Red",        hex: "#c0392b" },
  { name: "Green",      hex: "#1a7c3e" },
  { name: "Gold",       hex: "#f5a623" },
  { name: "Maroon",     hex: "#6b1a2a" },
  { name: "Purple",     hex: "#5c2d91" },
  { name: "Grey",       hex: "#888888" },
];

const PALETTE = [...BASE_COLOURS];

const GARMENTS = {
  "rugby-league": [
    { id: "jersey", label: "Jersey",       sub: "Short sleeve", available: true  },
    { id: "shorts", label: "Shorts",       sub: "Coming soon",  available: false },
    { id: "polo",   label: "Polo",         sub: "Coming soon",  available: false },
    { id: "tee",    label: "Training Tee", sub: "Coming soon",  available: false },
  ],
  "rugby-union": [
    { id: "jersey", label: "Jersey", sub: "Short sleeve", available: true  },
    { id: "shorts", label: "Shorts", sub: "Coming soon",  available: false },
  ],
  "netball":    [{ id: "dress",   label: "Dress",   sub: "Coming soon", available: false }],
  "soccer":     [{ id: "jersey",  label: "Jersey",  sub: "Coming soon", available: false }],
  "basketball": [{ id: "singlet", label: "Singlet", sub: "Coming soon", available: false }],
  "touch":      [{ id: "jersey",  label: "Jersey",  sub: "Coming soon", available: false }],
};

const PRESETS = [
  { name: "Block",   z: (b, ids) => zoneMap(ids, id => id === "COLLAR" ? ORANGE : b) },
  { name: "Raglan",  z: (b, ids) => zoneMap(ids, id => id === "BASE" || id.startsWith("DESIGN") ? b : "#111") },
  { name: "Hoops",   z: (b, ids) => zoneMap(ids, id => id === "COLLAR" ? "#111" : id.startsWith("DESIGN") ? WHITE : b) },
  { name: "Inverse", z: (b, ids) => zoneMap(ids, id => id === "BASE" ? WHITE : id === "COLLAR" ? "#111" : b) },
  { name: "Dynasty", z: (b, ids) => zoneMap(ids, id => id === "COLLAR" ? WHITE : id.startsWith("DESIGN") ? WHITE : "#111") },
];
function zoneMap(ids, fn) {
  return Object.fromEntries(ids.map(id => [id, fn(id)]));
}

// Turns a raw zone id into a friendly label: BASE -> "Base", DESIGN_1 -> "Design 1"
function friendlyZoneLabel(id) {
  return id.toLowerCase().split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Zones are no longer a fixed list — ThreeCanvas discovers them at runtime
// from the garment's SVG (see discoverZones) and reports the list back up
// via onZonesDiscovered, so this file has no hardcoded zone names at all.

// Static garment assets, served from /public/models.
const JERSEY_GLB_URL = "/models/jersey_test.glb";
const JERSEY_SVG_URL = "/models/JERSEY_TEST.svg";

// The GLB's INSIDE material is the reverse face of the same fabric as BASE
// (confirmed by matching UV ranges) but is deliberately excluded from the
// colour system — it stays a fixed neutral regardless of what BASE is set to.
const INSIDE_MATERIAL_NAME = "INSIDE";
const INSIDE_NEUTRAL_COLOR = "#1a1a1a";

const STEPS = ["Sport", "Base colour", "Garment", "Design", "Cart"];

const DESIGN_TABS = [
  { key: "designs", label: "Designs" },
  { key: "colors",  label: "Colors"  },
  { key: "logos",   label: "Logos"   },
  { key: "options", label: "Options" },
];

const PLACEMENTS = ["Chest", "Sleeve", "Front", "Side", "Back"];

const OPTION_GROUPS = [
  { key: "sleeve", label: "Sleeve length", choices: ["Short", "Long"]      },
  { key: "fit",    label: "Fit",           choices: ["Athletic", "Relaxed"] },
  { key: "collar", label: "Collar style",  choices: ["Crew", "V-neck"]      },
];

// ── Three.js jersey viewer ─────────────────────────────────────
// Zones now come from the SVG at runtime, not a hardcoded list. A "zone" is
// any element whose id ends in "_COLOUR"; its closest ancestor <g id="...">
// is the zone itself. If that group sits inside another zone group (like
// DESIGN_1 nested inside BASE), it's a design element that gets painted
// onto its parent's canvas texture rather than getting its own mesh.
const CANVAS_SIZE = 1024;

function discoverZones(svgRoot) {
  const zoneMap = new Map(); // id -> { id, groupEl, shapeEl, parentId }
  svgRoot.querySelectorAll('[id$="_COLOUR"]').forEach(shapeEl => {
    const groupEl = shapeEl.closest("g[id]");
    if (!groupEl || zoneMap.has(groupEl.id)) return;
    zoneMap.set(groupEl.id, { id: groupEl.id, groupEl, shapeEl, parentId: null });
  });
  zoneMap.forEach(zone => {
    let el = zone.groupEl.parentElement;
    while (el && el.tagName !== "svg") {
      if (el.id && zoneMap.has(el.id)) { zone.parentId = el.id; break; }
      el = el.parentElement;
    }
  });
  return zoneMap;
}

// Fills a zone's shape (rect or path) onto a canvas, scaled so refBBox (the
// top-level zone's own bounding box) maps exactly onto the full canvas —
// this is what lines a nested design element up correctly against its parent.
function paintShapeOnCanvas(ctx, shapeEl, refBBox, hex) {
  const sx = CANVAS_SIZE / refBBox.width;
  const sy = CANVAS_SIZE / refBBox.height;
  ctx.save();
  ctx.setTransform(sx, 0, 0, sy, -refBBox.x * sx, -refBBox.y * sy);
  ctx.fillStyle = hex;
  if (shapeEl.tagName.toLowerCase() === "rect") {
    ctx.fillRect(
      parseFloat(shapeEl.getAttribute("x") || 0),
      parseFloat(shapeEl.getAttribute("y") || 0),
      parseFloat(shapeEl.getAttribute("width") || 0),
      parseFloat(shapeEl.getAttribute("height") || 0)
    );
  } else {
    const d = shapeEl.getAttribute("d");
    if (d) ctx.fill(new Path2D(d));
  }
  ctx.restore();
}

function ThreeCanvas({ zones, canvasRef, onZonesDiscovered }) {
  const mountRef = useRef();
  const svgHostRef = useRef();
  const stateRef = useRef({});
  const zonesRef = useRef(zones);
  const onZonesDiscoveredRef = useRef(onZonesDiscovered);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const el = mountRef.current;
    const w = el.clientWidth, h = el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    cam.position.set(0, 0, 2.2);
    cam.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const d = new THREE.DirectionalLight(0xffffff, 1.1); d.position.set(3, 5, 5); scene.add(d);
    const f = new THREE.DirectionalLight(0xffffff, 0.3); f.position.set(-3, -2, 2); scene.add(f);

    const group = new THREE.Group();
    scene.add(group);

    const meshesByZone = {};   // topZoneId -> [mesh, ...]
    const zoneCanvases = {};   // topZoneId -> { canvas, ctx, texture }
    let zoneMap = new Map();   // id -> { id, groupEl, shapeEl, parentId }

    function getOrCreateCanvas(zoneId) {
      if (!zoneCanvases[zoneId]) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = CANVAS_SIZE;
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        zoneCanvases[zoneId] = { canvas, ctx: canvas.getContext("2d"), texture };
      }
      return zoneCanvases[zoneId];
    }

    function redrawZone(topZoneId) {
      const zc = zoneCanvases[topZoneId];
      const topZone = zoneMap.get(topZoneId);
      if (!zc || !topZone) return;
      const refBBox = topZone.shapeEl.getBBox();
      zc.ctx.setTransform(1, 0, 0, 1, 0, 0);
      zc.ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      paintShapeOnCanvas(zc.ctx, topZone.shapeEl, refBBox, zonesRef.current[topZoneId] || "#cccccc");
      zoneMap.forEach(z => {
        if (z.parentId === topZoneId) {
          const hex = zonesRef.current[z.id];
          if (hex) paintShapeOnCanvas(zc.ctx, z.shapeEl, refBBox, hex);
        }
      });
      zc.texture.needsUpdate = true;
    }

    function redrawAllZones() {
      zoneMap.forEach(z => { if (!z.parentId && zoneCanvases[z.id]) redrawZone(z.id); });
    }

    let disposed = false;

    (async () => {
      try {
        const loader = new GLTFLoader();
        const [gltf, svgText] = await Promise.all([
          new Promise((resolve, reject) => loader.load(JERSEY_GLB_URL, resolve, undefined, reject)),
          fetch(JERSEY_SVG_URL).then(r => {
            if (!r.ok) throw new Error(`Couldn't fetch SVG (${r.status})`);
            return r.text();
          }),
        ]);
        if (disposed) return;

        // Parsed off-screen (visibility:hidden, not display:none — it needs
        // real layout for getBBox() to work) so zone shapes are real,
        // measurable DOM elements rather than inert text.
        svgHostRef.current.innerHTML = svgText;
        const svgRoot = svgHostRef.current.querySelector("svg");
        zoneMap = discoverZones(svgRoot);
        onZonesDiscoveredRef.current?.(Array.from(zoneMap.keys()));

        gltf.scene.traverse(child => {
          if (!child.isMesh) return;
          child.material = child.material.clone(); // own instance per mesh, never shared
          const matName = child.material.name;

          if (matName === INSIDE_MATERIAL_NAME) {
            child.material.color.set(INSIDE_NEUTRAL_COLOR);
            return;
          }
          const zone = zoneMap.get(matName);
          if (zone && !zone.parentId) {
            const { texture } = getOrCreateCanvas(matName);
            child.material.map = texture;
            child.material.color.set(0xffffff); // map carries the colour — keep this neutral so it doesn't tint
            child.material.needsUpdate = true;
            if (!meshesByZone[matName]) meshesByZone[matName] = [];
            meshesByZone[matName].push(child);
          }
        });
        group.add(gltf.scene);
        redrawAllZones();

        // Frame the model: centre it and back the camera off by its size
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        group.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const homeCamZ = maxDim * 2.6;
        cam.position.set(0, 0, homeCamZ);
        cam.lookAt(0, 0, 0);
        stateRef.current.homeCamZ = homeCamZ;

        setLoading(false);
      } catch (err) {
        console.error("Failed to load jersey model or SVG:", err);
        if (!disposed) { setLoadError(true); setLoading(false); }
      }
    })();

    stateRef.current = { ...stateRef.current, renderer, scene, cam, group, redrawAllZones };
    if (canvasRef) canvasRef.current = renderer.domElement;

    const onWheel = e => {
      e.preventDefault();
      cam.position.z = Math.max(0.3, Math.min(8, cam.position.z + e.deltaY * 0.005));
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    let drag = false, px = 0, vx = 0;
    const dn = e => { drag = true; px = e.clientX || e.touches?.[0]?.clientX; vx = 0; };
    const up = () => { drag = false; vx = 0; };
    const leave = () => { drag = false; vx = 0; };
    const mv = e => {
      if (!drag) return;
      const cx = e.clientX || e.touches?.[0]?.clientX;
      vx = (cx - px) * 0.01; px = cx;
      group.rotation.y += vx;
    };
    renderer.domElement.addEventListener("mousedown", dn);
    renderer.domElement.addEventListener("touchstart", dn);
    window.addEventListener("mouseup", up); window.addEventListener("touchend", up);
    window.addEventListener("mousemove", mv); window.addEventListener("touchmove", mv);
    document.addEventListener("mouseleave", leave);
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!drag) { vx *= 0.9; group.rotation.y += vx; }
      renderer.render(scene, cam);
    };
    tick();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("mousedown", dn);
      renderer.domElement.removeEventListener("touchstart", dn);
      window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up);
      window.removeEventListener("mousemove", mv); window.removeEventListener("touchmove", mv);
      document.removeEventListener("mouseleave", leave);
      group.traverse(child => {
        if (child.isMesh) {
          child.geometry.dispose();
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      Object.values(zoneCanvases).forEach(zc => zc.texture.dispose());
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
    // canvasRef is a stable ref from the parent; onZonesDiscovered is read
    // via a ref (kept in sync just below) so neither needs to be a
    // dependency here. zones itself is intentionally not a dependency —
    // this effect should only run once; the zones-driven effect below
    // handles every colour update via zonesRef + redrawAllZones.
  }, [canvasRef]);

  useEffect(() => {
    onZonesDiscoveredRef.current = onZonesDiscovered;
  }, [onZonesDiscovered]);

  useEffect(() => {
    zonesRef.current = zones;
    const { redrawAllZones } = stateRef.current;
    if (redrawAllZones) redrawAllZones();
  }, [zones]);

  const reset = () => {
    const { group, cam, homeCamZ } = stateRef.current;
    if (!group) return;
    group.rotation.set(0, 0, 0);
    if (homeCamZ) cam.position.set(0, 0, homeCamZ);
  };

  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: "92%" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      <div ref={svgHostRef} style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", visibility: "hidden", pointerEvents: "none" }} />
      {loading && (
        <div style={{ ...T.body, position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: MUTED, letterSpacing: 0.3, pointerEvents: "none" }}>
          {loadError ? "Couldn't load the 3D model." : "Loading model…"}
        </div>
      )}
      <button
        onClick={reset}
        style={{ ...T.body, position: "absolute", bottom: 8, left: 8, fontSize: 10, color: MUTED, background: "none", border: `0.5px solid ${BORDER}`, borderRadius: 3, padding: "3px 8px", cursor: "pointer", letterSpacing: 0.3 }}
      >
        Reset
      </button>
      <span style={{ ...T.body, position: "absolute", bottom: 8, right: 8, fontSize: 10, color: MUTED, pointerEvents: "none", letterSpacing: "0.5px" }}>drag · scroll to zoom</span>
    </div>
  );
}

// ── Mini jersey preview ────────────────────────────────────────
// Placeholder pending a proper mini-render of the real garment SVG — zones
// are now dynamic (driven by whatever's in the SVG), so a shape hardcoded to
// the old fixed 5-zone taxonomy no longer applies. This just shows one
// swatch per zone so cart/preset previews stay honest without guessing at a
// shape that doesn't match the actual garment.
function MiniJersey({ zones }) {
  const entries = Object.entries(zones || {});
  return (
    <div style={{ display: "flex", width: 36, height: 48, borderRadius: 2, overflow: "hidden", flexShrink: 0, border: `0.5px solid ${BORDER}` }}>
      {entries.length === 0
        ? <div style={{ flex: 1, background: BG2 }} />
        : entries.map(([id, hex]) => <div key={id} style={{ flex: 1, background: hex }} />)
      }
    </div>
  );
}

// ── Shared layout shell ────────────────────────────────────────
function Shell({ children, step: cur, onBack, backLabel, action, actionLabel, actionDisabled }) {
  return (
    <div style={{ ...T.body, background: BG, minHeight: "100vh", padding: "2rem 2rem 3rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2.5rem" }}>
        <span style={{ ...T.heading, fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: INK }}>Dynasty Sport</span>
        {cur !== undefined && (
          <span style={{ ...T.body, fontSize: 11, color: MUTED, letterSpacing: 0.5 }}>Step {cur + 1} of {STEPS.length} — {STEPS[cur]}</span>
        )}
      </div>
      {children}
      {(onBack || action) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2.5rem", borderTop: `0.5px solid ${BORDER}`, paddingTop: "1.5rem" }}>
          {onBack
            ? <button className="btn-text" onClick={onBack} style={{ ...T.body, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: MUTED, letterSpacing: 0.3 }}>← {backLabel || "Back"}</button>
            : <span />
          }
          {action && (
            <button className="btn-primary" onClick={action} disabled={actionDisabled} style={{ ...T.body, background: actionDisabled ? BG2 : ORANGE, color: actionDisabled ? MUTED : "#ffffff", border: "none", borderRadius: 3, padding: "11px 28px", fontSize: 13, letterSpacing: 0.5, cursor: actionDisabled ? "default" : "pointer" }}>
              {actionLabel || "Continue →"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step progress bar ──────────────────────────────────────────
function Progress({ cur, onNavigate }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: "2.5rem" }}>
      {STEPS.map((label, i) => {
        const done = i < cur, active = i === cur;
        const clickable = done;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
            <div
              className={clickable ? "progress-step" : ""}
              onClick={() => clickable && onNavigate(i)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: clickable ? "pointer" : "default" }}
            >
              <div style={{ ...T.body, width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, background: done || active ? INK : "transparent", color: done || active ? WHITE : MUTED, border: `0.5px solid ${done || active ? INK : BORDER}`, transition: "background 0.15s ease" }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{ ...T.body, fontSize: 10, letterSpacing: 0.5, color: active ? INK : done ? INK : MUTED, fontWeight: active || done ? 700 : 500, whiteSpace: "nowrap" }}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: "0.5px", background: done ? INK : BORDER, margin: "0 8px", marginBottom: 16 }} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Type components ────────────────────────────────────────────
function Eyebrow({ children }) {
  return <p style={{ ...T.body, fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: MUTED, margin: "0 0 8px" }}>{children}</p>;
}
function Heading({ children, size = 28 }) {
  return <h2 style={{ ...T.heading, fontSize: size, color: INK, margin: "0 0 6px", lineHeight: 1.15 }}>{children}</h2>;
}
function BodyText({ children }) {
  return <p style={{ ...T.body, fontSize: 14, color: MUTED, lineHeight: 1.7, margin: "0 0 1.75rem" }}>{children}</p>;
}
function Label({ children }) {
  return <label style={{ ...T.body, fontSize: 11, color: MUTED, display: "block", marginBottom: 5, letterSpacing: 0.3 }}>{children}</label>;
}

const inputStyle = {
  ...T.body,
  width: "100%", padding: "9px 12px", fontSize: 13,
  border: `0.5px solid ${BORDER}`, borderRadius: 3,
  background: WHITE, color: INK, boxSizing: "border-box",
};

const btnPrimary = (disabled) => ({
  ...T.body,
  background: disabled ? BG2 : ORANGE,
  color: disabled ? MUTED : "#ffffff", border: "none", borderRadius: 3,
  padding: "11px 28px", fontSize: 13, letterSpacing: 0.5,
  cursor: disabled ? "default" : "pointer",
});

const btnGhost = {
  ...T.body,
  background: "none", border: `0.5px solid ${BORDER}`,
  borderRadius: 3, padding: "6px 14px",
  fontSize: 12, color: INK, cursor: "pointer",
};

// ── App ────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]         = useState("landing");
  const [step, setStep]         = useState(0);
  const [sport, setSport]       = useState(null);
  const [base, setBase]         = useState(null);
  const [garment, setGarment]   = useState(null);
  const [zones, setZones]       = useState({});
  const [zoneList, setZoneList] = useState([]); // populated once ThreeCanvas parses the SVG
  const [activeZone, setActive] = useState(null);
  const [activeTab, setActiveTab] = useState("designs");
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [logos, setLogos]       = useState([]); // [{ id, image, placement }]
  const [uploadTarget, setUploadTarget] = useState(null); // logo id being replaced, or "new"
  const [options, setOptions]   = useState({ sleeve: "Short", fit: "Athletic", collar: "Crew" });
  const [cart, setCart]         = useState([]);
  const [form, setForm]         = useState({});
  const threeCanvasRef = useRef(), logoFileRef = useRef();

  const setColor       = hex => setZones(z => ({ ...z, [activeZone]: hex }));
  const handleZonesDiscovered = zoneIds => {
    setZoneList(zoneIds);
    setZones(prev => {
      const next = { ...prev };
      let changed = false;
      zoneIds.forEach(id => {
        if (!(id in next)) { next[id] = id === "COLLAR" ? "#ffffff" : (base || "#1c3f94"); changed = true; }
      });
      return changed ? next : prev;
    });
    setActive(prev => (prev && zoneIds.includes(prev)) ? prev : zoneIds[0]);
  };
  const addToCart      = () => setCart(c => [...c, { id: Date.now(), sport: SPORTS.find(s => s.id === sport)?.label, garment, zones: { ...zones }, logos: logos.map(l => ({ ...l })), options: { ...options }, preset: selectedPreset }]);
  const removeFromCart = id => setCart(c => c.filter(i => i.id !== id));

  const triggerLogoUpload = target => { setUploadTarget(target); logoFileRef.current.click(); };
  const handleLogoFile = e => {
    const fi = e.target.files[0];
    e.target.value = "";
    if (!fi) return;
    const r = new FileReader();
    r.onload = ev => {
      if (uploadTarget === "new") {
        setLogos(ls => [...ls, { id: Date.now(), image: ev.target.result, placement: "Chest" }]);
      } else {
        setLogos(ls => ls.map(l => l.id === uploadTarget ? { ...l, image: ev.target.result } : l));
      }
    };
    r.readAsDataURL(fi);
  };

  const generatePDF = useCallback((cartItems, formData) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210, margin = 20;
    let y = 20;

    // Header bar
    doc.setFillColor(17, 17, 17);
    doc.rect(0, 0, W, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("DYNASTY SPORT", margin, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Design Your Own — Quote Summary", W - margin, 13, { align: "right" });

    y = 34;

    // Customer details
    doc.setTextColor(17, 17, 17);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Customer Details", margin, y); y += 7;
    doc.setDrawColor(233, 84, 40);
    doc.setLineWidth(0.5);
    doc.line(margin, y, W - margin, y); y += 6;

    const details = [
      ["Name",     formData.name],
      ["Email",    formData.email],
      ["Phone",    formData.phone || "—"],
      ["Team",     formData.team || "—"],
      ["Address",  [formData.address, formData.city, formData.state, formData.postcode, formData.country].filter(Boolean).join(", ")],
      ["Quantity", formData.qty || "—"],
    ];
    doc.setFontSize(9);
    details.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 100, 100);
      doc.text(label.toUpperCase(), margin, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(17, 17, 17);
      doc.text(value || "—", margin + 35, y);
      y += 6;
    });

    if (formData.notes) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 100, 100);
      doc.text("NOTES", margin, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(17, 17, 17);
      const noteLines = doc.splitTextToSize(formData.notes, W - margin - 55);
      doc.text(noteLines, margin + 35, y);
      y += noteLines.length * 6;
    }

    y += 8;

    // 3D preview screenshot
    if (threeCanvasRef.current) {
      try {
        const imgData = threeCanvasRef.current.toDataURL("image/png");
        const previewW = 80, previewH = 74;
        const previewX = W - margin - previewW;
        const previewY = y;
        doc.addImage(imgData, "PNG", previewX, previewY, previewW, previewH);
      } catch(e) {
        console.warn("Could not capture 3D preview:", e);
      }
    }

    // Designs
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(17, 17, 17);
    doc.text("Your Designs", margin, y); y += 7;
    doc.setDrawColor(233, 84, 40);
    doc.setLineWidth(0.5);
    doc.line(margin, y, W - margin, y); y += 8;

    cartItems.forEach((item, idx) => {
      // Design heading
      doc.setFillColor(245, 244, 242);
      doc.rect(margin, y - 4, W - margin * 2, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(17, 17, 17);
      doc.text(`Design ${idx + 1} — ${item.garment || "Jersey"} · ${item.sport || ""}`, margin + 2, y + 1);
      y += 10;

      // Colour zones
      doc.setFontSize(8);
      const zoneEntries = Object.entries(item.zones);
      const swatchSize = 5;
      const colPerRow = 3;
      zoneEntries.forEach(([zone, hex], zi) => {
        const col = zi % colPerRow;
        const row = Math.floor(zi / colPerRow);
        const sx = margin + col * 58;
        const sy = y + row * 10;
        // Swatch
        const r = parseInt(hex.slice(1,3),16);
        const g = parseInt(hex.slice(3,5),16);
        const b = parseInt(hex.slice(5,7),16);
        doc.setFillColor(r, g, b);
        doc.setDrawColor(200, 200, 200);
        doc.rect(sx, sy - 3, swatchSize, swatchSize, "FD");
        // Label
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 100, 100);
        doc.text(zone.replace(/([A-Z])/g, ' $1').toUpperCase(), sx + 7, sy + 1);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(17, 17, 17);
        doc.text(hex.toUpperCase(), sx + 7, sy + 5);
      });
      y += Math.ceil(zoneEntries.length / colPerRow) * 10 + 6;

      if (y > 260) { doc.addPage(); y = 20; }
    });

    // Footer
    doc.setFillColor(17, 17, 17);
    doc.rect(0, 282, W, 15, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("dynastysport.co.nz  ·  marketing@dynastysport.co.nz", W / 2, 291, { align: "center" });

    doc.save(`DynastySport_DYO_${formData.name?.replace(/\s/g,"_") || "Quote"}.pdf`);
  }, []);

  // ── Landing ──
  if (page === "landing") return (
    <div style={{ ...T.body, position: "relative", minHeight: "100vh", overflow: "hidden", background: BG }}>

      {/* Subtle glow behind the garment for depth */}
      <div style={{
        position: "absolute", top: "8%", right: "-8%", width: "56%", paddingBottom: "56%",
        background: `radial-gradient(circle, ${ORANGE}26 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: "100vh", padding: "2rem", boxSizing: "border-box" }}>

        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ ...T.heading, fontSize: 15, letterSpacing: 3, textTransform: "uppercase", color: INK }}>Dynasty Sport</span>
          <a
            href="mailto:marketing@dynastysport.co.nz"
            className="btn-ghost"
            style={{ ...T.body, background: "none", border: `0.5px solid ${BORDER}`, borderRadius: 3, padding: "9px 18px", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: INK, textDecoration: "none", cursor: "pointer" }}
          >
            Quote request
          </a>
        </div>

        {/* Hero body — copy and garment grouped together, centred as a unit */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "1.5rem", maxWidth: 980 }}>
            <div style={{ flex: "0 1 460px", minWidth: 300 }}>
              <p style={{ ...T.body, fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: MUTED, margin: "0 0 14px" }}>Design Your Own</p>
              <h1 style={{ ...T.heading, fontSize: "clamp(36px, 5.5vw, 68px)", color: INK, lineHeight: 1.02, margin: "0 0 1.25rem" }}>
                The most powerful<br />teamwear designer.
              </h1>
              <p style={{ ...T.body, fontSize: 15, color: MUTED, lineHeight: 1.7, maxWidth: 420, margin: "0 0 2.25rem" }}>
                Choose your sport, base colour, and garment. Customise every zone, upload your logos, and submit a quote — all in minutes.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
                <button
                  className="btn-hero"
                  onClick={() => { setPage("steps"); setStep(0); }}
                  style={{ ...T.body, background: ORANGE, color: "#ffffff", border: "none", borderRadius: 3, padding: "15px 36px", fontSize: 13, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, cursor: "pointer" }}
                >
                  Start designing
                </button>
                <span style={{ ...T.body, fontSize: 12, color: MUTED }}>Min. 10 garments · Free quote</span>
              </div>
            </div>

            <div style={{ flex: "0 1 400px", minWidth: 260, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <img
                src={heroPolo}
                alt="Dynasty Sport custom polo"
                style={{ width: "100%", maxWidth: 440, height: "auto", display: "block", filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.6))" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Step 0: Sport ──
  if (page === "steps" && step === 0) return (
    <Shell step={0} onBack={() => setPage("landing")} backLabel="Home" action={() => setStep(1)} actionDisabled={!sport} onNavigate={setStep}>
      <Progress cur={0} onNavigate={setStep} />
      <Eyebrow>Step 1</Eyebrow>
      <Heading>Select your sport</Heading>
      <BodyText>We'll show you the right garments and cuts for your code.</BodyText>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, border: `0.5px solid ${BORDER}`, borderRadius: 4, overflow: "hidden", marginBottom: "1rem" }}>
        {SPORTS.map(sp => {
          const avail = sp.id === "rugby-league" || sp.id === "rugby-union";
          const sel = sport === sp.id;
          return (
            <div key={sp.id} className={avail ? "card-select" : ""} onClick={() => avail && setSport(sp.id)} style={{ padding: "1.25rem 1rem", background: sel ? ORANGE : CARD_BG, cursor: avail ? "pointer" : "default", borderRight: `0.5px solid ${BORDER}`, borderBottom: `0.5px solid ${BORDER}`, opacity: avail ? 1 : 0.45 }}>
              <div style={{ ...T.body, fontSize: 14, fontWeight: 600, color: sel ? "#ffffff" : CARD_TEXT, marginBottom: 3 }}>{sp.label}</div>
              <div style={{ ...T.body, fontSize: 11, color: sel ? "rgba(255,255,255,0.85)" : CARD_SUBTEXT }}>{sp.sub}</div>
            </div>
          );
        })}
      </div>
    </Shell>
  );

  // ── Step 1: Base colour ──
  if (page === "steps" && step === 1) return (
    <Shell step={1} onBack={() => setStep(0)} action={() => setStep(2)} actionDisabled={!base} onNavigate={setStep}>
      <Progress cur={1} onNavigate={setStep} />
      <Eyebrow>Step 2</Eyebrow>
      <Heading>Select your base colour</Heading>
      <BodyText>This sets the primary colour across your kit. You'll fine-tune individual zones in the designer.</BodyText>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: "1.5rem", justifyContent: "center" }}>
        {BASE_COLOURS.map(c => (
          <div key={c.hex} className="swatch" onClick={() => { setBase(c.hex); setZones(zoneList.length ? PRESETS[0].z(c.hex, zoneList) : {}); }} style={{ textAlign: "center", cursor: "pointer" }}>
            <div style={{ width: 88, height: 88, borderRadius: "50%", background: c.hex, border: base === c.hex ? `4px solid ${INK}` : `1px solid ${BORDER}`, boxSizing: "border-box", outline: base === c.hex ? `3px solid ${BG}` : "none", outlineOffset: -7 }} />
            <div style={{ ...T.body, fontSize: 15, color: INK, marginTop: 8 }}>{c.name}</div>
          </div>
        ))}
      </div>
    </Shell>
  );

  // ── Step 2: Garment ──
  if (page === "steps" && step === 2) {
    const list = GARMENTS[sport] || [];
    return (
      <Shell step={2} onBack={() => setStep(1)} action={() => setStep(3)} actionDisabled={!garment} onNavigate={setStep}>
        <Progress cur={2} onNavigate={setStep} />
        <Eyebrow>Step 3</Eyebrow>
        <Heading>Select your garment</Heading>
        <BodyText>Choose the garment type. More options are being added throughout 2025.</BodyText>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, border: `0.5px solid ${BORDER}`, borderRadius: 4, overflow: "hidden" }}>
          {list.map(g => {
            const sel = garment === g.id;
            return (
              <div key={g.id} className={g.available ? "card-select" : ""} onClick={() => g.available && setGarment(g.id)} style={{ padding: "1.25rem", background: sel ? ORANGE : CARD_BG, cursor: g.available ? "pointer" : "default", display: "flex", alignItems: "center", gap: 14, borderRight: `0.5px solid ${BORDER}`, borderBottom: `0.5px solid ${BORDER}`, opacity: g.available ? 1 : 0.45 }}>
                <div style={{ width: 44, height: 58, background: "#f4f2ee", border: "0.5px solid #e6e3db", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {g.available ? <MiniJersey zones={zones} /> : <span style={{ fontSize: 18, color: CARD_SUBTEXT }}>—</span>}
                </div>
                <div>
                  <div style={{ ...T.body, fontSize: 14, fontWeight: 600, color: sel ? "#ffffff" : CARD_TEXT }}>{g.label}</div>
                  <div style={{ ...T.body, fontSize: 11, color: sel ? "rgba(255,255,255,0.85)" : CARD_SUBTEXT, marginTop: 2 }}>{g.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Shell>
    );
  }

  // ── Step 3: Design ──
  if (page === "steps" && step === 3) return (
    <div style={{ ...T.body, background: BG, minHeight: "100vh", padding: "2rem 2rem 3rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2rem" }}>
        <span style={{ ...T.heading, fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: INK }}>Dynasty Sport</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ ...T.body, fontSize: 12, color: MUTED }}>{cart.length} design{cart.length !== 1 ? "s" : ""} saved</span>
          <button className="btn-ghost" onClick={() => setStep(4)} style={btnGhost}>View cart →</button>
        </div>
      </div>
      <Progress cur={3} onNavigate={setStep} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: "2rem", alignItems: "start" }}>

        {/* Left — 3D viewer */}
        <div>
          <ThreeCanvas zones={zones} canvasRef={threeCanvasRef} onZonesDiscovered={handleZonesDiscovered} />
        </div>

        {/* Right — tabbed design panel */}
        <div style={{ display: "flex", flexDirection: "column", border: `0.5px solid ${BORDER}`, borderRadius: 4, background: WHITE, overflow: "hidden" }}>

          {/* Tab bar */}
          <div style={{ display: "flex", borderBottom: `0.5px solid ${BORDER}`, padding: "0 18px" }}>
            {DESIGN_TABS.map(t => (
              <button
                key={t.key}
                className="btn-text"
                onClick={() => setActiveTab(t.key)}
                style={{
                  ...T.body, background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase",
                  padding: "16px 0", marginRight: 26,
                  color: activeTab === t.key ? INK : MUTED,
                  fontWeight: activeTab === t.key ? 700 : 500,
                  borderBottom: activeTab === t.key ? `2px solid ${INK}` : "2px solid transparent",
                }}
              >
                {t.label}{t.key === "logos" && logos.length > 0 ? ` (${logos.length})` : ""}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: 18, minHeight: 300 }}>

            {activeTab === "designs" && (
              <div>
                <p style={{ ...T.body, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: INK, margin: "0 0 12px" }}>Start from a preset</p>
                {zoneList.length === 0 ? (
                  <p style={{ ...T.body, fontSize: 12, color: MUTED }}>Loading zones from the garment…</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    {PRESETS.map(p => (
                      <div key={p.name} className="preset-thumb" onClick={() => { setZones(p.z(base, zoneList)); setSelectedPreset(p.name); }} style={{ cursor: "pointer", textAlign: "center" }}>
                        <div style={{ border: `0.5px solid ${selectedPreset === p.name ? INK : BORDER}`, borderRadius: 3, overflow: "hidden", marginBottom: 6, padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", background: BG }}>
                          <MiniJersey zones={p.z(base, zoneList)} />
                        </div>
                        <span style={{ ...T.body, fontSize: 12, color: INK }}>{p.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "colors" && (
              <div style={{ border: `0.5px solid ${BORDER}`, borderRadius: 4, overflow: "hidden" }}>
                {zoneList.length === 0 && (
                  <p style={{ ...T.body, fontSize: 12, color: MUTED, padding: "12px 14px" }}>Loading zones from the garment…</p>
                )}
                {zoneList.map(id => {
                  const open = activeZone === id;
                  return (
                    <div key={id} style={{ borderBottom: `0.5px solid ${BORDER}` }}>
                      <div
                        className="zone-pill"
                        onClick={() => setActive(id)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", cursor: "pointer", background: open ? BG2 : WHITE }}
                      >
                        <span style={{ ...T.body, fontSize: 13, color: INK, letterSpacing: 0.3 }}>{friendlyZoneLabel(id)}</span>
                        <div style={{ width: 16, height: 16, borderRadius: "50%", background: zones[id], border: `0.5px solid ${BORDER}` }} />
                      </div>
                      {open && (
                        <div style={{ padding: "12px 14px 16px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {PALETTE.map(c => (
                              <div key={c.hex} className="swatch" onClick={() => setColor(c.hex)} style={{ width: 26, height: 26, borderRadius: "50%", background: c.hex, border: zones[activeZone] === c.hex ? `3px solid ${INK}` : `1px solid ${BORDER}`, cursor: "pointer", boxSizing: "border-box", outline: zones[activeZone] === c.hex ? `2px solid ${BG}` : "none", outlineOffset: -5 }} />
                            ))}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                            <span style={{ ...T.body, fontSize: 12, color: INK }}>Custom</span>
                            <input type="color" value={zones[activeZone] || "#000000"} onChange={e => setColor(e.target.value)} style={{ width: 28, height: 24, border: "none", borderRadius: 3, cursor: "pointer", padding: 0 }} />
                            <span style={{ ...T.body, fontSize: 12, color: INK }}>{zones[activeZone]}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "logos" && (
              <div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {logos.map(lg => (
                    <div key={lg.id} style={{ display: "flex", alignItems: "center", gap: 10, border: `0.5px solid ${BORDER}`, borderRadius: 4, padding: 10 }}>
                      <div style={{ width: 34, height: 34, border: `0.5px dashed ${BORDER}`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, background: BG }}>
                        {lg.image ? <img src={lg.image} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 16, color: BORDER }}>+</span>}
                      </div>
                      <select
                        value={lg.placement}
                        onChange={e => setLogos(ls => ls.map(l => l.id === lg.id ? { ...l, placement: e.target.value } : l))}
                        style={{ ...inputStyle, flex: 1, padding: "6px 8px", fontSize: 13, color: INK }}
                      >
                        {PLACEMENTS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button className="btn-ghost" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, color: INK }} onClick={() => triggerLogoUpload(lg.id)}>{lg.image ? "Change" : "Upload"}</button>
                      <button className="btn-ghost" style={{ ...btnGhost, padding: "4px 8px", fontSize: 12, color: INK }} onClick={() => setLogos(ls => ls.filter(l => l.id !== lg.id))}>✕</button>
                    </div>
                  ))}
                  {logos.length === 0 && (
                    <p style={{ ...T.body, fontSize: 13, color: INK, margin: 0 }}>No logos added yet.</p>
                  )}
                  {logos.length < 4 ? (
                    <button className="btn-ghost" style={{ ...btnGhost, alignSelf: "flex-start", color: INK }} onClick={() => triggerLogoUpload("new")}>+ Add logo</button>
                  ) : (
                    <span style={{ ...T.body, fontSize: 12, color: INK }}>Maximum 4 logos</span>
                  )}
                </div>
                <input ref={logoFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoFile} />
              </div>
            )}

            {activeTab === "options" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {OPTION_GROUPS.map(g => (
                  <div key={g.key}>
                    <p style={{ ...T.body, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: INK, margin: "0 0 10px" }}>{g.label}</p>
                    <div style={{ display: "flex", gap: 6 }}>
                      {g.choices.map(choice => (
                        <div
                          key={choice}
                          className="zone-pill"
                          onClick={() => setOptions(o => ({ ...o, [g.key]: choice }))}
                          style={{
                            ...T.body, fontSize: 13, padding: "6px 16px", borderRadius: 2, cursor: "pointer",
                            border: options[g.key] === choice ? `1px solid ${INK}` : `0.5px solid ${BORDER}`,
                            background: options[g.key] === choice ? INK : "transparent",
                            color: options[g.key] === choice ? WHITE : INK, letterSpacing: 0.3,
                          }}
                        >
                          {choice}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <p style={{ ...T.body, fontSize: 12, color: INK, margin: 0, lineHeight: 1.6 }}>More garment options roll out as we add sports and cuts.</p>
              </div>
            )}

          </div>

          {/* Save to cart */}
          <div style={{ padding: 18, borderTop: `0.5px solid ${BORDER}` }}>
            <button className="btn-primary" onClick={() => { addToCart(); setStep(4); }} style={{ ...btnPrimary(false), width: "100%" }}>
              Save to cart →
            </button>
          </div>

        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "2rem", paddingTop: "1.5rem", borderTop: `0.5px solid ${BORDER}` }}>
        <button className="btn-text" onClick={() => setStep(2)} style={{ ...T.body, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: MUTED, letterSpacing: 0.3 }}>← Back</button>
      </div>
    </div>
  );

  // ── Step 4: Cart ──
  if (page === "steps" && step === 4) return (
    <Shell step={4} onBack={() => setStep(3)} backLabel="Back to designer" action={cart.length > 0 ? () => setPage("quote") : null} actionLabel={`Request quote (${cart.length})`} actionDisabled={cart.length === 0} onNavigate={setStep}>
      <Progress cur={4} onNavigate={setStep} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
        <div>
          <Eyebrow>Step 5</Eyebrow>
          <Heading>Your cart</Heading>
        </div>
        <button className="btn-ghost" onClick={() => { setGarment(null); setStep(2); }} style={btnGhost}>+ Add design</button>
      </div>
      <BodyText>Review your saved designs before requesting a quote.</BodyText>
      {cart.length === 0 ? (
        <div style={{ border: `0.5px solid ${BORDER}`, borderRadius: 4, padding: "3rem", textAlign: "center", background: WHITE }}>
          <p style={{ ...T.body, fontSize: 14, color: MUTED }}>No designs saved yet.</p>
          <button className="btn-primary" onClick={() => setStep(3)} style={{ ...btnPrimary(false), marginTop: 16, padding: "9px 20px", fontSize: 12 }}>Design a jersey</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0, border: `0.5px solid ${BORDER}`, borderRadius: 4, overflow: "hidden" }}>
          {cart.map((item, idx) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "1rem 1.25rem", background: WHITE, borderBottom: `0.5px solid ${BORDER}` }}>
              <span style={{ ...T.body, fontSize: 11, color: MUTED, width: 20 }}>{idx + 1}</span>
              <MiniJersey zones={item.zones} />
              <div style={{ flex: 1 }}>
                <div style={{ ...T.body, fontSize: 14, fontWeight: 600, color: INK }}>{item.garment} — {item.sport}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                  {Object.values(item.zones).filter((v, i, a) => a.indexOf(v) === i).map(hex => (
                    <div key={hex} style={{ width: 12, height: 12, borderRadius: 2, background: hex, border: `0.5px solid ${BORDER}` }} />
                  ))}
                </div>
              </div>
              <button className="btn-text" onClick={() => removeFromCart(item.id)} style={{ ...T.body, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: MUTED }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );

  // ── Quote ──
  if (page === "quote") return (
    <div style={{ ...T.body, background: BG, minHeight: "100vh", padding: "2rem 2rem 3rem" }}>
      {form._submitted ? (
        <div style={{ maxWidth: 440, margin: "4rem auto", textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: INK, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem", fontSize: 20, color: WHITE }}>✓</div>
          <Heading size={26}>Quote request sent.</Heading>
          <p style={{ ...T.body, fontSize: 14, color: MUTED, lineHeight: 1.8, margin: "0.5rem 0 2rem" }}>The Dynasty Sport team will review your designs and be in touch within 1–2 business days.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn-primary" onClick={() => generatePDF(cart, form)} style={btnPrimary(false)}>
              Download PDF summary
            </button>
            <button className="btn-ghost" onClick={() => { setPage("landing"); setStep(0); setSport(null); setBase(null); setGarment(null); setCart([]); setForm({}); }} style={{ ...T.body, background: "none", border: `0.5px solid ${BORDER}`, borderRadius: 3, padding: "10px 24px", fontSize: 13, color: INK, cursor: "pointer" }}>Start a new design</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2rem" }}>
            <span style={{ ...T.heading, fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: INK }}>Dynasty Sport</span>
            <button className="btn-text" onClick={() => setPage("steps")} style={{ ...T.body, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: MUTED }}>← Back to cart</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3rem", alignItems: "start" }}>
            <div>
              <Eyebrow>Your designs</Eyebrow>
              <Heading size={24}>Review your kit</Heading>
              <p style={{ ...T.body, fontSize: 13, color: MUTED, margin: "4px 0 1.5rem", lineHeight: 1.7 }}>{cart.length} design{cart.length !== 1 ? "s" : ""} ready for quote.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 0, border: `0.5px solid ${BORDER}`, borderRadius: 4, overflow: "hidden" }}>
                {cart.map((item, idx) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "1rem", background: WHITE, borderBottom: `0.5px solid ${BORDER}` }}>
                    <span style={{ ...T.body, fontSize: 11, color: MUTED, width: 16 }}>{idx + 1}</span>
                    <MiniJersey zones={item.zones} />
                    <div>
                      <div style={{ ...T.body, fontSize: 13, fontWeight: 600, color: INK }}>{item.garment}</div>
                      <div style={{ ...T.body, fontSize: 11, color: MUTED }}>{item.sport}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Eyebrow>Contact details</Eyebrow>
              <Heading size={24}>Request a quote</Heading>
              <p style={{ ...T.body, fontSize: 13, color: MUTED, margin: "4px 0 1.5rem", lineHeight: 1.7 }}>We'll be in touch within 1–2 business days with pricing and next steps.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[["name", "Full name *"], ["email", "Email address *"], ["phone", "Phone number"], ["team", "Team or club name"], ["qty", "Estimated quantity"]].map(([k, lbl]) => (
                  <div key={k}>
                    <Label>{lbl}</Label>
                    <input style={inputStyle} value={form[k] || ""} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                  </div>
                ))}
                <div>
                  <Label>Street address *</Label>
                  <input style={inputStyle} value={form.address || ""} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <Label>City *</Label>
                    <input style={inputStyle} value={form.city || ""} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                  </div>
                  <div>
                    <Label>State / Region</Label>
                    <input style={inputStyle} value={form.state || ""} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <Label>Postcode *</Label>
                    <input style={inputStyle} value={form.postcode || ""} onChange={e => setForm(f => ({ ...f, postcode: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Country *</Label>
                    <select style={{ ...inputStyle }} value={form.country || ""} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}>
                      <option value="">Select country</option>
                      <option value="NZ">New Zealand</option>
                      <option value="AU">Australia</option>
                      <option value="GB">United Kingdom</option>
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                      <option value="IE">Ireland</option>
                      <option value="ZA">South Africa</option>
                      <option value="FJ">Fiji</option>
                      <option value="WS">Samoa</option>
                      <option value="TO">Tonga</option>
                      <option value="PG">Papua New Guinea</option>
                      <option value="FR">France</option>
                      <option value="JP">Japan</option>
                      <option value="AR">Argentina</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label>Notes or special requests</Label>
                  <textarea style={{ ...inputStyle, height: 80, resize: "vertical" }} value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <button
                  className="btn-primary"
                  disabled={!form.name || !form.email || !form.address || !form.city || !form.postcode || !form.country}
                  style={btnPrimary(!form.name || !form.email || !form.address || !form.city || !form.postcode || !form.country)}
                  onClick={async () => {
                    const designs = cart.map((item, i) => {
                      const zoneList = Object.entries(item.zones)
                        .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1')}: ${v.toUpperCase()}`)
                        .join(' | ');
                      return `Design ${i+1}: ${item.garment} — ${item.sport}\nColours: ${zoneList}`;
                    }).join('\n\n');
                    const body = new URLSearchParams({
                      "form-name": "dyo-quote",
                      name:     form.name || "",
                      email:    form.email || "",
                      phone:    form.phone || "",
                      team:     form.team || "",
                      qty:      form.qty || "",
                      address:  form.address || "",
                      city:     form.city || "",
                      state:    form.state || "",
                      postcode: form.postcode || "",
                      country:  form.country || "",
                      notes:    form.notes || "",
                      designs,
                    });
                    await fetch("/", {
                      method: "POST",
                      headers: { "Content-Type": "application/x-www-form-urlencoded" },
                      body: body.toString(),
                    });
                    setForm(f => ({ ...f, _submitted: true }));
                  }}
                >
                  Submit quote request
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return null;
}