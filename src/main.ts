import "./style.css";
import * as THREE from 'three';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import gsap from "gsap";

import { TexturesLibrary } from "./textures";

// HDRI
import cobblestoneUrl from './assets/hdri/cobblestone_parish_road_1k.hdr';
import germanTownUrl from './assets/hdri/german_town_street_1k.hdr';
import docklandsUrl from './assets/hdri/docklands_02_1k.hdr';
import parkUrl from './assets/hdri/charolettenbrunn_park_1k.hdr';

const pricing = {
    base: 15000,
    dimensions: { widthMax: 2500, depthMax: 3000 },
    exterior_finishes: {
        'black bricks':    0,
        'red bricks':       800,
        'white sandstone': 1200,
        'wood planks':     1500,
    },
    door_variants: {
        'Door_1': 0,
        'Door_2': 450,
        'Door_3': 600,
        'Door_4': 850,
        'Door_Animated': 2300,
    },
    door_finishes: {
        'Anthracite': 0,
        'White': 0,
        'Oak': 250,
        'Walnut': 300,
    },
    roof_variants: {
        'None': 0,
        'Skylight_Lean_1': 0,
        'Skylight_Lean_2': 800,
        'Skylight_Lean_3': 1500,
        'Skylight_Lean_4': 1500,
        'Skylight_Lean_5': 1500,
        'Skylight_Gable_4': 1500,
    },
    pipe_layouts: {
        'None': 0, 
        'Left Only': 150, 
        'Right Only': 150, 
        'Both': 250
    },
    pipe_finishes: {
        'Black PVC': 0, 
        'Zinc': 100, 
        'White Plastic': 200
    }
};

const state = {
    width: 0,
    depth: 0,
    hdri: 'Cobblestone',
    sunIntensity: 2.5,
    sunAzimuth: 45,
    sunElevation: 30,
    isPlaying: true,
    current_total: pricing.base,

    exterior_finish: 'black bricks',
    door_finish: 'White',
    pipe_finish: 'Zinc',
    door_variant: 'Door_1',
    roof_variant: 'None',
    pipe_layout: 'Left Only',
};

const cameraState = {
    isInterior: false,
    interiorPos: new THREE.Vector3(),
    interiorTarget: new THREE.Vector3(),
    exteriorPos: new THREE.Vector3(),
    exteriorTarget: new THREE.Vector3()
};

// --- Three.js Setup ---
const scene = new THREE.Scene();
const canvasContainer = document.getElementById('canvas-container')!;
const containerWidth = canvasContainer.clientWidth;
const containerHeight = canvasContainer.clientHeight;

const camera = new THREE.PerspectiveCamera(32, containerWidth / containerHeight, 0.1, 1000);
camera.position.set(0, 4, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(containerWidth, containerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasContainer.appendChild(renderer.domElement);

const size = renderer.getDrawingBufferSize(new THREE.Vector2());
const renderTarget = new THREE.WebGLRenderTarget(size.width, size.height, { samples: 4 });

const composer = new EffectComposer(renderer, renderTarget);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const ktx2Loader = new KTX2Loader();
ktx2Loader
    .setTranscoderPath('/basis/')
    .detectSupport(renderer);

const gtaoPass = new GTAOPass(scene, camera, containerWidth/2, containerHeight/2);
gtaoPass.output = GTAOPass.OUTPUT.Default;
gtaoPass.updateGtaoMaterial({
    radius: 0.5,
    distanceExponent: 1.0, 
    distanceFallOff: 1.0,
    thickness: 1.0
});
composer.addPass(gtaoPass);

// const ssaoPass = new SSAOPass(scene, camera, containerWidth, containerHeight);
// ssaoPass.output = SSAOPass.OUTPUT.SSAO;
// ssaoPass.kernelRadius = 4.0;
// ssaoPass.minDistance = 0.0001;
// ssaoPass.maxDistance = 0.01;
// composer.addPass(ssaoPass);
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
const filmPass = new FilmPass(0.2, false);
composer.addPass(filmPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

// --- Lighting & Shadows ---
const sunLight = new THREE.DirectionalLight(0xffffff, state.sunIntensity);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.bias = -0.0001;
scene.add(sunLight);

function updateSunPosition() {
    const radius = 20;
    // Convert elevation and azimuth to radians
    // Elevation (phi): 0 is top, Math.PI/2 is horizon. We subtract from 90 to invert typical UI expectations.
    const phi = THREE.MathUtils.degToRad(90 - state.sunElevation); 
    const theta = THREE.MathUtils.degToRad(state.sunAzimuth);

    sunLight.position.setFromSphericalCoords(radius, phi, theta);
    sunLight.intensity = state.sunIntensity;
}
updateSunPosition();

const controls = new OrbitControls(camera, renderer.domElement);
controls.minPolarAngle = -0
controls.maxPolarAngle = Math.PI/2;
controls.enableDamping = true;
controls.autoRotate = false;

// HDRI ----------------------- 
const rgbeLoader = new HDRLoader();
const hdriLibrary: Record<string, string> = {
    'Cobblestone':       cobblestoneUrl,
    'German Town Street': germanTownUrl,
    'DockLands':          docklandsUrl,
    'Park':               parkUrl
};

function loadEnvironment(hdriName: string)
{
    const path = hdriLibrary[hdriName];
    if (!path) return;

    rgbeLoader.load(path, (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        scene.environmentIntensity = 0.8;
    });
}
loadEnvironment(state.hdri);
// ----------------------- 

// MaterialsLibrary ----------------------- 
const MaterialsLibrary: Record<string, THREE.MeshStandardMaterial> = {
    'Anthracite': new THREE.MeshStandardMaterial({
        color: '#383E42',
        roughness: 0.2,
        metalness: 0.8,
    }),
    'White': new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.5,
    }),
    'Oak': new THREE.MeshStandardMaterial({
        color: '#a0855b',
        roughness: 0.8,
        metalness: 0.0
    }),
    'Walnut': new THREE.MeshStandardMaterial({
        color: '#4a3728',
        roughness: 0.7,
        metalness: 0.0
    }),
    'Black PVC': new THREE.MeshStandardMaterial({ 
        color: '#222222', 
        metalness: 0.0,   
        roughness: 0.35   
    }),
    'Zinc': new THREE.MeshStandardMaterial({ 
        color: '#BAC4C8', 
        metalness: 1.0,   
        roughness: 0.45,
        // normalMap: TexturesLibrary['Black Metal'].normalMap,
        // roughnessMap: TexturesLibrary['Black Metal'].roughnessMap,
    }),
    'White Plastic': new THREE.MeshStandardMaterial({ 
        color: '#ececec', 
        metalness: 0.0,   
        roughness: 0.3    
    }),
};

const textureCache: Record<string, THREE.Texture> = {};

async function getTexture(path: string, isColorMap: boolean = false): Promise<THREE.Texture> {
    if (textureCache[path]) {
        return textureCache[path];
    }
    const tex = await ktx2Loader.loadAsync(path);
    
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = isColorMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    
    textureCache[path] = tex;
    return tex;
}

async function getMaterialForOption(materialKey: string): Promise<THREE.MeshStandardMaterial> {
    const matData = TexturesLibrary[materialKey];

    const [diffuseMap, normalMap, roughnessMap] = await Promise.all([
        getTexture(matData.diff, true),
        getTexture(matData.norm),
        getTexture(matData.rough)
    ]);

    const mat = new THREE.MeshStandardMaterial({
        map: diffuseMap,
        normalMap: normalMap,
        roughnessMap: roughnessMap,
        color: 0xffffff
    });

    applyWorldSpaceUVs(mat, 0.5);
    return mat;
}

// Refrence to the door frame material. The same material is shared between all
// the doors, so changing it will have a global effect on all of the frames.
let door_mat: THREE.MeshStandardMaterial;
let pipe_mat: THREE.MeshStandardMaterial;

const [exterior_mat, roof_mat, floor_mat] = await Promise.all([
    getMaterialForOption(state.exterior_finish),
    getMaterialForOption('black metal'),
    getMaterialForOption('marble tiles')
]);

function changeDoorMaterial()
{
    if (!door_mat) return;
    door_mat.copy(MaterialsLibrary[state.door_finish]);
    door_mat.needsUpdate = true;
}

function changePipeMaterial() {
    if (!pipe_mat) return;
    pipe_mat.copy(MaterialsLibrary[state.pipe_finish]);
    pipe_mat.needsUpdate = true;
}
// ----------------------- 

const base: Record<string, THREE.Mesh> = {};
const roofRegistry: { [key: string]: THREE.Mesh } = {};
const doorRegistry: { [key: string]: THREE.Object3D } = {};

const gltfLoader = new GLTFLoader();
// gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
dracoLoader.preload();
gltfLoader.setDRACOLoader(dracoLoader);

const loaderScreen = document.getElementById('loader-screen');
const loaderText = document.getElementById('loader-text');

const dynamicFurniture: THREE.Object3D[] = [];
let mixer: THREE.AnimationMixer|null = null;

gltfLoader.load("/model-opt.glb", (gltf) => {

    const shadowPlaneGeometry = new THREE.PlaneGeometry(100, 100);
    const shadowPlaneMaterial = new THREE.ShadowMaterial({ opacity: 0.4, color: 0x000000 });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeometry, shadowPlaneMaterial);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0;
    shadowPlane.receiveShadow = true;
    gltf.scene.add(shadowPlane);

    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Reposition the model so its center is at (0,0,0)
    model.position.x += (model.position.x - center.x);
    model.position.y += (model.position.y - center.y);
    model.position.z += (model.position.z - center.z)

    const blenderCamera = gltf.scene.getObjectByName('InteriorCamera');
    if (blenderCamera) {
        blenderCamera.getWorldPosition(cameraState.interiorPos);
        const direction = new THREE.Vector3();
        blenderCamera.getWorldDirection(direction);
        cameraState.interiorTarget.copy(cameraState.interiorPos).add(direction);
    } else {
        console.warn("InteriorCamera not found in the GLTF model.");
    }

    // Material setup
    gltf.scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) {
            const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
            if (mat && (mat as THREE.MeshPhysicalMaterial).transmission > 0) {
                mesh.castShadow = false; 
                mesh.receiveShadow = true;
            } else {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
            }
        }
    });

    base.rightWall      = gltf.scene.getObjectByName("RightWall") as THREE.Mesh;
    base.leftWall       = gltf.scene.getObjectByName("LeftWall") as THREE.Mesh;
    base.backWall       = gltf.scene.getObjectByName("BackWall") as THREE.Mesh;
    base.frontLeftWall  = gltf.scene.getObjectByName("FrontLeft") as THREE.Mesh;
    base.frontRightWall = gltf.scene.getObjectByName("FrontRight") as THREE.Mesh;
    base.frontTopWall   = gltf.scene.getObjectByName("FrontTop") as THREE.Mesh;
    base.floor          = gltf.scene.getObjectByName("Floor") as THREE.Mesh;
    base.roofRight      = gltf.scene.getObjectByName("RoofRight") as THREE.Mesh;
    base.roofLeft       = gltf.scene.getObjectByName("RoofLeft") as THREE.Mesh;
    base.roofBack       = gltf.scene.getObjectByName("RoofBack") as THREE.Mesh;

    base.pipeLeft       = gltf.scene.getObjectByName("PipeLeft") as THREE.Mesh;
    base.pipeRight      = gltf.scene.getObjectByName("PipeRight") as THREE.Mesh;
    pipe_mat = base.pipeLeft.material as THREE.MeshStandardMaterial;

    base.roofRight.material = roof_mat;
    base.roofLeft.material  = roof_mat;
    base.roofBack.material  = roof_mat;

    base.floor.material  = floor_mat;

    (base.backWall.children[0] as THREE.Mesh).material       = exterior_mat;
    (base.leftWall.children[0] as THREE.Mesh).material       = exterior_mat;
    (base.rightWall.children[0] as THREE.Mesh).material      = exterior_mat;
    (base.frontLeftWall.children[0] as THREE.Mesh).material  = exterior_mat;
    (base.frontRightWall.children[0] as THREE.Mesh).material = exterior_mat;
    (base.frontTopWall.children[0] as THREE.Mesh).material   = exterior_mat;

    const door_frame_obj = gltf.scene.getObjectByName("Door_1");
    if (door_frame_obj) {
        door_mat = (door_frame_obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
    }

    Object.keys(pricing.door_variants).forEach(name => {
        const obj = gltf.scene.getObjectByName(name) as THREE.Group;
        if (obj) {
            doorRegistry[name] = obj;
            obj.visible = (name === state.door_variant);
        }
    });

    mixer = new THREE.AnimationMixer(gltf.scene);
    if (gltf.animations && gltf.animations.length > 0) {
        gltf.animations.forEach((clip) => {
            const action = mixer!.clipAction(clip);
            action.setLoop(THREE.LoopPingPong, Infinity);
            action.play();
        });
    }

    const is_hidden = (state.roof_variant !== "None");
    base.roofLeft.visible  = is_hidden;
    base.roofRight.visible = is_hidden;
    base.roofBack.visible  = is_hidden;
    Object.keys(pricing.roof_variants).forEach(name => {
        const mesh = gltf.scene.getObjectByName(name) as THREE.Mesh;
        if (mesh) {
            roofRegistry[name] = mesh;
            (mesh.children[0] as THREE.Mesh).material = roof_mat;
            mesh.visible = (name === state.roof_variant);
        }
    });

    // Anchoring the furniture
    const sofa = gltf.scene.getObjectByName("Sofa") as THREE.Mesh;
    sofa.userData.anchorX = 'LeftWall';
    sofa.userData.anchorZ = 'LeftWall';
    sofa.userData.offsetX = sofa.position.x - base.leftWall.position.x;
    sofa.userData.offsetZ = sofa.position.z - base.leftWall.position.z;
    dynamicFurniture.push(sofa);

    const painting = gltf.scene.getObjectByName("Painting") as THREE.Mesh;
    painting.userData.anchorX = 'LeftWall';
    painting.userData.offsetX = painting.position.x - base.leftWall.position.x;
    dynamicFurniture.push(painting);

    const plant = gltf.scene.getObjectByName("Plant") as THREE.Mesh;
    plant.userData.anchorX = 'LeftWall';
    plant.userData.offsetX = plant.position.x - base.leftWall.position.x;
    dynamicFurniture.push(plant);

    const tv = gltf.scene.getObjectByName("TV") as THREE.Mesh;
    tv.userData.anchorX = 'RightWall';
    tv.userData.anchorZ = 'RightWall';
    tv.userData.offsetX = tv.position.x - base.rightWall.position.x;
    tv.userData.offsetZ = tv.position.z - base.rightWall.position.z;
    dynamicFurniture.push(tv);

    const cabinet = gltf.scene.getObjectByName("cabinet") as THREE.Mesh;
    cabinet.userData.anchorZ = 'BackWall';
    cabinet.userData.offsetZ = cabinet.position.z - base.backWall.position.z;
    cabinet.userData.visibleDepth = 0.8;
    dynamicFurniture.push(cabinet);

    updateFurnitureAnchors();

    changePipeMaterial();
    changeDoorMaterial();
    scene.add(gltf.scene);

    if (loaderScreen) {
        gsap.to(loaderScreen, {
            yPercent: -100,
            duration: 1.2,
            ease: "power4.inOut",
            delay: 0.0, 
            onComplete: () => {
                loaderScreen.style.display = 'none';
            }
        });
    }
},
    (xhr) => {
        if (loaderText && xhr.total > 0) {
            const percent = Math.round((xhr.loaded / xhr.total) * 100);
            loaderText.innerText = `${Math.min(percent, 100)}%`; 
            const barFill = document.getElementById('loader-bar-fill');
            const text = document.getElementById('loader-text');

            if (barFill) barFill.style.width = `${percent}%`;
            if (text) text.innerText = `${Math.round(percent)}%`;
        }
    },
    (error) => {
        console.error('An error happened loading the model:', error);
        if (loaderText) loaderText.innerText = 'Error';
    }
);


// --- DOM UI Logic ---
const lightingToggle = document.getElementById('lighting-toggle');
const lightingContent = document.getElementById('lighting-content');
const lightingArrow = document.getElementById('lighting-arrow');

if (lightingToggle && lightingContent && lightingArrow) {
    lightingToggle.addEventListener('click', () => {
        // Toggle the hidden class on the content container
        lightingContent.classList.toggle('hidden');

        // Rotate the arrow icon if it is open
        if (lightingContent.classList.contains('hidden')) {
            lightingArrow.classList.remove('-rotate-180');
        } else {
            lightingArrow.classList.add('-rotate-180');
        }
    });
}
function createOptionButton(label: string, cost: number, isActive: boolean, onClick: () => void) {
    const btn = document.createElement('button');
    btn.className = `flex flex-col items-start p-4 border rounded-xl transition-all duration-300 ease-out text-left ${isActive ? 'border-black bg-lime-400 text-black shadow-md' : 'border-neutral-200 bg-white hover:border-neutral-400 text-neutral-900'}`;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'font-bold text-sm';
    titleSpan.innerText = label;

    btn.appendChild(titleSpan);

    // Only show cost if it's relevant (HDRIs might not have a cost)
    if (cost !== -1) {
        const costSpan = document.createElement('span');
        costSpan.className = `text-xs mt-1 ${isActive ? 'text-black' : 'text-neutral-500'}`;
        costSpan.innerText = cost > 0 ? `+$${cost}` : 'Included';
        btn.appendChild(costSpan);
    }

    btn.onclick = onClick;
    return btn;
}

function updateUI() {
    // Render HDRIs
    const hdriContainer = document.getElementById('hdri-options')!;
    hdriContainer.innerHTML = '';
    Object.keys(hdriLibrary).forEach((hdriName) => {
        // Passing -1 for cost hides the cost text
        const btn = createOptionButton(hdriName, -1, state.hdri === hdriName, () => {
            state.hdri = hdriName;
            loadEnvironment(hdriName);
            updateUI();
        });
        hdriContainer.appendChild(btn);
    });

    // Exterior Finishes
    const materialContainer = document.getElementById('material-options')!;
    materialContainer.innerHTML = '';

    Object.entries(pricing.exterior_finishes).forEach(([finish, cost]) => {
        const btn = createOptionButton(finish, cost, state.exterior_finish === finish, async () => {
            state.exterior_finish = finish;
            const new_finish = await getMaterialForOption(finish);
            exterior_mat.copy(new_finish);
            updateStateAndCost();
            updateUI();
        });

        materialContainer.appendChild(btn);
    });

    // Doors Variants
    const doorContainer = document.getElementById('door-options')!;
    doorContainer.innerHTML = '';
    Object.entries(pricing.door_variants).forEach(([variant, cost]) => {
        const btn = createOptionButton(variant.replace('_', ' '), cost, state.door_variant === variant, () => {
            state.door_variant = variant;
            Object.keys(doorRegistry).forEach(name => {
                if (doorRegistry[name])
                    doorRegistry[name].visible = (name === variant);
            });
            updateStateAndCost();
            updateUI();
        });
        doorContainer.appendChild(btn);
    });

    // Door Finishes
    const finishContainer = document.getElementById('door-color-options')!;
    finishContainer.innerHTML = '';
    Object.entries(pricing.door_finishes).forEach(([finish, cost]) => {
        const btn = createOptionButton(finish, cost, state.door_finish === finish, () => {
            state.door_finish = finish;
            changeDoorMaterial();
            updateStateAndCost();
            updateUI();
        });

        const swatch = document.createElement('div');
        swatch.className = 'w-4 h-4 rounded-full mt-2 border border-white/20 shadow-sm';
        swatch.style.backgroundColor = MaterialsLibrary[finish].color.getStyle();
        btn.appendChild(swatch);

        finishContainer.appendChild(btn);
    });

    // Roof variants
    const roofContainer = document.getElementById('roof-options');
    if (roofContainer) {
        roofContainer.innerHTML = '';
        Object.entries(pricing.roof_variants).forEach(([variant, cost]) => {
            const btn = createOptionButton(variant.replace('_', ' '), cost, state.roof_variant === variant, () => {
                state.roof_variant = variant;
                const hide_roof = (variant !== "None");
                base.roofLeft.visible  = hide_roof;
                base.roofRight.visible = hide_roof;
                base.roofBack.visible  = hide_roof;
                Object.keys(roofRegistry).forEach(name => {
                    if (roofRegistry[name]) {
                        roofRegistry[name].visible = (name === variant);
                    }
                });
                updateStateAndCost();
                updateUI();
            });
            roofContainer.appendChild(btn);
        });
    }

    // Pipe Layouts
    const pipeLayoutContainer = document.getElementById('pipe-options');
    if (pipeLayoutContainer) {
        pipeLayoutContainer.innerHTML = '';
        Object.entries(pricing.pipe_layouts).forEach(([layout, cost]) => {
            const btn = createOptionButton(layout, cost, state.pipe_layout === layout, () => {
                state.pipe_layout = layout;
                base.pipeLeft.visible  = (layout === 'Left Only' || layout === 'Both');
                base.pipeRight.visible = (layout === 'Right Only' || layout === 'Both');
                updateStateAndCost();
                updateUI();
            });
            pipeLayoutContainer.appendChild(btn);
        });
    }

    // Pipe Finishes
    const pipeFinishContainer = document.getElementById('pipe-material-options');
    if (pipeFinishContainer) {
        pipeFinishContainer.innerHTML = '';
        Object.entries(pricing.pipe_finishes).forEach(([finish, cost]) => {
            const btn = createOptionButton(finish, cost, state.pipe_finish === finish, () => {
                state.pipe_finish = finish;
                changePipeMaterial();
                updateStateAndCost();
                updateUI();
            });
            pipeFinishContainer.appendChild(btn);
        });
    }

    const animationBtn = document.getElementById('animation-toggle');
    if (animationBtn) {
        const isAnimatedDoor = true;//= state.door_variant === 'Door_Animated'; 

        if (isAnimatedDoor) {
            animationBtn.classList.remove('hidden');
            animationBtn.classList.add('flex'); 
        } else {
            animationBtn.classList.add('hidden');
            animationBtn.classList.remove('flex');
        }
    }
}

function applyWorldSpaceUVs(material: THREE.MeshStandardMaterial, textureScale: number) {
    material.onBeforeCompile = (shader) => {
        // 1. Vertex Shader: Pass World Position and World Normal
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
varying vec3 vAbsoluteWorldPos;
varying vec3 vWorldNormalTriplanar;`
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            `#include <worldpos_vertex>
vAbsoluteWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldNormalTriplanar = normalize((modelMatrix * vec4(normal, 0.0)).xyz);`
        );

        // 2. Fragment Shader: Receive varyings
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
varying vec3 vAbsoluteWorldPos;
varying vec3 vWorldNormalTriplanar;`
        );

        // 3. Fragment Shader: 3-Axis Projection Logic
        shader.fragmentShader = shader.fragmentShader.replace(
            'void main() {',
            `void main() {
vec3 absNormal = abs(vWorldNormalTriplanar);
vec2 worldSpaceUv;

// Determine which way the face is pointing to assign the correct grid axes
if (absNormal.y >= absNormal.x && absNormal.y >= absNormal.z) {
// Face points UP or DOWN (Top/Bottom edges) -> Use X and Z grid
worldSpaceUv = vec2(vAbsoluteWorldPos.x, vAbsoluteWorldPos.z);

} else if (absNormal.x >= absNormal.z) {
// Face points LEFT or RIGHT -> Use Z and Y grid
worldSpaceUv = vec2(vAbsoluteWorldPos.z, vAbsoluteWorldPos.y);

} else {
// Face points FORWARD or BACKWARD -> Use X and Y grid
worldSpaceUv = vec2(vAbsoluteWorldPos.x, vAbsoluteWorldPos.y);
}

worldSpaceUv *= ${textureScale.toFixed(5)};

// Overwrite the read-only varyings
#define vUv worldSpaceUv
#define vMapUv worldSpaceUv
#define vNormalMapUv worldSpaceUv
#define vAoMapUv worldSpaceUv
#define vRoughnessMapUv worldSpaceUv
#define vMetalnessMapUv worldSpaceUv
`
        );
    };

    material.customProgramCacheKey = () => textureScale.toString(); 
}

function updateFurnitureAnchors() {

    dynamicFurniture.forEach(item => {
        if (item.userData.visibleDepth) {
            item.visible = state.depth > item.userData.visibleDepth;
        } else if (item.userData.visibleWidth) {
            item.visible = state.width > item.userData.visibleWidth;
        } else if (item.userData.anchorX === 'LeftWall') {
            item.position.x = base.leftWall.position.x + item.userData.offsetX;
        } else if (item.userData.anchorX === 'RightWall') {
            item.position.x = base.rightWall.position.x + item.userData.offsetX;
        }

        if (item.userData.anchorZ === 'RightWall') {
            item.position.z = base.rightWall.position.z + (item.userData.offsetZ * base.rightWall.scale.z);
        } else if (item.userData.anchorZ === 'LeftWall') {
            item.position.z = base.leftWall.position.z + (item.userData.offsetZ * base.leftWall.scale.z);
        } else if (item.userData.anchorZ === 'BackWall') {
            item.position.z = base.backWall.position.z + item.userData.offsetZ;
        }
    });

} 

// Sliders Logic
const max_width = 1.0;
document.getElementById('width-slider')?.addEventListener('input', (e) => {
    updateFurnitureAnchors();
    state.width = parseFloat((e.target as HTMLInputElement).value);
    const addedWidth = state.width * max_width;
    base.leftWall.position.x = -addedWidth;
    base.rightWall.position.x = addedWidth - 0.05; // A slight error in the model!
    base.floor.scale.x = 1.0 + addedWidth/2 + 0.025;
    base.backWall.scale.x = 1.0 + addedWidth/2 + 0.020;
    base.frontRightWall.scale.x = 1.0 + addedWidth*1.8;
    base.frontLeftWall.scale.x = 1.0 + addedWidth*1.7;
    base.roofRight.scale.x = 1.0 + addedWidth*20;
    base.roofLeft.scale.x = -1.0 - addedWidth*20;
    base.roofBack.scale.x = 1.0 + addedWidth/2.35;

    document.getElementById('width-cost')!.innerText = `+$${Math.round(state.width * pricing.dimensions.widthMax)}`;
    updateStateAndCost();
});
const max_depth = 1.0;

document.getElementById('depth-slider')?.addEventListener('input', (e) => {
    updateFurnitureAnchors();
    state.depth = parseFloat((e.target as HTMLInputElement).value);
    const addedDepth = state.depth * max_depth;
    base.backWall.position.z = -addedDepth; 
    base.leftWall.scale.z = 1.0 + addedDepth*0.252;
    base.rightWall.scale.z = 1.0 + addedDepth*0.252;
    base.floor.scale.z = 1.0 + addedDepth/3.5;
    base.roofBack.scale.z = -1.0 + -addedDepth*20;

    // Update Pricing UI
    document.getElementById('depth-cost')!.innerText = `+$${Math.round(state.depth * pricing.dimensions.depthMax)}`;
    updateStateAndCost();
});

// Sun Sliders
document.getElementById('intensity-slider')?.addEventListener('input', (e) => {
    state.sunIntensity = parseFloat((e.target as HTMLInputElement).value);
    document.getElementById('intensity-val')!.innerText = state.sunIntensity.toFixed(1);
    updateSunPosition();
});
document.getElementById('azimuth-slider')?.addEventListener('input', (e) => {
    state.sunAzimuth = parseFloat((e.target as HTMLInputElement).value);
    updateSunPosition();
});
document.getElementById('elevation-slider')?.addEventListener('input', (e) => {
    state.sunElevation = parseFloat((e.target as HTMLInputElement).value);
    updateSunPosition();
});

function updateStateAndCost() {
    const dimension_cost = ((state.width || 0) * pricing.dimensions.widthMax) +
                           ((state.depth || 0) * pricing.dimensions.depthMax);
    const exterior_cost = pricing.exterior_finishes[state.exterior_finish as keyof typeof pricing.exterior_finishes];
    const door_variant_cost = pricing.door_variants[state.door_variant as keyof typeof pricing.door_variants];
    const door_finish_cost  = pricing.door_finishes[state.door_finish as keyof typeof pricing.door_finishes];
    const roof_variant_cost = pricing.roof_variants[state.roof_variant as keyof typeof pricing.roof_variants];
    const pipe_layout_cost  = pricing.pipe_layouts[state.pipe_layout as keyof typeof pricing.pipe_layouts];
    const pipe_finish_cost  = pricing.pipe_finishes[state.pipe_finish as keyof typeof pricing.pipe_finishes];

    const total = pricing.base + dimension_cost + exterior_cost + door_variant_cost +
        door_finish_cost + roof_variant_cost + pipe_layout_cost + pipe_finish_cost;

    const priceElement = document.getElementById('total-price')!;
    gsap.to(state, {
        current_total: total,
        duration: 0.5,
        ease: "power2.out",
        onUpdate: () => {
            priceElement.innerText = Math.round(state.current_total).toLocaleString();
        }
    });
}

updateUI();

// --- Resize & Render Loop ---
window.addEventListener('resize', () => {
    const newWidth = canvasContainer.clientWidth;
    const newHeight = canvasContainer.clientHeight;

    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(newWidth, newHeight);
    composer.setSize(newWidth, newHeight);
});

const timer = new THREE.Timer();
function animate() {
    timer.update();
    const delta = timer.getDelta();
    if (mixer && state.isPlaying) {
        mixer.update(delta);
    }
    requestAnimationFrame(animate);
    controls.update();
    composer.render();
}

animate();

function toggleCameraView() {
    const toggleText = document.getElementById('camera-toggle-text');
    if (!toggleText) return;

    cameraState.isInterior = !cameraState.isInterior;

    if (cameraState.isInterior) {
        cameraState.exteriorPos.copy(camera.position);
        cameraState.exteriorTarget.copy(controls.target);

        animateCamera(cameraState.interiorPos, cameraState.interiorTarget);
        toggleText.innerText = 'Exit Interior';
    } else {
        animateCamera(cameraState.exteriorPos, cameraState.exteriorTarget);
        toggleText.innerText = 'Enter Interior';
    }
}

function animateCamera(targetPosition: THREE.Vector3, targetLookAt: THREE.Vector3) {
    controls.enabled = false;
    gsap.to(camera.position, {
        x: targetPosition.x,
        y: targetPosition.y,
        z: targetPosition.z,
        duration: 1.5,
        ease: "power3.inOut"
    });
    gsap.to(controls.target, {
        x: targetLookAt.x,
        y: targetLookAt.y,
        z: targetLookAt.z,
        duration: 1.5,
        ease: "power3.inOut",
        onUpdate: () => {
            controls.update(); 
        },
        onComplete: () => {
            controls.enabled = true;
        }
    });
}

document.getElementById('animation-toggle')?.addEventListener('click', () => {
    state.isPlaying = !state.isPlaying;
    const textEl = document.getElementById('animation-text');
    const iconEl = document.getElementById('animation-icon');
    if (textEl && iconEl) {
        textEl.innerText = state.isPlaying ? 'Pause Animation' : 'Play Animation';
        iconEl.innerText = state.isPlaying ? 'pause' : 'play_arrow';
    }
});

document.getElementById('camera-toggle')?.addEventListener('click', toggleCameraView);
