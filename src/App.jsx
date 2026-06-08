import { useState, useRef, useEffect } from "react";
import * as THREE from "three";

const ORANGE = "#e95428";
const BG     = "#f5f4f2";
const BG2    = "#eeecea";
const INK    = "#111111";
const MUTED  = "#888880";
const BORDER = "#dddbd8";
const WHITE  = "#ffffff";

const FONT = '"Libre Franklin", sans-serif';
const T = {
  heading: { fontFamily: FONT, fontWeight: 900, fontStyle: "italic" },
  body:    { fontFamily: FONT, fontWeight: 500, fontStyle: "normal" },
};

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
  { name: "Block",   z: b => ({ body: b,      sleeves: b,      collar: ORANGE,  sidePanels: b,      hem: ORANGE }) },
  { name: "Raglan",  z: b => ({ body: b,      sleeves: "#111", collar: "#111",  sidePanels: b,      hem: "#111" }) },
  { name: "Hoops",   z: b => ({ body: b,      sleeves: WHITE,  collar: "#111",  sidePanels: b,      hem: WHITE  }) },
  { name: "Inverse", z: b => ({ body: WHITE,  sleeves: b,      collar: "#111",  sidePanels: "#111", hem: b      }) },
  { name: "Dynasty", z: b => ({ body: "#111", sleeves: b,      collar: WHITE,   sidePanels: b,      hem: "#111" }) },
];

const ZONES = [
  { key: "body",       label: "Body"        },
  { key: "sleeves",    label: "Sleeves"     },
  { key: "collar",     label: "Collar"      },
  { key: "sidePanels", label: "Side panels" },
  { key: "hem",        label: "Hem"         },
];

const STEPS = ["Sport", "Base colour", "Garment", "Design", "Cart"];

// ── Three.js ball ──────────────────────────────────────────────
function ThreeCanvas({ zones }) {
  const mountRef = useRef();
  const stateRef = useRef({});

  useEffect(() => {
    const el = mountRef.current;
    const w = el.clientWidth, h = el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    cam.position.set(0, 0.5, 3.9);
    cam.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const d = new THREE.DirectionalLight(0xffffff, 1.1); d.position.set(3, 5, 5); scene.add(d);
    const f = new THREE.DirectionalLight(0xffffff, 0.3); f.position.set(-3, -2, 2); scene.add(f);
    const geo = new THREE.SphereGeometry(1, 64, 64);
    geo.applyMatrix4(new THREE.Matrix4().makeScale(1, 0.65, 0.65));
    const cv = document.createElement("canvas"); cv.width = cv.height = 512;
    const ctx = cv.getContext("2d");
    const S = 512;
    function paint(z) {
      ctx.fillStyle = z.body; ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = z.sidePanels;
      ctx.fillRect(0, 0, S * 0.17, S); ctx.fillRect(S * 0.83, 0, S * 0.17, S);
      ctx.fillStyle = z.hem; ctx.fillRect(0, S * 0.83, S, S * 0.17);
      ctx.fillStyle = z.sleeves; ctx.fillRect(0, 0, S, S * 0.17);
      ctx.fillStyle = z.collar;
      ctx.beginPath(); ctx.ellipse(S/2, S*0.085, S*0.11, S*0.065, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, S/2); ctx.lineTo(S, S/2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(S/2, 0); ctx.lineTo(S/2, S); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1.5;
      [-1, 1].forEach(sg => {
        ctx.beginPath(); ctx.moveTo(S/2, S/2); ctx.lineTo(S/2 + sg*S*0.35, S*0.14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(S/2, S/2); ctx.lineTo(S/2 + sg*S*0.35, S*0.86); ctx.stroke();
      });
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "bold 20px 'Libre Franklin', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("JERSEY", S/2, S/2 - 10);
      ctx.font = "12px 'Libre Franklin', sans-serif";
      ctx.fillText("3D model coming soon", S/2, S/2 + 10);
    }
    paint(zones);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.04 });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    stateRef.current = { renderer, scene, cam, mesh, mat, cv, ctx, tex, paint };
    const onWheel = e => {
      e.preventDefault();
      cam.position.z = Math.max(1.5, Math.min(8, cam.position.z + e.deltaY * 0.005));
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
      mesh.rotation.y += vx;
    };
    renderer.domElement.addEventListener("mousedown", dn);
    renderer.domElement.addEventListener("touchstart", dn);
    window.addEventListener("mouseup", up); window.addEventListener("touchend", up);
    window.addEventListener("mousemove", mv); window.addEventListener("touchmove", mv);
    document.addEventListener("mouseleave", leave);
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!drag) { vx *= 0.9; mesh.rotation.y += vx; }
      renderer.render(scene, cam);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("mousedown", dn);
      renderer.domElement.removeEventListener("touchstart", dn);
      window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up);
      window.removeEventListener("mousemove", mv); window.removeEventListener("touchmove", mv);
      document.removeEventListener("mouseleave", leave);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const { ctx, tex, paint } = stateRef.current;
    if (!ctx) return; paint(zones); tex.needsUpdate = true;
  }, [zones]);

  const reset = () => {
    const { mesh, cam } = stateRef.current;
    if (!mesh) return;
    mesh.rotation.set(0, 0, 0);
    cam.position.set(0, 0.5, 3.9);
  };

  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: "92%" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
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

// ── Mini jersey SVG ────────────────────────────────────────────
function MiniJersey({ zones }) {
  const { body, sleeves, collar, sidePanels, hem } = zones;
  return (
    <svg viewBox="0 0 36 48" style={{ width: 36, height: 48, flexShrink: 0 }}>
      <rect width="36" height="48" fill={body} />
      <polygon points="0,0 10,0 10,22 0,18" fill={sleeves} />
      <polygon points="36,0 26,0 26,22 36,18" fill={sleeves} />
      <rect x="0" y="0" width="5" height="48" fill={sidePanels} />
      <rect x="31" y="0" width="5" height="48" fill={sidePanels} />
      <rect x="0" y="42" width="36" height="6" fill={hem} />
      <path d="M13,0 Q18,5 23,0 L22,6 Q18,2 14,6 Z" fill={collar} />
    </svg>
  );
}

// ── Shared layout shell ────────────────────────────────────────
function Shell({ children, step: cur, onBack, backLabel, action, actionLabel, actionDisabled, onNavigate }) {
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
            <button className="btn-primary" onClick={action} disabled={actionDisabled} style={{ ...T.body, background: actionDisabled ? "#ccc9c6" : INK, color: WHITE, border: "none", borderRadius: 3, padding: "11px 28px", fontSize: 13, letterSpacing: 0.5, cursor: actionDisabled ? "default" : "pointer" }}>
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
  background: disabled ? "#ccc9c6" : INK,
  color: WHITE, border: "none", borderRadius: 3,
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
  const [zones, setZones]       = useState({ body: "#111", sleeves: "#e95428", collar: "#fff", sidePanels: "#e95428", hem: "#111" });
  const [activeZone, setActive] = useState("body");
  const [logos, setLogos]       = useState({ chest: null, back: null });
  const [cart, setCart]         = useState([]);
  const [form, setForm]         = useState({});
  const chestRef = useRef(), backRef = useRef();

  const setColor       = hex => setZones(z => ({ ...z, [activeZone]: hex }));
  const addToCart      = () => setCart(c => [...c, { id: Date.now(), sport: SPORTS.find(s => s.id === sport)?.label, garment, zones: { ...zones } }]);
  const removeFromCart = id => setCart(c => c.filter(i => i.id !== id));

  // ── Landing ──
  if (page === "landing") return (
    <div style={{ ...T.body, background: BG, minHeight: "100vh", padding: "3rem 2rem", border: "none", outline: "none" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <Eyebrow>Dynasty Sport</Eyebrow>
        <h1 style={{ ...T.heading, fontSize: 52, color: INK, lineHeight: 1.05, margin: "0 0 1rem" }}>Design<br />your own kit.</h1>
        <p style={{ ...T.body, fontSize: 15, color: MUTED, lineHeight: 1.8, maxWidth: 380, margin: "0 auto 2.5rem" }}>
          Choose your sport, base colour, and garment. Customise every zone, upload your logos, and submit a quote — all in minutes.
        </p>
        <div style={{ maxWidth: 340, margin: "0 auto 2.5rem" }}>
          <img
            src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=680&q=80"
            alt="Rugby jerseys"
            style={{ width: "100%", borderRadius: 3, display: "block", objectFit: "cover", aspectRatio: "4/3" }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1.5rem" }}>
          <button className="btn-primary" onClick={() => { setPage("steps"); setStep(0); }} style={{ ...T.body, background: INK, color: WHITE, border: "none", borderRadius: 3, padding: "13px 32px", fontSize: 13, letterSpacing: 0.5, cursor: "pointer" }}>
            Start designing
          </button>
          <span style={{ ...T.body, fontSize: 12, color: MUTED }}>Min. 10 garments · Free quote</span>
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
            <div key={sp.id} className={avail ? "card-select" : ""} onClick={() => avail && setSport(sp.id)} style={{ padding: "1.25rem 1rem", background: sel ? INK : WHITE, cursor: avail ? "pointer" : "default", borderRight: `0.5px solid ${BORDER}`, borderBottom: `0.5px solid ${BORDER}` }}>
              <div style={{ ...T.body, fontSize: 14, fontWeight: 600, color: sel ? WHITE : avail ? INK : MUTED, marginBottom: 3 }}>{sp.label}</div>
              <div style={{ ...T.body, fontSize: 11, color: sel ? "#aaa" : avail ? MUTED : "#ccc" }}>{sp.sub}</div>
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: "1.5rem", justifyContent: "center" }}>
        {BASE_COLOURS.map(c => (
          <div key={c.hex} className="swatch" onClick={() => { setBase(c.hex); setZones(PRESETS[0].z(c.hex)); }} style={{ textAlign: "center", cursor: "pointer" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: c.hex, border: base === c.hex ? `3px solid ${INK}` : `1px solid ${BORDER}`, boxSizing: "border-box", outline: base === c.hex ? `2px solid ${BG}` : "none", outlineOffset: -5 }} />
            <div style={{ ...T.body, fontSize: 10, color: MUTED, marginTop: 5 }}>{c.name}</div>
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
              <div key={g.id} className={g.available ? "card-select" : ""} onClick={() => g.available && setGarment(g.id)} style={{ padding: "1.25rem", background: sel ? INK : WHITE, cursor: g.available ? "pointer" : "default", display: "flex", alignItems: "center", gap: 14, borderRight: `0.5px solid ${BORDER}`, borderBottom: `0.5px solid ${BORDER}`, opacity: g.available ? 1 : 0.45 }}>
                <div style={{ width: 44, height: 58, background: sel ? "#222" : BG2, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {g.available ? <MiniJersey zones={zones} /> : <span style={{ fontSize: 18, color: BORDER }}>—</span>}
                </div>
                <div>
                  <div style={{ ...T.body, fontSize: 14, fontWeight: 600, color: sel ? WHITE : g.available ? INK : MUTED }}>{g.label}</div>
                  <div style={{ ...T.body, fontSize: 11, color: sel ? "#aaa" : MUTED, marginTop: 2 }}>{g.sub}</div>
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
          <ThreeCanvas zones={zones} />
        </div>

        {/* Right — controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Presets + zone pills */}
          <div>
            <p style={{ ...T.body, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: MUTED, margin: "0 0 10px" }}>Presets</p>
            <div style={{ display: "flex", gap: 10 }}>
              {PRESETS.map(p => (
                <div key={p.name} className="preset-thumb" onClick={() => setZones(p.z(base))} style={{ cursor: "pointer", textAlign: "center" }}>
                  <div style={{ border: `0.5px solid ${BORDER}`, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}><MiniJersey zones={p.z(base)} /></div>
                  <span style={{ ...T.body, fontSize: 10, color: MUTED }}>{p.name}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
              {ZONES.map(z => (
                <div key={z.key} className="zone-pill" onClick={() => setActive(z.key)} style={{ ...T.body, fontSize: 11, padding: "4px 10px", borderRadius: 2, cursor: "pointer", border: activeZone === z.key ? `1px solid ${INK}` : `0.5px solid ${BORDER}`, background: activeZone === z.key ? INK : "transparent", color: activeZone === z.key ? WHITE : MUTED, letterSpacing: 0.3 }}>{z.label}</div>
              ))}
            </div>
          </div>

          {/* Colour picker */}
          <div>
            <p style={{ ...T.body, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: MUTED, margin: "0 0 10px" }}>{ZONES.find(z => z.key === activeZone)?.label} colour</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PALETTE.map(c => (
                <div key={c.hex} className="swatch" onClick={() => setColor(c.hex)} style={{ width: 26, height: 26, borderRadius: "50%", background: c.hex, border: zones[activeZone] === c.hex ? `3px solid ${INK}` : `1px solid ${BORDER}`, cursor: "pointer", boxSizing: "border-box", outline: zones[activeZone] === c.hex ? `2px solid ${BG}` : "none", outlineOffset: -5 }} />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <span style={{ ...T.body, fontSize: 11, color: MUTED }}>Custom</span>
              <input type="color" value={zones[activeZone]} onChange={e => setColor(e.target.value)} style={{ width: 28, height: 24, border: "none", borderRadius: 3, cursor: "pointer", padding: 0 }} />
              <span style={{ ...T.body, fontSize: 11, color: MUTED }}>{zones[activeZone]}</span>
            </div>
          </div>

          {/* Logos */}
          <div>
            <p style={{ ...T.body, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: MUTED, margin: "0 0 10px" }}>Logos</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[["chest", "Chest", chestRef], ["back", "Back", backRef]].map(([zone, lbl, ref]) => (
                <div key={zone} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, border: `0.5px dashed ${BORDER}`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, background: WHITE }}>
                    {logos[zone] ? <img src={logos[zone]} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 16, color: BORDER }}>+</span>}
                  </div>
                  <span style={{ ...T.body, fontSize: 12, color: MUTED, flex: 1 }}>{lbl} logo</span>
                  <button className="btn-ghost" style={{ ...btnGhost, padding: "4px 10px", fontSize: 11 }} onClick={() => ref.current.click()}>{logos[zone] ? "Change" : "Upload"}</button>
                  {logos[zone] && <button className="btn-ghost" style={{ ...btnGhost, padding: "4px 8px", fontSize: 11, color: MUTED }} onClick={() => setLogos(l => ({ ...l, [zone]: null }))}>✕</button>}
                  <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const fi = e.target.files[0]; if (!fi) return; const r = new FileReader(); r.onload = ev => setLogos(l => ({ ...l, [zone]: ev.target.result })); r.readAsDataURL(fi); }} />
                </div>
              ))}
            </div>
          </div>

          {/* Save to cart */}
          <button className="btn-primary" onClick={() => { addToCart(); setStep(4); }} style={{ ...btnPrimary(false), width: "100%" }}>
            Save to cart →
          </button>

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
          <button className="btn-ghost" onClick={() => { setPage("landing"); setStep(0); setSport(null); setBase(null); setGarment(null); setCart([]); setForm({}); }} style={{ ...T.body, background: "none", border: `0.5px solid ${BORDER}`, borderRadius: 3, padding: "10px 24px", fontSize: 13, color: INK, cursor: "pointer" }}>Start a new design</button>
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
                <button className="btn-primary" onClick={() => setForm(f => ({ ...f, _submitted: true }))} disabled={!form.name || !form.email || !form.address || !form.city || !form.postcode || !form.country} style={btnPrimary(!form.name || !form.email || !form.address || !form.city || !form.postcode || !form.country)}>
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