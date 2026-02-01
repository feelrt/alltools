import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Bootstrap + Vue(UMD) + Three.js
 * - Vue 负责：表单/列表/统计面板（数据驱动 UI，不再手写 DOM）
 * - Three 负责：3D 渲染（保持你原来的渲染风格/性能）
 */

let scene, camera, renderer, controls;

const unitFactors = { m: 1000, cm: 10, mm: 1 };

// ====== 侧边栏交互（保持原样，和 Vue 解耦）======
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');

document.getElementById('sidebar-toggle')?.addEventListener('click', () => sidebar?.classList.add('show'));
overlay?.addEventListener('click', () => sidebar?.classList.remove('show'));

// ====== Modal（保持原样）======
const msgModalEl = document.getElementById('msgModal');
const msgModal = msgModalEl ? new bootstrap.Modal(msgModalEl) : null;

function showMsg(msg, title = "提示") {
  const t = document.getElementById('modalTitle');
  const m = document.getElementById('modalMsg');
  if (t) t.innerText = title;
  if (m) m.innerText = msg;
  msgModal?.show();
}

// ====== Three 初始化 ======
function initThree() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  camera = new THREE.PerspectiveCamera(
    45,
    Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
    0.1,
    100000
  );

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
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
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer) renderer.render(scene, camera);
}

// ====== Three 渲染结果（沿用你原逻辑，数据结构不变）=====
function renderResult(packedItems, binSizeMM, rowColors) {
  if (!scene || !camera || !controls) return;

  window.lastBinSize = binSizeMM;

  // ✅ 正确清场：remove 而不是替换 children 数组
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const obj = scene.children[i];
    if (obj.isLight || obj.isCamera) continue;
    scene.remove(obj);
  }

  // ✅ 网格/坐标轴：用于确认渲染链路正常
  const grid = new THREE.GridHelper(
    Math.max(binSizeMM[0], binSizeMM[2]),
    20,
    0x334155,
    0x1f2937
  );
  grid.position.set(binSizeMM[0] / 2, 0, binSizeMM[2] / 2);
  scene.add(grid);

  const axes = new THREE.AxesHelper(Math.max(...binSizeMM) * 0.2);
  axes.position.set(0, 0, 0);
  scene.add(axes);

  // 画大箱子边框
  const container = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(binSizeMM[0], binSizeMM[1], binSizeMM[2])),
    new THREE.LineBasicMaterial({ color: 0x38bdf8 })
  );
  container.position.set(binSizeMM[0] / 2, binSizeMM[1] / 2, binSizeMM[2] / 2);
  scene.add(container);

  // 画货物（packedItems: [{name, pos:[x,y,z], dim:[w,h,d]}]）
  const packed = Array.isArray(packedItems) ? packedItems : [];
  for (const it of packed) {
    if (!it || !it.pos || !it.dim) continue;

    // it.name 格式：{name}#{rowIndex}
    const parts = String(it.name || '').split('#');
    const rowIdx = parts.length > 1 ? parseInt(parts[1], 10) : 0;

    const w = Number(it.dim?.[0] || 0);
    const h = Number(it.dim?.[1] || 0);
    const d = Number(it.dim?.[2] || 0);
    if (!(w > 0 && h > 0 && d > 0)) continue;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(w - 2, 1), Math.max(h - 2, 1), Math.max(d - 2, 1)),
      new THREE.MeshLambertMaterial({ color: rowColors[rowIdx] || '#3b82f6' })
    );

    mesh.position.set(
      Number(it.pos?.[0] || 0) + w / 2,
      Number(it.pos?.[1] || 0) + h / 2,
      Number(it.pos?.[2] || 0) + d / 2
    );
    scene.add(mesh);
  }

  // ✅ 视角居中
  const max = Math.max(...binSizeMM);
  camera.position.set(max * 1.5, max * 1.2, max * 1.5);
  controls.target.set(binSizeMM[0] / 2, binSizeMM[1] / 2, binSizeMM[2] / 2);
  camera.lookAt(controls.target);
  controls.update();
}


// ====== Vue App（UMD，全局 Vue）=====
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const COLOR_OPTIONS = [
  { h: "#ef4444", n: "红" },
  { h: "#22c55e", n: "绿" },
  { h: "#3b82f6", n: "蓝" },
  { h: "#eab308", n: "黄" },
  { h: "#a855f7", n: "紫" },
  { h: "#f97316", n: "橙" },
  { h: "#ffffff", n: "白" }
];

const DEFAULT_ROW_COLORS = COLOR_OPTIONS.map(c => c.h);

function makeItemRow(i) {
  const c = DEFAULT_ROW_COLORS[i % DEFAULT_ROW_COLORS.length];
  return {
    id: uid(),
    name: `BOX-${i + 1}`,
    w: 1,
    h: 1,
    d: 1,
    unit: 'm',
    color: c,
    count: 10
  };
}

function setLoader(show) {
  const el = document.getElementById('loader');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function mountVue() {
  const Vue = window.Vue;
  if (!Vue) {
    showMsg("Vue 未加载成功（请检查 vue.global.prod.js 引入）", "错误");
    return;
  }

  const { createApp, computed, nextTick } = Vue;

  const app = createApp({
    data() {
      return {
        bin: { w: 1, h: 1, d: 1, unit: 'm' },
        items: [makeItemRow(0)],
        result: {
          show: false,
          packedCount: 0,
          totalCount: 0,
          unpackedCount: 0,

          unpackedList: [],
packRate: 0,
          volSpaceText: ''
        },
        colors: COLOR_OPTIONS
      };
    },

    computed: {
      binSizeMM() {
        const f = unitFactors[this.bin.unit] || 1;
        return [
          Math.round((parseFloat(this.bin.w) || 0) * f),
          Math.round((parseFloat(this.bin.h) || 0) * f),
          Math.round((parseFloat(this.bin.d) || 0) * f)
        ];
      },

      rowColors() {
        return this.items.map(it => it.color);
      },

      itemsForBackend() {
        // 后端只要 mm + count + name（name 带 rowIdx，便于上色）
        return this.items.map((it, idx) => {
          const f = unitFactors[it.unit] || 1;
          const w = Math.round((parseFloat(it.w) || 0) * f);
          const h = Math.round((parseFloat(it.h) || 0) * f);
          const d = Math.round((parseFloat(it.d) || 0) * f);
          const qty = parseInt(it.count, 10) || 0;
          return { name: `${it.name}#${idx}`, w, h, d, count: qty };
        });
      },

      totalQty() {
        return this.items.reduce((s, it) => s + (parseInt(it.count, 10) || 0), 0);
      }
    },

    methods: {
      addRow() {
        this.items.push(makeItemRow(this.items.length));
        // 小屏时滚到新增行
        nextTick(() => {
          const list = document.getElementById('item-list');
          list?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      },

      removeRow(idx) {
        this.items.splice(idx, 1);
      },

      colorStyle(hex) {
        // 白色 option 字体需要黑色
        const isWhite = String(hex).toLowerCase() === '#ffffff';
        return { backgroundColor: hex, color: isWhite ? '#000' : '#fff', textAlign: 'left' };
      },

      validate() {
        const bin = this.binSizeMM;
        if (Math.max(...bin) > 20000) {
          showMsg("大箱子单边长度不能超过 20 米", "错误");
          return false;
        }

        if (this.items.length === 0) {
          showMsg("请至少添加一种有效的货物", "提示");
          return false;
        }

        if (this.totalQty > 5000) {
          showMsg("货物总数不能超过 5000 个", "错误");
          return false;
        }

        // 至少有一个 item 能装进 bin（按最宽松旋转判断：排序比较）
        let atLeastOneFits = false;
        const sortedBin = [...bin].sort((a, b) => a - b);

        for (const it of this.itemsForBackend) {
          const sortedItem = [it.w, it.h, it.d].sort((a, b) => a - b);
          if (sortedItem[0] <= sortedBin[0] && sortedItem[1] <= sortedBin[1] && sortedItem[2] <= sortedBin[2] && it.count > 0) {
            atLeastOneFits = true;
            break;
          }
        }

        if (this.items.length > 0 && !atLeastOneFits) {
          showMsg("没有任何货物的尺寸能装入当前大箱子！", "箱子错误");
          return false;
        }

        return true;
      },

      async run() {
        if (!this.validate()) return;

        try {
          setLoader(true);

          const res = await fetch('/api/v1/tools/packing/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bin_size: this.binSizeMM, items: this.itemsForBackend })
          });

          const data = await res.json();

          if (data.status === 'success') {
            // 3D 渲染
            const emptyHint = document.getElementById('empty-hint');
            if (emptyHint) emptyHint.style.display = 'none';
            renderResult(data.items, this.binSizeMM, this.rowColors);

            // 统计面板（Vue 数据驱动）
            const packed = data.items || [];
            const unpacked = data.unpacked || [];

            this.result.show = true;
            this.result.packedCount = packed.length;
            this.result.totalCount = this.totalQty;
            this.result.unpackedCount = unpacked.reduce((s,u)=> s + (Number(u.left)||0), 0);
            this.result.unpackedList = unpacked.map(u => ({...u, displayName: String(u.name||'').split('#')[0]}));
            this.result.packRate = this.totalQty > 0 ? Math.round((packed.length / this.totalQty) * 100) : 0;

            // 体积与空间（保留你原来的表达方式）
            const binV = this.binSizeMM[0] * this.binSizeMM[1] * this.binSizeMM[2];
            let packedV = 0;
            for (const it of packed) {
              packedV += (it.dim?.[0] || 0) * (it.dim?.[1] || 0) * (it.dim?.[2] || 0);
            }
            const spaceRate = binV > 0 ? Math.round((packedV / binV) * 100) : 0;
            this.result.volSpaceText = `体积利用率: ${spaceRate}%`;

            // 小屏自动收起侧边栏
            if (window.innerWidth <= 768) sidebar?.classList.remove('show');
          } else {
            showMsg(data.message || "装箱算法返回失败");
          }
        } catch (e) {
          showMsg("连接服务器失败，请检查网络设置", "错误");
        } finally {
          setLoader(false);
        }
      }
    },

    mounted() {
      // 让原 HTML 的按钮/容器变为 Vue 驱动：这里将 DOM 替换为模板
      // 通过 v-cloak/模板，我们只负责数据；HTML 里用 v-model 绑定。
    }
  });

  app.mount('#app');
}

// ====== 绑定模板（在 HTML 里用 Vue 指令替换 item-list 区域）=====
function patchTemplateToVue() {
  // 将原本 #item-list 的静态内容替换成 Vue 模板（一次性）
  const itemList = document.getElementById('item-list');
  if (!itemList) return;

  itemList.innerHTML = `
    <div class="item-card animate-fade-in" v-for="(it, idx) in items" :key="it.id">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div class="d-flex align-items-center">
          <span class="badge bg-primary bg-opacity-10 text-primary me-2">#{{ idx + 1 }}</span>
          <input type="text" class="form-control form-control-sm it-name border-0 bg-transparent fw-bold text-white"
                 v-model="it.name" style="width:110px;">
        </div>
        <button class="btn btn-link text-secondary p-0 btn-hover-danger" type="button" @click="removeRow(idx)">
          <i class="bi bi-trash3-fill"></i>
        </button>
      </div>

      <div class="row g-2 mb-3">
        <div class="col-3 input-label-hint" data-hint="宽(W)">
          <input type="number" class="form-control form-control-sm text-center" v-model.number="it.w">
        </div>
        <div class="col-3 input-label-hint" data-hint="高(H)">
          <input type="number" class="form-control form-control-sm text-center" v-model.number="it.h">
        </div>
        <div class="col-3 input-label-hint" data-hint="深(D)">
          <input type="number" class="form-control form-control-sm text-center" v-model.number="it.d">
        </div>
        <div class="col-3 input-label-hint" data-hint="单位(UNIT)">
          <select class="form-select form-select-sm text-center" v-model="it.unit">
            <option value="m">m</option>
            <option value="cm">cm</option>
            <option value="mm">mm</option>
          </select>
        </div>
      </div>

      <div class="d-flex align-items-center gap-3">
        <div class="flex-grow-1">
          <select class="form-select form-select-sm color-block-select"
                  v-model="it.color"
                  :style="{ background: it.color }"
                  style="height:34px; border-radius:10px !important;">
            <option v-for="c in colors" :value="c.h" :style="colorStyle(c.h)">
              {{ c.n }}
            </option>
          </select>
        </div>
        <div class="input-group input-group-sm w-50">
          <span class="input-group-text bg-transparent border-secondary text-secondary">数量</span>
          <input type="number" class="form-control text-center fw-bold text-warning bg-black"
                 v-model.number="it.count">
        </div>
      </div>
    </div>
  `;
}

function patchBinInputsToVue() {
  // 让 bin 输入支持 v-model：给元素加上 v-model 属性（一次性）
  const bw = document.getElementById('bin-w');
  const bh = document.getElementById('bin-h');
  const bd = document.getElementById('bin-d');
  const bu = document.getElementById('bin-unit');
  if (bw) { bw.setAttribute('v-model.number', 'bin.w'); }
  if (bh) { bh.setAttribute('v-model.number', 'bin.h'); }
  if (bd) { bd.setAttribute('v-model.number', 'bin.d'); }
  if (bu) { bu.setAttribute('v-model', 'bin.unit'); }
}

function patchButtonsAndStatsToVue() {
  // add-row / run-btn 绑定到 Vue
  const add = document.getElementById('add-row');
  const run = document.getElementById('run-btn');
  if (add) add.setAttribute('@click', 'addRow');
  if (run) run.setAttribute('@click', 'run');

  // 结果面板：用 v-show 控制显示，用插值显示数据
  const panel = document.getElementById('result-panel');
  if (panel) { panel.classList.remove('d-none'); panel.setAttribute('v-show', 'result.show'); }

  const statPacked = document.getElementById('stat-packed');
  if (statPacked) statPacked.innerText = '{{ result.packedCount }} / {{ result.totalCount }}';

  const packRate = document.getElementById('pack-rate');
  if (packRate) packRate.innerText = '装载率: {{ result.packRate }}%';

  const volSpace = document.getElementById('vol-space');
  if (volSpace) volSpace.innerText = '{{ result.volSpaceText }}';


  // 未装入列表：交给 Vue 渲染
  const uc = document.getElementById('unpacked-container');
  if (uc) { uc.classList.remove('d-none'); uc.setAttribute('v-show', 'result.unpackedList.length > 0'); }

  const ul = document.getElementById('unpacked-list');
  if (ul) {
    // 不用模板字符串，避免反引号复制导致 SyntaxError
    ul.innerHTML =
      '<div class="d-flex justify-content-between align-items-center px-2 py-1 rounded-3 mb-2" ' +
      'style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);" ' +
      'v-for="u in result.unpackedList" :key="u.name">' +
        '<div class="text-white small">{{ u.displayName }}</div>' +
        '<div class="text-danger fw-bold small">{{ u.left }} / {{ u.total }}</div>' +
      '</div>';
  }

}

// ====== 启动 ======
initThree();

// 把关键 DOM 节点 patch 成 Vue 模板/指令
patchTemplateToVue();
patchBinInputsToVue();
patchButtonsAndStatsToVue();

// 最后再 mount（保证模板已变成 Vue 可识别）
mountVue();
