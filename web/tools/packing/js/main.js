import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const { createApp } = Vue;
const { Dialog, Loading } = Quasar;

let scene;
let camera;
let renderer;
let controls;
let lastRenderPayload = null;

const unitFactors = { m: 1000, cm: 10, mm: 1 };

function initThree() {
  const container = document.getElementById('canvas-container');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    100000
  );

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = true;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN
  };

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(1, 1, 1);
  scene.add(dl);

  window.addEventListener('resize', () => {
    if (!container.clientWidth || !container.clientHeight) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer) renderer.render(scene, camera);
}

function clearScene() {
  const keep = [];
  scene.children.forEach((child) => {
    if (child.isLight || child.isCamera) {
      keep.push(child);
    }
  });
  scene.children = keep;
}

function renderResult(items, binSizeMM, rowColors) {
  lastRenderPayload = { items, binSizeMM, rowColors };
  clearScene();

  const container = new THREE.LineSegments(
    new THREE.EdgesGeometry(
      new THREE.BoxGeometry(binSizeMM[0], binSizeMM[1], binSizeMM[2])
    ),
    new THREE.LineBasicMaterial({ color: 0x38bdf8 })
  );
  container.position.set(
    binSizeMM[0] / 2,
    binSizeMM[1] / 2,
    binSizeMM[2] / 2
  );
  scene.add(container);

  items.forEach((it) => {
    const rowIdx = parseInt(it.name.split('#')[1], 10);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(it.dim[0] - 2, it.dim[1] - 2, it.dim[2] - 2),
      new THREE.MeshLambertMaterial({ color: rowColors[rowIdx] })
    );
    mesh.position.set(
      it.pos[0] + it.dim[0] / 2,
      it.pos[1] + it.dim[1] / 2,
      it.pos[2] + it.dim[2] / 2
    );
    mesh.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
      )
    );
    scene.add(mesh);
  });

  const max = Math.max(...binSizeMM);
  camera.position.set(max * 1.5, max * 1.5, max * 1.5);
  controls.target.set(binSizeMM[0] / 2, binSizeMM[1] / 2, binSizeMM[2] / 2);
}

createApp({
  data() {
    return {
      drawerOpen: true,
      autoRotate: false,
      bin: {
        w: 2.4,
        h: 2.6,
        d: 12,
        unit: 'm'
      },
      units: ['m', 'cm', 'mm'],
      colorOptions: [
        { label: '红', value: '#ef4444' },
        { label: '绿', value: '#22c55e' },
        { label: '蓝', value: '#3b82f6' },
        { label: '黄', value: '#eab308' },
        { label: '紫', value: '#a855f7' },
        { label: '橙', value: '#f97316' },
        { label: '白', value: '#ffffff' }
      ],
      items: [],
      result: {
        visible: false,
        packedCount: 0,
        total: 0,
        packRate: 0,
        volumeLeft: '0.000',
        unpacked: []
      },
      nextId: 1
    };
  },
  mounted() {
    initThree();
    this.addItem();
  },
  methods: {
    showMsg(message, title = '提示') {
      Dialog.create({
        title,
        message,
        ok: { label: '确定', color: 'primary' }
      });
    },
    addItem() {
      const color = this.colorOptions[(this.items.length) % this.colorOptions.length].value;
      this.items.push({
        id: this.nextId++,
        name: `BOX-${this.items.length + 1}`,
        w: 1,
        h: 1,
        d: 1,
        unit: 'm',
        qty: 10,
        color
      });
    },
    removeItem(id) {
      this.items = this.items.filter((item) => item.id !== id);
    },
    toggleAutoRotate() {
      this.autoRotate = !this.autoRotate;
      if (controls) {
        controls.autoRotate = this.autoRotate;
      }
    },
    resetView() {
      if (!lastRenderPayload) return;
      renderResult(
        lastRenderPayload.items,
        lastRenderPayload.binSizeMM,
        lastRenderPayload.rowColors
      );
    },
    async runPacking() {
      const binFactor = unitFactors[this.bin.unit];
      const binSizeMM = [
        Math.round((parseFloat(this.bin.w) || 0) * binFactor),
        Math.round((parseFloat(this.bin.h) || 0) * binFactor),
        Math.round((parseFloat(this.bin.d) || 0) * binFactor)
      ];

      if (Math.max(...binSizeMM) > 20000) {
        this.showMsg('大箱子单边长度不能超过 20 米', '错误');
        return;
      }

      let totalQty = 0;
      let atLeastOneFits = false;
      const itemsForBackend = [];
      const rowColors = [];

      this.items.forEach((row, index) => {
        const factor = unitFactors[row.unit];
        const w = Math.round((parseFloat(row.w) || 0) * factor);
        const h = Math.round((parseFloat(row.h) || 0) * factor);
        const d = Math.round((parseFloat(row.d) || 0) * factor);
        const qty = parseInt(row.qty, 10) || 0;

        totalQty += qty;
        rowColors[index] = row.color;
        itemsForBackend.push({ name: `${row.name}#${index}`, w, h, d, count: qty });

        const sortedBin = [...binSizeMM].sort((a, b) => a - b);
        const sortedItem = [w, h, d].sort((a, b) => a - b);
        if (
          sortedItem[0] <= sortedBin[0] &&
          sortedItem[1] <= sortedBin[1] &&
          sortedItem[2] <= sortedBin[2]
        ) {
          atLeastOneFits = true;
        }
      });

      if (this.items.length > 0 && !atLeastOneFits) {
        this.showMsg('没有任何货物的尺寸能装入当前大箱子！', '箱子错误');
        return;
      }

      if (totalQty > 5000) {
        this.showMsg('货物总数不能超过 5000 个', '错误');
        return;
      }

      if (itemsForBackend.length === 0) {
        this.showMsg('请至少添加一种有效的货物', '提示');
        return;
      }

      Loading.show({ message: '计算中，请稍候...' });
      try {
        const res = await fetch('/api/v1/tools/packing/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bin_size: binSizeMM, items: itemsForBackend })
        });
        const data = await res.json();

        if (data.status === 'success') {
          renderResult(data.items, binSizeMM, rowColors);
          this.updateStatsUI(data.items, data.unpacked, totalQty, binSizeMM);
          if (this.$q.screen.lt.md) {
            this.drawerOpen = false;
          }
        } else {
          this.showMsg(data.message || '装箱算法返回失败');
        }
      } catch (error) {
        this.showMsg('连接服务器失败，请检查网络设置', '错误');
      } finally {
        Loading.hide();
      }
    },
    updateStatsUI(packed, unpacked, total, binSize) {
      this.result.visible = true;
      this.result.packedCount = packed.length;
      this.result.total = total;
      this.result.packRate = total > 0 ? Math.round((packed.length / total) * 100) : 0;

      const binVolume = binSize[0] * binSize[1] * binSize[2];
      const packedVolume = packed.reduce((sum, item) => {
        return sum + item.dim[0] * item.dim[1] * item.dim[2];
      }, 0);
      this.result.volumeLeft = ((binVolume - packedVolume) / 1e9).toFixed(3);
      this.result.unpacked = unpacked || [];
    }
  }
})
  .use(Quasar, { plugins: { Dialog, Loading } })
  .mount('#q-app');
