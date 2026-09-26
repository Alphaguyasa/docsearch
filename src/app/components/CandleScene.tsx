"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The hero's night: warm embers drifting up through darkness around one
 * candle glow. Built to never get between a reader and the story:
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

const HALO_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export function CandleScene() {
  const host = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

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

      const resize = () => {
        const w = el.clientWidth || 1;
        const h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // Keep the glow framed on tall phone screens.
        camera.position.z = w / h < 0.8 ? 8 : 6;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      const target = new THREE.Vector2(0, 0);
      const onPointer = (e: PointerEvent) => {
        target.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
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
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* The still version: what everyone sees first, and all some phones ever see. */}
      <div className="candle-still absolute inset-0" />
      <div
        ref={host}
        className={`absolute inset-0 transition-opacity duration-[2000ms] ${live ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
