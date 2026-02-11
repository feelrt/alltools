import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Bootstrap + Vue(UMD) + Three.js
 * - Vue 负责：表单/列表/统计面板（数据驱动 UI，不再手写 DOM）
 * - Three 负责：3D 渲染（保持你原来的渲染风格/性能）
 */

let scene, camera, renderer, controls;

const unitFactors = { m: 1000, dm: 100, cm: 10, mm: 1 };


// ====== Modal（保持原样）======
const msgModalEl = document.getElementById('msgModal');
const msgModal = msgModalEl ? new bootstrap.Modal(msgModalEl) : null;


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
if (!container.contains(renderer.domElement)) {
    container.appendChild(renderer.domElement);
  }

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

  // 1. 清理场景
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const obj = scene.children[i];
    if (obj.isLight || obj.isCamera) continue;
    scene.remove(obj);
  }

  // 2. 网格与坐标轴
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

  // 3. 画大箱子蓝框
  const container = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(binSizeMM[0], binSizeMM[1], binSizeMM[2])),
    new THREE.LineBasicMaterial({ color: 0x38bdf8 })
  );
  container.position.set(binSizeMM[0] / 2, binSizeMM[1] / 2, binSizeMM[2] / 2);
  scene.add(container);

  // 4. 画货物
  const packed = Array.isArray(packedItems) ? packedItems : [];
  for (const it of packed) {
    if (!it || !it.pos || !it.dim) continue;

    // 解析颜色索引
    const parts = String(it.name || '').split('#');
    const rowIdx = parts.length > 1 ? parseInt(parts[1], 10) : 0;

    const w = Number(it.dim?.[0] || 0);
    const h = Number(it.dim?.[1] || 0);
    const d = Number(it.dim?.[2] || 0);
    if (!(w > 0 && h > 0 && d > 0)) continue;

    // [关键修改] 创建几何体
    const geometry = new THREE.BoxGeometry(Math.max(w, 1), Math.max(h, 1), Math.max(d, 1));

    // [关键修改] 材质开启多边形偏移，防止棱线闪烁
    const material = new THREE.MeshLambertMaterial({
        color: rowColors[rowIdx] || '#3b82f6',
        polygonOffset: true,
        polygonOffsetFactor: 1, // 让面稍微向后退一点
        polygonOffsetUnits: 1
    });

    const mesh = new THREE.Mesh(geometry, material);

    // [关键修改] 创建黑色棱线并粘在 mesh 上
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    mesh.add(line); // 作为子对象，会自动跟随位置

    // 设置位置
    mesh.position.set(
      Number(it.pos?.[0] || 0) + w / 2,
      Number(it.pos?.[1] || 0) + h / 2,
      Number(it.pos?.[2] || 0) + d / 2
    );

    scene.add(mesh);
  }

  // 5. 视角居中
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
    count: 10,
      // ✅ 新增：先填充状态字段（保证响应式稳定）
    prefilled: false,
    prefillBatchKey: null,
  };
}

function setLoader(show) {
  const el = document.getElementById('loader');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function mountVue() {
  const Vue = window.Vue;
  if (!Vue) {
    this.showMsg("Vue 未加载成功（请检查 vue.global.prod.js 引入）", "错误");
    return;
  }

  const { createApp, computed, nextTick } = Vue;

  const app = createApp({
    data() {
      return {
        sysMsg: { title: '系统提示', content: '' },
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
        colors: COLOR_OPTIONS,
        prefilledItems: [],
        prefillBatches: [],   // [{rowIdx, key, reqItem, packedItems:[], packedCount}]
        autoPackedItems: []
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
        // 新增这个方法：用 Vue 的方式显示弹窗
      showMsg(msg, title = "提示") {
          // 1. 更新数据 (Vue 会自动更新页面文字)
          this.sysMsg.content = msg;
          this.sysMsg.title = title;

          // 2. 弹出 Bootstrap 模态框
          // 必须要在 nextTick 里执行，确保文字已经渲染进去了再弹窗
          this.$nextTick(() => {
              const el = document.getElementById('msgModal');
              if (el) {
                  const modal = new bootstrap.Modal(el);
                  modal.show();
              }
          });
      },

      _totalQtyWithPrefill(){
        const base = (this.items || []).reduce((s,it)=> s + (parseInt(it.count,10)||0), 0);
        const pre = (this.prefillBatches || []).reduce((s,b)=> s + (Number(b.packedCount)||0), 0);
        return base + pre;
      },

      _calcUsedVolume(items){
        const arr = Array.isArray(items) ? items : [];
        let used = 0;
        for (const it of arr){
          const dim = it?.dim;
          if (Array.isArray(dim) && dim.length>=3){
            used += (Number(dim[0])||0) * (Number(dim[1])||0) * (Number(dim[2])||0);
          }else if (it && it.w!=null && it.h!=null && it.d!=null){
            used += (Number(it.w)||0) * (Number(it.h)||0) * (Number(it.d)||0);
          }
        }
        return used;
      },

        resetBin() {
  // 1) 把已经先填充扣掉的数量加回去，并清掉行状态
  if (Array.isArray(this.prefillBatches)) {
    for (const b of this.prefillBatches) {
      const r = this.items?.[b.rowIdx];
      if (r) {
        r.count = (parseInt(r.count, 10) || 0) + (b.packedCount || 0);
        r.prefilled = false;
        r.prefillBatchKey = null;
      }
    }
  }

  // 2) 清空所有“先填充/占位/智能计算结果”
  this.prefillBatches = [];
        // 注意：不要在这里清空 prefilledItems（它用于参与本次智能装箱/最终渲染）
this.autoPackedItems = [];   // 如果你没有这个字段也没关系，先加到 data() 里

  // 3) 清空统计面板（可选，但建议）
  if (this.result) {
    this.result.show = false;
    this.result.packedCount = 0;
    this.result.totalCount = this.totalQty || 0;
    this.result.unpackedCount = 0;
    this.result.unpackedList = [];
    this.result.packRate = 0;
    this.result.volSpaceText = '体积利用率: 0%';
  }

  // 4) 清空 3D（关键：不要 clearScene，直接渲染空数组）
  const emptyHint = document.getElementById('empty-hint');
  if (emptyHint) emptyHint.style.display = 'block';

  renderResult([], this.binSizeMM, this.rowColors);
},
      async prefillRowAsBatch(idx){
  // 规则：只要页面上“当前没有任何已执行先填充”的东西，点击【先填充】前必须先全量清空
  // （不管 3D 上是否还有渲染、不管上次智能计算是否有结果）
  const hasAnyManualPrefill = (Array.isArray(this.prefillBatches) && this.prefillBatches.length > 0)
    || (this.items || []).some(it => !!it.prefilled);
  if (!hasAnyManualPrefill) {
    this._hardClearBeforeRun();
  }

  if (!this.validate()) return;

  const row = this.items[idx];
  const qty = parseInt(row.count,10) || 0;
  if (qty <= 0) { this.showMsg("该行数量为0"); return; }

  const f = unitFactors[row.unit] || 1;

  // 记录这次点击的“请求物品”（用于撤销后重放/恢复数量）
  const reqItem = {
    name: `${row.name}#${idx}`,
    w: Math.round((parseFloat(row.w) || 0) * f),
    h: Math.round((parseFloat(row.h) || 0) * f),
    d: Math.round((parseFloat(row.d) || 0) * f),
    count: qty,
    unit: row.unit
  };

  // 每行一个稳定 key
  const batchKey = `${idx}-${Date.now()}`;

  try{
    setLoader(true);

    const newPacked = await this._callPacking([reqItem], this.prefilledItems);

    if (!newPacked || newPacked.length === 0){
      this.showMsg("当前空间不足，未能先填充任何箱子", "提示");
      return;
    }

    // 生成批次
    const batch = {
      rowIdx: idx,
      key: batchKey,
      reqItem: reqItem,
      packedItems: newPacked,
      packedCount: newPacked.length
    };

    // 更新批次与总占位
    this.prefillBatches.push(batch);
    this._rebuildPrefilledItems();

    // 更新行状态：按钮变“撤销先填充”
    row.prefilled = true;
    row.prefillBatchKey = batchKey;

    // 扣减数量（剩余留给后续智能计算）
    row.count = Math.max(0, qty - newPacked.length);

    // 重新渲染
    this._renderAll();

  } finally{
    setLoader(false);
  }
},
        async togglePrefill(idx){
          const row = this.items[idx];
          if (!row) return;

          if (!row.prefilled){
            await this.prefillRowAsBatch(idx);      // 先填充
          }else{
            await this.undoPrefillBatch(idx);       // 撤销先填充
          }
        },
        async undoPrefillBatch(idx){
  const row = this.items[idx];
  if (!row || !row.prefilled || !row.prefillBatchKey) return;

  const key = row.prefillBatchKey;
  const pos = this.prefillBatches.findIndex(b => b.key === key);
  if (pos < 0) return;

  // 先恢复数量（按该批次实际装进去的数量恢复）
  const batch = this.prefillBatches[pos];
  const restore = batch.packedCount || 0;
  row.count = (parseInt(row.count,10)||0) + restore;

  // 标记未先填充（按钮变回“先填充”）
  row.prefilled = false;
  row.prefillBatchKey = null;

  // 情况1：撤销的是最后一个 batch（最快）
  if (pos === this.prefillBatches.length - 1){
    this.prefillBatches.pop();
    this._rebuildPrefilledItems();
    this._renderAll();
    return;
  }

  // 情况2：撤销的是中间 batch：清空后重放其余 batch
  this.prefillBatches.splice(pos, 1);
  await this._replayAllPrefills();   // 重放其它批次（按顺序）
},
        async _replayAllPrefills(){
  try{
    setLoader(true);

    // 1) 先清空占位
        // 注意：不要在这里清空 prefilledItems（它用于参与本次智能装箱/最终渲染）
// 注意：每行的 count 现在已经是“撤销后正确的剩余数”，
    // 其他已先填充行要重新扣减，所以先把它们先“还原回去”，再重算扣减更稳
    for (const b of this.prefillBatches){
      const r = this.items[b.rowIdx];
      if (r){
        r.count = (parseInt(r.count,10)||0) + (b.packedCount || 0); // 先加回
      }
    }

    // 2) 逐个批次重算放置（按当前占位逐步累加）
    for (const b of this.prefillBatches){
      const r = this.items[b.rowIdx];
      if (!r) continue;

      // 用当下行的“可用数量”再算一次（这一步才扣减）
      const qty = parseInt(r.count,10) || 0;
      if (qty <= 0){
        // 放不了就把该行也取消先填充状态
        r.prefilled = false;
        r.prefillBatchKey = null;
        continue;
      }

      const reqItem = { ...b.reqItem, count: qty };

      const newPacked = await this._callPacking([reqItem], this.prefilledItems);

      b.packedItems = newPacked || [];
      b.packedCount = b.packedItems.length;

      // 扣减
      r.count = Math.max(0, qty - b.packedCount);

      // 保持行状态为已先填充
      r.prefilled = true;
      r.prefillBatchKey = b.key;

      // 累加占位
      this._rebuildPrefilledItems();
    }

    // 3) 最后渲染
    this._renderAll();

  } finally{
    setLoader(false);
  }
},
        async _callPacking(items, prefilled){
  const res = await fetch('/api/v1/tools/packing/calculate', {
    method:'POST',
    credentials: 'same-origin',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      phase: "prefill",
      bin_size: this.binSizeMM,
      items: items,
      prefilled: prefilled || []
    })
  });

  if (res.status === 401) { window.location.href = '/account/login.html'; throw new Error('未登录'); }
  if (res.status === 402) { window.location.href = '/account/buy.html'; throw new Error('积分不足'); }
  const data = await res.json();
  if (data.status !== 'success'){
    throw new Error(data.message || "计算失败");
  }
  return data.items || [];
},
        _rebuildPrefilledItems(){
  const all = [];
  for (const b of this.prefillBatches){
    if (b.packedItems && b.packedItems.length) all.push(...b.packedItems);
  }
  this.prefilledItems = all;
},

_renderAll(){
  // prefilledItems 已统一包含：先填充 + 本次智能装箱（source=auto）
  const all = Array.isArray(this.prefilledItems) ? this.prefilledItems : [];

  const emptyHint = document.getElementById('empty-hint');
  if (emptyHint) emptyHint.style.display = all.length ? 'none' : 'block';

  // 颜色映射一定要每次更新（否则第一次点总计算时可能 rowColors 还是空）
  //this.rowColors = this.items.map(it => ({ name: it.name, color: it.color }));

  renderResult(all, this.binSizeMM, this.rowColors);
},

      addRow() {
        this.items.push(makeItemRow(this.items.length));
        // 小屏时滚到新增行
        nextTick(() => {
          const list = document.getElementById('item-list');
          list?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      },

      removeRow(idx) {
          this.undoPrefillBatch(idx);
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
          this.showMsg("大箱子单边长度不能超过 20 米", "错误");
          return false;
        }

        if (this.items.length === 0) {
          this.showMsg("请至少添加一种有效的货物", "提示");
          return false;
        }

        if (this.totalQty > 5000) {
          this.showMsg("货物总数不能超过 5000 个", "错误");
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
          this.showMsg("没有任何货物的尺寸能装入当前大箱子！", "箱子错误");
          return false;
        }

        return true;
      },


      // ====== 点击“开始智能装箱计算”前的 UI/数据规则 ======
      _undoAllPrefillsDataOnly() {
        // 仅更新卡片数据：把所有“先填充”批次撤销掉（不强制驱动 3D）
        // 1) 先按批次恢复每行数量
        const batches = Array.isArray(this.prefillBatches) ? this.prefillBatches : [];
        for (const b of batches) {
          const r = this.items?.[b.rowIdx];
          if (!r) continue;
          const restore = Number(b.packedCount) || 0;
          r.count = (parseInt(r.count, 10) || 0) + restore;
        }

        // 2) 重置每行状态
        for (const r of (this.items || [])) {
          r.prefilled = false;
          r.prefillBatchKey = null;
        }

        // 3) 清空占位数据
        this.prefillBatches = [];
        // 注意：不要在这里清空 prefilledItems（它用于参与本次智能装箱/最终渲染）
},

      _hardClearBeforeRun() {
        // 当卡片没有任何“先填充”时：无论 3D 当前渲染了什么，都先彻底清空再计算
        this.autoPackedItems = [];
        // 这里的语义是“全量清空历史计算结果”，因此需要把 prefilledItems 也清空。
        // 注意：这个分支只会在「当前没有任何先填充」时触发，所以不会影响用户已先填充的固定位置。
        this.prefilledItems = [];
        this.prefillBatches = [];

        for (const r of (this.items || [])) {
          r.prefilled = false;
          r.prefillBatchKey = null;
        }

        if (this.result) {
          this.result.show = false;
          this.result.packedCount = 0;
          this.result.totalCount = this.totalQty;
          this.result.unpackedCount = 0;
          this.result.unpackedList = [];
          this.result.packRate = 0;
        }


        // ✅ 不要手写 DOM 清空（会破坏 Vue 的虚拟 DOM，触发 insertBefore 报错）
        // 这里统一用数据驱动 UI。


        // 清空 3D（复用你已有的渲染总入口）
        this._renderAll();
      },
async run() {
  // 规则：点击按钮后先处理卡片“先填充/撤销先填充”的一致性
  const hadAnyPrefill = (this.items || []).some(it => !!it.prefilled);

  // 2) 若当前卡片没有任何“先填充”，不管 3D 当前是否渲染了任何东西，都先清空再执行
  if (!hadAnyPrefill) {
    this._hardClearBeforeRun();
  }

  // ✅ 体验优化（优先级最高）：
  // 如果剩余待装箱数量为 0（典型场景：用户把所有箱子都“先填充”了），
  // 则不应该继续走 validate() 的“没有可装入货物/尺寸不匹配”分支。
  // 这里必须放在 validate() 之前，否则会弹出错误的“箱子错误”提示。
  const remainingQty = (this.items || []).reduce((s, it) => s + (parseInt(it.count, 10) || 0), 0);
  if (remainingQty <= 0) {
    // 只要存在先填充（卡片状态 or 预填充列表），就说明“不是没添加货物，而是都先填充了”。
    const hasAnyPrefilled = hadAnyPrefill || ((this.prefilledItems || []).length > 0);
    if (hasAnyPrefilled) {
      this.showMsg("没有剩余的箱子需要填充了。", "提示");
    } else {
      this.showMsg("请先添加需要装箱的货物。", "提示");
    }
    return;
  }

  if (!this.validate()) return;

  // 组装 itemsForAuto（你原来怎么写就保留）
  const itemsForAuto = [];
  for (let i = 0; i < this.items.length; i++) {
    const it = this.items[i];
    const qty = parseInt(it.count, 10) || 0;
    if (qty <= 0) continue;

    const f = unitFactors[it.unit] || 1;
    itemsForAuto.push({
      name: `${it.name}#${i}`,
      w: Math.round((parseFloat(it.w) || 0) * f),
      h: Math.round((parseFloat(it.h) || 0) * f),
      d: Math.round((parseFloat(it.d) || 0) * f),
      count: qty
    });
  }

  // ✅ 体验优化：如果没有任何“剩余待装箱”的箱子，就不再发起总智能计算请求
  // （例如：用户把所有箱子都先填充了，此时 run 只会重复算一次，且体验上应该给提示）
  if (itemsForAuto.length === 0) {
    this.showMsg("没有剩余的箱子需要填充了。", "提示");
    return;
  }

  try {
    setLoader(true);

    const resp = await fetch('/api/v1/tools/packing/calculate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bin_size: this.binSizeMM,
        items: itemsForAuto,
        prefilled: this.prefilledItems || []
      })
    });

    if (resp.status === 401) { window.location.href = '/account/login.html'; return; }
    if (resp.status === 402) { window.location.href = '/account/buy.html'; return; }

    // ✅ 只要 HTTP 本身失败，就当网络/服务异常
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} ${resp.statusText} ${txt}`);
    }

    const data = await resp.json();

    if (data.status !== 'success') {
      throw new Error(data.message || '后端返回非 success');
    }

    // ====== 1) 渲染：这里已经证明请求成功 ======
    const newPacked = Array.isArray(data.items) ? data.items : [];
    this.autoPackedItems = newPacked;
    // ✅ 统一占位集合（最关键这行）
    this.prefilledItems = [
      ...(this.prefilledItems || []).filter(it => it.source !== 'auto'), // 先去掉旧的auto
      ...newPacked.map(it => ({ ...it, source: 'auto' }))                // 加入新的auto
    ];
    this._renderAll();

    // ====== 2) 统计：这里加容错，避免 undefined.reduce 炸掉 ======
    // prefilledItems 已经是“统一集合”，这里不要再把 autoPackedItems 拼一次，避免重复统计/重复渲染。
    const allPacked = [...(this.prefilledItems || [])];
    const unpackedArr = Array.isArray(data.unpacked) ? data.unpacked : []; // ✅ 容错

    this.result.show = true;
    this.result.packedCount = allPacked.length;
    const totalQtyAtRun = this._totalQtyWithPrefill();
    this.result.totalCount = totalQtyAtRun;

    this.result.unpackedCount = unpackedArr.reduce((s, u) => s + (Number(u.left) || 0), 0);
    this.result.unpackedList = unpackedArr.map(u => ({
      ...u,
      displayName: String(u.name || '').split('#')[0]
    }));

    this.result.packRate = totalQtyAtRun > 0
      ? Math.round((allPacked.length / totalQtyAtRun) * 100)
      : 0;
    // ====== 3) 空间/体积利用率（把先填充也算进去） ======
    const binVol = (this.binSizeMM[0] || 0) * (this.binSizeMM[1] || 0) * (this.binSizeMM[2] || 0);
    const usedVol = this._calcUsedVolume(allPacked);
    const volRate = binVol > 0 ? Math.round((usedVol / binVol) * 100) : 0;
    this.result.volSpaceText = `体积利用率: ${volRate}%`;



    // 1) 需求：总智能计算完成并渲染/统计更新后，再把卡片上的“先填充”状态撤销掉（仅卡片数据，不影响 3D/结果）
    // 这样可以保证：参与计算的 prefilled 位置不会因为提前撤销而变化。
    this._undoAllPrefillsDataOnly();
  } catch (e) {
    // ✅ 这里不要再写死“连接服务器失败”
    // 把真实异常显示出来，你才能定位到是哪一行炸了
    this.showMsg(e?.message || String(e), "错误");
  } finally {
    setLoader(false);
  }
}
    },

    mounted() {
      // 1. 初始化 3D 场景 (这是刚才修复的)
      this.$nextTick(() => {
          initThree();
      });

      // 2. 修复侧边栏点击事件 (这是现在要加的)
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      const toggleBtn = document.getElementById('sidebar-toggle');

      if (toggleBtn && sidebar) {
          toggleBtn.onclick = () => sidebar.classList.add('show');
      }
      if (overlay && sidebar) {
          overlay.onclick = () => sidebar.classList.remove('show');
      }

      // 3. 绑定其他原有按钮
      const resetBtn = document.getElementById('btn-reset-view');
      if (resetBtn) {
          resetBtn.onclick = () => {
             if (window.lastBinSize) renderResult([], window.lastBinSize, []);
          };
      }

      const rotateBtn = document.getElementById('btn-auto-rotate');
      if (rotateBtn) {
          rotateBtn.onclick = function() {
              if (controls) controls.autoRotate = !controls.autoRotate;
              this.classList.toggle('btn-primary');
          };
      }
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
      <div class="d-flex justify-content-between align-items-center mb-3 gap-3">
        <div class="d-flex align-items-center">
          <span class="badge bg-primary bg-opacity-10 text-primary me-2">#{{ idx + 1 }}</span>
          <div class="field-wrap" :class="{ locked: it.prefilled }">
            <input type="text" class="form-control form-control-sm it-name border-0 bg-transparent fw-bold text-white"
                   v-model="it.name" :disabled="it.prefilled" style="width:110px;">
            <i v-if="it.prefilled" class="bi bi-lock-fill field-lock-icon"></i>
          </div>
        </div>
        <div class="field-wrap w-50" :class="{ locked: it.prefilled }">
          <div class="input-group input-group-sm">
            <span class="input-group-text bg-transparent border-secondary text-secondary">数量</span>
            <input type="number" class="form-control text-center fw-bold text-warning bg-black"
                   v-model.number="it.count" :disabled="it.prefilled">
          </div>
          <i v-if="it.prefilled" class="bi bi-lock-fill field-lock-icon"></i>
        </div>
        <button class="btn btn-link text-secondary p-0 btn-hover-danger" type="button" @click="removeRow(idx)" :disabled="it.prefilled">
          <i class="bi bi-trash3-fill"></i>
        </button>
      </div>

      <div class="row g-2 mb-3">
        <div class="col-3 input-label-hint" data-hint="宽(W)">
          <div class="field-wrap" :class="{ locked: it.prefilled }">
            <input type="number" class="form-control form-control-sm text-center" v-model.number="it.w" :disabled="it.prefilled">
            <i v-if="it.prefilled" class="bi bi-lock-fill field-lock-icon"></i>
          </div>
        </div>
        <div class="col-3 input-label-hint" data-hint="高(H)">
          <div class="field-wrap" :class="{ locked: it.prefilled }">
            <input type="number" class="form-control form-control-sm text-center" v-model.number="it.h" :disabled="it.prefilled">
            <i v-if="it.prefilled" class="bi bi-lock-fill field-lock-icon"></i>
          </div>
        </div>
        <div class="col-3 input-label-hint" data-hint="深(D)">
          <div class="field-wrap" :class="{ locked: it.prefilled }">
            <input type="number" class="form-control form-control-sm text-center" v-model.number="it.d" :disabled="it.prefilled">
            <i v-if="it.prefilled" class="bi bi-lock-fill field-lock-icon"></i>
          </div>
        </div>
        <div class="col-3 input-label-hint" data-hint="单位(UNIT)">
          <div class="field-wrap" :class="{ locked: it.prefilled }">
            <select class="form-select form-select-sm text-center" v-model="it.unit" :disabled="it.prefilled">
              <option value="m">m</option>
              <option value="dm">dm</option>
              <option value="cm">cm</option>
              <option value="mm">mm</option>
            </select>
            <i v-if="it.prefilled" class="bi bi-lock-fill field-lock-icon"></i>
          </div>
        </div>
      </div>

      <div class="d-flex align-items-center gap-3">
        <div class="flex-grow-1">
          <div class="field-wrap" :class="{ locked: it.prefilled }">
            <div class="dropdown w-100">
              <button class="btn btn-sm w-100 d-flex align-items-center justify-content-between border border-secondary"
                      type="button"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                      :disabled="it.prefilled"
                      style="height:34px; border-radius:10px; background: rgba(0,0,0,0.35);">
                <span class="color-swatch color-swatch--active" :style="{ background: it.color }"></span>
                <i class="bi bi-chevron-down ms-2 text-secondary"></i>
              </button>

              <ul class="dropdown-menu dropdown-menu-dark w-100">
                <li v-for="c in colors" :key="c.h">
                  <button class="dropdown-item color-dd-item"
                          type="button"
                          @click="it.color = c.h" :disabled="it.prefilled">
                    <span class="color-swatch" :style="{ background: c.h }"></span>
                  </button>
                </li>
              </ul>
            </div>
            <i v-if="it.prefilled" class="bi bi-lock-fill field-lock-icon"></i>
          </div>
        </div>
        <button class="btn btn-sm btn-outline-info input-group input-group-sm w-25" type="button"
            @click="togglePrefill(idx)"
            :disabled="(!it.prefilled && (parseInt(it.count,10)||0) <= 0)"
            style="height:34px; border-radius:10px; white-space:nowrap;">{{ it.prefilled ? '撤销先填充' : '先填充' }}
        </button>
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
      // 用 (u,i) + 复合 key，避免同名项导致 key 冲突
      'v-for="(u,i) in result.unpackedList" :key="u.name + \'-\' + i">' +
        '<div class="text-white small">{{ u.displayName }}</div>' +
        '<div class="text-danger fw-bold small">{{ u.left }} / {{ u.total }}</div>' +
      '</div>';
  }

}


// 把关键 DOM 节点 patch 成 Vue 模板/指令
patchTemplateToVue();
patchBinInputsToVue();
patchButtonsAndStatsToVue();

// 最后再 mount（保证模板已变成 Vue 可识别）
mountVue();
