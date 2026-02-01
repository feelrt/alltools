import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls, group;

export function initScene(id) {
    const el = document.getElementById(id);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 10000);
    camera.position.set(200, 200, 200);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.5);
    sun.position.set(100, 200, 100);
    scene.add(sun);

    controls = new OrbitControls(camera, renderer.domElement);
    const animate = () => { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
    animate();
}

export function drawResult(binSize, items, unit) {
    if(group) scene.remove(group);
    group = new THREE.Group();
    const scale = unit === 'm' ? 100 : 1;
    const [bw, bh, bd] = binSize.map(v => v * scale);

    const binGeo = new THREE.BoxGeometry(bw, bh, bd);
    const binEdges = new THREE.EdgesGeometry(binGeo);
    const binWire = new THREE.LineSegments(binEdges, new THREE.LineBasicMaterial({ color: 0xffffff }));
    binWire.position.set(bw/2, bh/2, bd/2);
    group.add(binWire);

    items.forEach(item => {
        const g = new THREE.BoxGeometry(item.dim[0], item.dim[1], item.dim[2]);
        const m = new THREE.MeshPhongMaterial({ color: item.color, transparent: true, opacity: 0.8 });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(item.pos[0]+item.dim[0]/2, item.pos[1]+item.dim[1]/2, item.pos[2]+item.dim[2]/2);

        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.2 }));
        mesh.add(edge);
        group.add(mesh);
    });

    scene.add(group);
    camera.position.set(bw*1.5, bh*1.5, bd*1.5);
    controls.target.set(bw/2, bh/2, bd/2);
}