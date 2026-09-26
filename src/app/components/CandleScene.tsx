"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The hero's night: a painting hanging in the dark, lit by one candle whose
 * light follows the reader's finger (or wanders slowly on its own), with warm
 * embers drifting up in front. Built to never get between a reader and the
 * story:
 *
 * - three.js is imported only after the page is readable (idle callback), so
 *   it never delays the first paint or the input box.
 * - It does not run at all on Data Saver, 2G, low-memory or low-core phones,
 *   or when the reader has asked their phone to reduce motion. They get the
 *   same scene as a still CSS glow instead.
 * - It pauses whenever it is scrolled off screen or the tab is hidden, and
 *   caps the pixel ratio and particle count on small screens.
 */

type NavigatorHints = Navigator & {
  connection?: { saveData?: boolean; effectiveType?: string };
  deviceMemory?: number;
};

function canAnimate(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const nav = navigator as NavigatorHints;
  if (nav.connection?.saveData) return false;
  if (nav.connection?.effectiveType && /(^|-)2g$/.test(nav.connection.effectiveType)) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return false;
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2) return false;
  try {
    const c = document.createElement("canvas");
    if (!c.getContext("webgl2") && !c.getContext("webgl")) return false;
  } catch {
    return false;
  }
  return true;
}

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec2 uPointer;
  attribute float aSeed;
  attribute float aSize;
  varying float vAlpha;
  varying float vWarm;

  void main() {
    vec3 p = position;
    // Rise slowly, wrap at the top, sway like air above a flame.
    float rise = mod(p.y + uTime * (0.12 + aSeed * 0.18) + 3.0, 6.0) - 3.0;
    p.y = rise;
    p.x += sin(uTime * 0.35 + aSeed * 40.0) * 0.18 + uPointer.x * 0.15 * (p.z + 1.5);
    p.z += cos(uTime * 0.28 + aSeed * 23.0) * 0.12;
    p.y += uPointer.y * 0.08 * (p.z + 1.5);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (7.0 / -mv.z);

    // Fade in at the bottom, out at the top; flicker a little.
    float life = smoothstep(-3.0, -1.6, rise) * (1.0 - smoothstep(1.2, 3.0, rise));
    float flicker = 0.75 + 0.25 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 90.0);
    vAlpha = life * flicker;
    vWarm = aSeed;
  }
`;

const FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying float vWarm;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float glow = smoothstep(0.5, 0.0, d);
    glow *= glow;
    vec3 ember = mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.86, 0.6), vWarm);
    gl_FragColor = vec4(ember, glow * vAlpha * 0.85);
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float breathe = 0.9 + 0.1 * sin(uTime * 0.9) + 0.04 * sin(uTime * 3.7);
    float core = exp(-d * d * 18.0) * 0.55;
    float halo = exp(-d * d * 3.2) * 0.22;
    vec3 color = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.82, 0.55), core * 1.6);
    gl_FragColor = vec4(color, (core + halo) * breathe);
  }
`;

const PAINT_FRAGMENT = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec2 uLight;
  uniform float uAspect;
  uniform float uTime;
  uniform float uAmbient;
  varying vec2 vUv;

  void main() {
    vec3 c = texture2D(uTex, vUv).rgb;
    vec2 d = (vUv - uLight) * vec2(uAspect, 1.0);
    float r = length(d);
    float flicker = 0.93 + 0.04 * sin(uTime * 7.3) + 0.03 * sin(uTime * 12.7 + 1.3);
    float pool = exp(-r * r * 4.0) * 1.35 * flicker;
    vec3 candle = vec3(1.0, 0.8, 0.58);
    c = c * candle * (uAmbient + pool);
    // The frame dissolves into the dark instead of ending in a hard edge.
    float edge = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x)
               * smoothstep(0.0, 0.05, vUv.y) * smoothstep(1.0, 0.95, vUv.y);
    gl_FragColor = vec4(c, edge);
  }
`;

const HALO_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export interface Painting {
  /** Small and large WebP (800 / 1600 px wide). */
  small: string;
  large: string;
  /** width / height */
  aspect: number;
  alt: string;
}

/** Where the painting hangs, in CSS terms, so the still fallback and the WebGL scene line up. */
function hang(w: number, h: number, aspect: number) {
  if (w >= 900) {
    let ph = h * 0.86;
    let pw = ph * aspect;
    if (pw > w * 0.46) {
      pw = w * 0.46;
      ph = pw / aspect;
    }
    return { pw, ph, cx: w - w * 0.04 - pw / 2, cy: h / 2 };
  }
  const pw = w;
  const ph = pw / aspect;
  return { pw, ph, cx: w / 2, cy: ph / 2 };
}

export function CandleScene({ painting }: { painting?: Painting }) {
  const host = useRef<HTMLDivElement>(null);
  const still = useRef<HTMLImageElement>(null);
  const [live, setLive] = useState(false);

  // Hang the still painting in the same place the 3D one will be.
  useEffect(() => {
    const img = still.current;
    const el = host.current?.parentElement;
    if (!img || !el || !painting) return;
    const place = () => {
      const { pw, ph, cx, cy } = hang(el.clientWidth, el.clientHeight, painting.aspect);
      Object.assign(img.style, { width: `${pw}px`, height: `${ph}px`, left: `${cx - pw / 2}px`, top: `${cy - ph / 2}px` });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [painting]);

  useEffect(() => {
    if (!canAnimate()) return;
    let disposed = false;
    let cleanup = () => {};

    const start = async () => {
      const THREE = await import("three");
      const el = host.current;
      if (disposed || !el) return;

      const small = window.innerWidth < 640;
      const count = small ? 160 : 360;

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
      const ratio = Math.min(window.devicePixelRatio, small ? 1.5 : 2);
      renderer.setPixelRatio(ratio);
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
      camera.position.set(0, 0, 6);

      // Embers.
      const positions = new Float32Array(count * 3);
      const seeds = new Float32Array(count);
      const sizes = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        // Denser near the centre, like light gathered around a flame.
        const r = Math.pow(Math.random(), 1.6) * 4.2;
        const a = Math.random() * Math.PI * 2;
        positions[i * 3] = Math.cos(a) * r;
        positions[i * 3 + 1] = Math.random() * 6 - 3;
        positions[i * 3 + 2] = Math.sin(a) * r * 0.6 - 0.5;
        seeds[i] = Math.random();
        sizes[i] = 0.6 + Math.random() * 2.2;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
      geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

      const uniforms = {
        uTime: { value: 0 },
        uPixelRatio: { value: ratio },
        uPointer: { value: new THREE.Vector2(0, 0) },
      };
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      scene.add(new THREE.Points(geometry, material));

      // The candle's glow.
      const haloUniforms = { uTime: uniforms.uTime };
      const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 7),
        new THREE.ShaderMaterial({
          vertexShader: HALO_VERTEX,
          fragmentShader: HALO_FRAGMENT,
          uniforms: haloUniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      halo.position.set(0, -0.6, -1.2);
      scene.add(halo);

      // The painting, lit by the candle.
      const PAINT_Z = -2;
      let paint: InstanceType<typeof THREE.Mesh> | null = null;
      const paintUniforms = {
        uTex: { value: null as InstanceType<typeof THREE.Texture> | null },
        uLight: { value: new THREE.Vector2(0.4, 0.62) },
        uAspect: { value: painting?.aspect ?? 1 },
        uTime: uniforms.uTime,
        uAmbient: { value: 0.22 },
      };
      if (painting) {
        const tex = await new THREE.TextureLoader().loadAsync(small ? painting.small : painting.large).catch(() => null);
        if (disposed) return;
        if (tex) {
          tex.colorSpace = THREE.NoColorSpace;
          tex.minFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          paintUniforms.uTex.value = tex;
          paint = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.ShaderMaterial({
              vertexShader: HALO_VERTEX,
              fragmentShader: PAINT_FRAGMENT,
              uniforms: paintUniforms,
              transparent: true,
              depthWrite: false,
            }),
          );
          paint.position.z = PAINT_Z;
          paint.renderOrder = -1;
          scene.add(paint);
        }
      }
      // World size of the visible area at the painting's depth, and the painting's rect in it.
      const view = { w: 1, h: 1, px: 0, py: 0, pw: 1, ph: 1 };

      const resize = () => {
        const w = el.clientWidth || 1;
        const h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // Keep the glow framed on tall phone screens.
        camera.position.z = w / h < 0.8 ? 8 : 6;
        camera.updateProjectionMatrix();
        if (paint && painting) {
          const dist = camera.position.z - PAINT_Z;
          view.h = 2 * dist * Math.tan((camera.fov * Math.PI) / 360);
          view.w = view.h * camera.aspect;
          const f = hang(w, h, painting.aspect);
          const k = view.w / w;
          view.pw = f.pw * k;
          view.ph = f.ph * k;
          view.px = (f.cx - w / 2) * k;
          view.py = (h / 2 - f.cy) * k;
          paint.scale.set(view.pw, view.ph, 1);
          paint.position.x = view.px;
          paint.position.y = view.py;
          // Dimmer on phones, where the words sit on top of the painting.
          paintUniforms.uAmbient.value = w >= 900 ? 0.24 : 0.12;
        }
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      const target = new THREE.Vector2(0, 0);
      const lightTarget = new THREE.Vector2(0.4, 0.62);
      let lastPointer = -1e9;
      const onPointer = (e: PointerEvent) => {
        target.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
        if (!paint) return;
        const r = el.getBoundingClientRect();
        const wx = ((e.clientX - r.left) / r.width - 0.5) * view.w;
        const wy = (0.5 - (e.clientY - r.top) / r.height) * view.h;
        lightTarget.set((wx - view.px) / view.pw + 0.5, (wy - view.py) / view.ph + 0.5);
        lastPointer = performance.now();
      };
      window.addEventListener("pointermove", onPointer, { passive: true });

      let visible = true;
      const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) loop();
      });
      io.observe(el);
      const onVisibility = () => {
        if (!document.hidden) loop();
      };
      document.addEventListener("visibilitychange", onVisibility);

      const clock = new THREE.Clock();
      let frame = 0;
      let running = false;
      function loop() {
        if (running || disposed) return;
        running = true;
        const tick = () => {
          if (disposed || !visible || document.hidden) {
            running = false;
            clock.stop();
            return;
          }
          if (!clock.running) clock.start();
          uniforms.uTime.value += Math.min(clock.getDelta(), 0.05);
          uniforms.uPointer.value.lerp(target, 0.03);
          if (paint) {
            // Follow the reader's finger; when they stop, the candle drifts on its own.
            if (performance.now() - lastPointer > 4000) {
              const t = uniforms.uTime.value;
              lightTarget.set(0.42 + 0.16 * Math.sin(t * 0.11), 0.6 + 0.14 * Math.sin(t * 0.17 + 1.0));
            }
            paintUniforms.uLight.value.lerp(lightTarget, 0.04);
          }
          renderer.render(scene, camera);
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      }
      loop();
      setLive(true);

      cleanup = () => {
        cancelAnimationFrame(frame);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onPointer);
        document.removeEventListener("visibilitychange", onVisibility);
        geometry.dispose();
        material.dispose();
        halo.geometry.dispose();
        if (paint) {
          paint.geometry.dispose();
          (paint.material as InstanceType<typeof THREE.ShaderMaterial>).dispose();
          paintUniforms.uTex.value?.dispose();
        }
        (halo.material as InstanceType<typeof THREE.ShaderMaterial>).dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    };

    // Wait until the page is readable and the browser is idle.
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const idle = w.requestIdleCallback
      ? w.requestIdleCallback(() => void start(), { timeout: 2500 })
      : window.setTimeout(() => void start(), 800);

    return () => {
      disposed = true;
      if (w.cancelIdleCallback) w.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      cleanup();
    };
  }, [painting]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* The still version: what everyone sees first, and all some phones ever see. */}
      <div className="candle-still absolute inset-0" />
      {painting && (
        <img
          ref={still}
          src={painting.small}
          srcSet={`${painting.small} 800w, ${painting.large} 1600w`}
          sizes="(min-width: 900px) 46vw, 100vw"
          alt={painting.alt}
          fetchPriority="high"
          className={`painting-still absolute transition-opacity duration-[2000ms] ${live ? "opacity-0" : "opacity-100"}`}
        />
      )}
      <div
        ref={host}
        className={`absolute inset-0 transition-opacity duration-[2000ms] ${live ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
