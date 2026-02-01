import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
const unitFactors = { "m": 1000, "cm": 10, "mm": 1 };

const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const msgModal = new bootstrap.Modal(document.getElementById('msgModal'));

document.getElementById('sidebar-toggle').onclick = () => sidebar.classList.add('show');
overlay.onclick = () => sidebar.classList.remove('show');

function showMsg(msg, title = "提示") {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMsg').innerText = msg;
    msgModal.show();
}

function initThree() {
    const container = document.getElementById('canvas-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    // 响应手势操作优化
    controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN
    };
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(1, 1, 1);
    scene.add(dl);
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
    animate();
}
function animate() { requestAnimationFrame(animate); if(controls) controls.update(); if(renderer) renderer.render(scene, camera); }

// 修复颜色下拉列表，给文字着色
function getColorOptionsHTML() {
    const colors = [
        {h:"#ef4444",n:"红"}, {h:"#22c55e",n:"绿"}, {h:"#3b82f6",n:"蓝"},
        {h:"#eab308",n:"黄"}, {h:"#a855f7",n:"紫"}, {h:"#f97316",n:"橙"}, {h:"#ffffff",n:"白"}
    ];
    return colors.map(c => `<option value="${c.h}" style="background-color:${c.h}; color:${c.h==='#ffffff'?'#000':'#fff'}; text-align:left;">${c.n}</option>`).join('');
}

document.getElementById('add-row').onclick = () => {
    const list = document.getElementById('item-list');
    const rowNum = list.children.length + 1;
    const card = document.createElement('div');
    card.className = "item-card animate-fade-in";
    card.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div class="d-flex align-items-center">
                <span class="badge bg-primary bg-opacity-10 text-primary me-2">#${rowNum}</span>
                <input type="text" class="form-control form-control-sm it-name border-0 bg-transparent fw-bold text-white" value="BOX-${rowNum}" style="width:110px;">
            </div>
            <button class="btn btn-link text-secondary p-0 btn-hover-danger" onclick="this.closest('.item-card').remove()"><i class="bi bi-trash3-fill"></i></button>
        </div>
        <div class="row g-2 mb-3">
            <div class="col-3 input-label-hint" data-hint="宽(W)"><input type="number" class="form-control form-control-sm it-w text-center" value="1"></div>
            <div class="col-3 input-label-hint" data-hint="高(H)"><input type="number" id="box-h-${rowNum}" class="form-control form-control-sm it-h text-center" value="1"></div>
            <div class="col-3 input-label-hint" data-hint="深(D)"><input type="number" class="form-control form-control-sm it-d text-center" value="1"></div>
            <div class="col-3 input-label-hint" data-hint="单位(UNIT)">
                <select class="form-select form-select-sm it-unit text-center"><option value="m">m</option><option value="cm">cm</option><option value="mm">mm</option></select>
            </div>
        </div>
        <div class="d-flex align-items-center gap-3">
            <div class="flex-grow-1">
                <select class="form-select form-select-sm it-color color-block-select" style="height:34px; border-radius:10px !important;">
                    ${getColorOptionsHTML()}
                </select>
            </div>
            <div class="input-group input-group-sm w-50">
                <span class="input-group-text bg-transparent border-secondary text-secondary">数量</span>
                <input type="number" class="form-control it-count text-center fw-bold text-warning bg-black" value="10">
            </div>
        </div>
    `;
    list.appendChild(card);

    // --- 在 add-row 的结尾处修改 ---
    const sel = card.querySelector('.it-color');
    const rowColors = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#f97316", "#ffffff"];

    // 初始颜色
    const initialColor = rowColors[(rowNum - 1) % rowColors.length];
    sel.value = initialColor;

    // 🎯 用这种方式涂色，浏览器拦截不了
    sel.style.background = initialColor;
    sel.style.setProperty('background-color', initialColor, 'important');

    sel.onchange = function() {
        // 改变时同步更新
        this.style.background = this.value;
        this.style.setProperty('background-color', this.value, 'important');
    };
};

document.getElementById('run-btn').onclick = async () => {
    const loader = document.getElementById('loader');
    const bF = unitFactors[document.getElementById('bin-unit').value];
    const binSizeMM = [
        Math.round(parseFloat(document.getElementById('bin-w').value)*bF),
        Math.round(parseFloat(document.getElementById('bin-h').value)*bF),
        Math.round(parseFloat(document.getElementById('bin-d').value)*bF)
    ];

    if (Math.max(...binSizeMM) > 20000) return showMsg("大箱子单边长度不能超过 20 米", "错误");

    const rows = document.querySelectorAll('.item-card');
    let itemsForBackend = [], rowColors = [], totalQty = 0, atLeastOneFits = false;

    rows.forEach((row, i) => {
        const f = unitFactors[row.querySelector('.it-unit').value];
        const w = Math.round(parseFloat(row.querySelector('.it-w').value)*f);
        const h = Math.round(parseFloat(row.querySelector('.it-h').value)*f);
        const d = Math.round(parseFloat(row.querySelector('.it-d').value)*f);
        const qty = parseInt(row.querySelector('.it-count').value) || 0;

        totalQty += qty;
        rowColors[i] = row.querySelector('.it-color').value;
        itemsForBackend.push({ name: `${row.querySelector('.it-name').value}#${i}`, w, h, d, count: qty });

        const sortedBin = [...binSizeMM].sort((a,b)=>a-b);
        const sortedItem = [w,h,d].sort((a,b)=>a-b);
        if (sortedItem[0]<=sortedBin[0] && sortedItem[1]<=sortedBin[1] && sortedItem[2]<=sortedBin[2]) atLeastOneFits = true;
    });

    if (rows.length > 0 && !atLeastOneFits) return showMsg("没有任何货物的尺寸能装入当前大箱子！", "箱子错误");
    if (totalQty > 5000) return showMsg("货物总数不能超过 5000 个", "错误");
    if (itemsForBackend.length === 0) return showMsg("请至少添加一种有效的货物", "提示");

    try {
        loader.style.display = 'flex';
        const res = await fetch('/api/v1/tools/packing/calculate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ bin_size: binSizeMM, items: itemsForBackend })
        });
        const data = await res.json();
        if (data.status === "success") {
            document.getElementById('empty-hint').style.display = 'none';
            renderResult(data.items, binSizeMM, rowColors);
            updateStatsUI(data.items, data.unpacked, totalQty, binSizeMM);
            if (window.innerWidth <= 768) sidebar.classList.remove('show');
        } else {
            showMsg(data.message || "装箱算法返回失败");
        }
    } catch (e) {
        showMsg("连接服务器失败，请检查网络设置", "错误");
    } finally {
        loader.style.display = 'none';
    }
};

function renderResult(items, binSizeMM, rowColors) {
    window.lastBinSize = binSizeMM;
    scene.children = scene.children.filter(o => o.isLight || o.isCamera);
    const container = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(binSizeMM[0], binSizeMM[1], binSizeMM[2])),
        new THREE.LineBasicMaterial({color:0x38bdf8})
    );
    container.position.set(binSizeMM[0]/2, binSizeMM[1]/2, binSizeMM[2]/2);
    scene.add(container);
    items.forEach(it => {
        const rowIdx = parseInt(it.name.split('#')[1]);
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(it.dim[0]-2, it.dim[1]-2, it.dim[2]-2),
            new THREE.MeshLambertMaterial({color: rowColors[rowIdx]})
        );
        mesh.position.set(it.pos[0]+it.dim[0]/2, it.pos[1]+it.dim[1]/2, it.pos[2]+it.dim[2]/2);
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({color:0x000000, transparent:true, opacity:0.3})));
        scene.add(mesh);
    });
    const max = Math.max(...binSizeMM);
    camera.position.set(max*1.5, max*1.5, max*1.5);
    controls.target.set(binSizeMM[0]/2, binSizeMM[1]/2, binSizeMM[2]/2);
}

function updateStatsUI(packed, unpacked, total, binSize) {
    const resultPanel = document.getElementById('result-panel');
    resultPanel.classList.remove('d-none');

    document.getElementById('stat-packed').innerText = `${packed.length} / ${total}`;

    const packRateEl = document.getElementById('pack-rate');
    if (packRateEl) packRateEl.innerText = `装载率: ${total > 0 ? Math.round((packed.length/total)*100) : 0}%`;

    const volSpaceEl = document.getElementById('vol-space');
    if (volSpaceEl) {
        const binV = binSize[0]*binSize[1]*binSize[2];
        let packedV = 0;
        packed.forEach(it => packedV += it.dim[0]*it.dim[1]*it.dim[2]);
        volSpaceEl.innerText = `余: ${((binV-packedV)/1e9).toFixed(3)} m³`;
    }

    // --- 修复未装载清单显示 ---
    const upCont = document.getElementById('unpacked-container');
    const upList = document.getElementById('unpacked-list');
    if (unpacked && unpacked.length > 0) {
        upCont.classList.remove('d-none');
        upList.innerHTML = unpacked.map(i => `
            <div class="unpacked-item d-flex justify-content-between align-items-center">
                <span class="fw-bold">${i.name.split('#')[0]}</span>
                <span class="badge bg-danger rounded-pill px-3">剩余 ${i.left} 件</span>
            </div>
        `).join('');
    } else {
        upCont.classList.add('d-none');
    }
}

document.getElementById('btn-reset-view').onclick = () => window.lastBinSize && renderResult([], window.lastBinSize, []);
document.getElementById('btn-auto-rotate').onclick = function() {
    controls.autoRotate = !controls.autoRotate;
    this.classList.toggle('btn-primary');
};

initThree();
document.getElementById('add-row').click();