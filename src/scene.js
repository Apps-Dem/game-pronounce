import * as THREE from "three";

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b1030, 0.035);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.z = 10;

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.PointLight(0xffffff, 80, 40);
  key.position.set(4, 6, 8);
  scene.add(key);

  // Floating shapes
  const shapes = [];
  const geos = [new THREE.IcosahedronGeometry(0.6), new THREE.TorusGeometry(0.5, 0.2, 12, 24), new THREE.OctahedronGeometry(0.6)];
  const colors = [0xffd23f, 0x4cd9ff, 0xff7ad9, 0x7cf29a];
  for (let i = 0; i < 28; i++) {
    const m = new THREE.Mesh(geos[i % 3], new THREE.MeshStandardMaterial({ color: colors[i % 4], roughness: 0.4, metalness: 0.2 }));
    m.position.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 18, -Math.random() * 20 - 2);
    m.userData = { rx: Math.random() * 0.01 + 0.002, ry: Math.random() * 0.01 + 0.002, y0: m.position.y, ph: Math.random() * 6 };
    scene.add(m);
    shapes.push(m);
  }

  // 3D microphone orb, positioned in world space at the bottom center
  const orbMat = new THREE.MeshStandardMaterial({ color: 0x475569, emissive: 0x000000, roughness: 0.3, metalness: 0.4 });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), orbMat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 16, 64), new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0 }));
  orb.add(ring);
  scene.add(orb);
  let micState = "off";

  // Confetti
  const N = 240;
  const cGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const vel = [];
  for (let i = 0; i < N; i++) {
    const c = new THREE.Color(colors[i % 4]);
    col.set([c.r, c.g, c.b], i * 3);
    vel.push(new THREE.Vector3());
  }
  cGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  cGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const confetti = new THREE.Points(cGeo, new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true }));
  confetti.visible = false;
  scene.add(confetti);
  let confettiLife = 0;

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Keep orb aligned with the HTML mic button (bottom 22px + 75px radius).
    const ndcY = -1 + 2 * ((22 + 75) / h);
    const dist = camera.position.z;
    const worldH = 2 * Math.tan((camera.fov * Math.PI) / 360) * dist;
    orb.position.set(0, ndcY * (worldH / 2), 0);
    orb.userData.base = (75 / h) * worldH;
  }
  addEventListener("resize", resize);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    shapes.forEach((m) => {
      m.rotation.x += m.userData.rx;
      m.rotation.y += m.userData.ry;
      m.position.y = m.userData.y0 + Math.sin(t * 0.6 + m.userData.ph) * 0.6;
    });
    const base = orb.userData.base;
    const pulse = micState === "live" ? 1 + Math.sin(t * 8) * 0.08 : 1;
    orb.scale.setScalar(base * pulse);
    orb.rotation.y = t * 0.8;
    orbMat.color.setHex(micState === "live" ? 0xdc2626 : micState === "ready" ? 0x2563eb : 0x475569);
    orbMat.emissive.setHex(micState === "live" ? 0x7f1d1d : 0x000000);
    ring.material.opacity = micState === "live" ? 0.5 + Math.sin(t * 8) * 0.4 : 0;

    if (confettiLife > 0) {
      confettiLife -= 1 / 60;
      const p = cGeo.attributes.position;
      for (let i = 0; i < N; i++) {
        vel[i].y -= 0.004;
        p.setXYZ(i, p.getX(i) + vel[i].x, p.getY(i) + vel[i].y, p.getZ(i) + vel[i].z);
      }
      p.needsUpdate = true;
      confetti.material.opacity = Math.min(1, confettiLife);
      if (confettiLife <= 0) confetti.visible = false;
    }
    renderer.render(scene, camera);
  });

  return {
    setMicState(s) { micState = s; },
    burst() {
      for (let i = 0; i < N; i++) {
        cGeo.attributes.position.setXYZ(i, 0, 0, 3);
        vel[i].set((Math.random() - 0.5) * 0.4, Math.random() * 0.3 + 0.05, (Math.random() - 0.3) * 0.2);
      }
      confetti.visible = true;
      confettiLife = 3;
    },
  };
}
