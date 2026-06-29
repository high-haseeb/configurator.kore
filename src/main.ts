import "./style.css";
import * as THREE from 'three';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import gsap from "gsap";
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// --- Pricing & State Configuration ---
const pricing = {
    base: 15000,
    dimensions: { widthMax: 2500, depthMax: 3000 },
    materials: {
        'Black Bricks': 0, 'Red Brick': 800, 'Red Brick 02': 850,
        'White Sand Stone': 1200, 'Wood Planks': 1500, 'Cladding': 2000
    },
    doors: {
        'Door_1': 0,
        'Door_2': 450,
        'Door_3': 600,
        'Door_4': 850,
        'Door_Animated': 2300,
    },
    finishes: {
        'Anthracite': 0, 'White': 0, 'Oak': 250, 'Walnut': 300
    },
    roofs: {
        'None': 0,
        'Skylight_Lean_1': 0,
        'Skylight_Lean_2': 800,
        'Skylight_Lean_3': 1500,
        'Skylight_Lean_4': 1500,
        'Skylight_Lean_5': 1500,
        'Skylight_Gable_4': 1500,
    },
    pipeLayout: {
        'None': 0, 
        'Left Only': 150, 
        'Right Only': 150, 
        'Both': 250
    },
    pipeMaterials: {
        'Black PVC': 0, 
        'Zinc': 100, 
        'White Plastic': 200
    }
};

const state = {
    width: 0,
    depth: 0,
    material: 'Black Bricks',
    doorModel: 'Door_1',
    doorFinish: 'Anthracite',
    roofVariant: 'Skylight_Lean_1',
    hdri: 'Cobblestone',
    sunIntensity: 2.5,
    sunAzimuth: 45,
    sunElevation: 30,
    currentTotal: pricing.base,
    pipeLayout: 'Left Only',
    pipeMaterial: 'Black PVC',
    isPlaying: true,
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

const ssaoPass = new SSAOPass(scene, camera, containerWidth, containerHeight);
ssaoPass.kernelRadius = 4.0;
ssaoPass.minDistance = 0.0001;
ssaoPass.maxDistance = 0.01;
composer.addPass(ssaoPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

// --- Lighting & Shadows ---
const sunLight = new THREE.DirectionalLight(0xffffff, state.sunIntensity);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.bias = -0.0001;
scene.add(sunLight);

const shadowPlaneGeometry = new THREE.PlaneGeometry(100, 100);
const shadowPlaneMaterial = new THREE.ShadowMaterial({ opacity: 0.4, color: 0x000000 });
const shadowPlane = new THREE.Mesh(shadowPlaneGeometry, shadowPlaneMaterial);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = -1.31;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

// Helper function to calculate sun position from UI angles
function updateSunPosition() {
    const radius = 20;
    // Convert elevation and azimuth to radians
    // Elevation (phi): 0 is top, Math.PI/2 is horizon. We subtract from 90 to invert typical UI expectations.
    const phi = THREE.MathUtils.degToRad(90 - state.sunElevation); 
    const theta = THREE.MathUtils.degToRad(state.sunAzimuth);

    sunLight.position.setFromSphericalCoords(radius, phi, theta);
    sunLight.intensity = state.sunIntensity;
}
updateSunPosition(); // Set initial position

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;

// --- HDRI Setup ---
const rgbeLoader = new RGBELoader();
const hdriLibrary: Record<string, string> = {
    'Cobblestone': './hdri/cobblestone_parish_road_1k.hdr',
    'German Town Street': './hdri/german_town_street_1k.hdr', 
    'DockLands': './hdri/docklands_02_1k.hdr',
    'Park': './hdri/charolettenbrunn_park_1k.hdr'
};

function loadEnvironment(hdriName: string) {
    const path = hdriLibrary[hdriName];
    if (!path) return;

    rgbeLoader.load(path, (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        scene.environmentIntensity = 0.8;
        // scene.background = texture; // Uncomment if you want to see the skybox instead of a solid color
    });
}
loadEnvironment(state.hdri); // Load initial

// --- Materials Setup ---
const textureLoader = new THREE.TextureLoader();
const materialLibrary: Record<string, any> = {
    'Cladding': { diffuse: './material/exterior_wall_cladding_02_diff_2k.jpg', normal: './material/exterior_wall_cladding_02_nor_gl_2k.jpg', arm: './material/exterior_wall_cladding_02_arm_2k.jpg', repeat: 1.0 },
    'Red Brick': { diffuse: './material/red_brick_03_diff_2k.jpg', normal: './material/red_brick_03_nor_gl_2k.jpg', arm: './material/red_brick_03_arm_2k.jpg', repeat: 1.0 },
    'Red Brick 02': { diffuse: './material/red_brick_diff_2k.jpg', normal: './material/red_brick_nor_gl_2k.jpg', arm: './material/red_brick_arm_2k.jpg', repeat: 1.0 },
    'White Sand Stone': { diffuse: './material/white_sandstone_bricks_03_diff_2k.jpg', normal: './material/white_sandstone_bricks_03_nor_gl_2k.jpg', arm: './material/white_sandstone_bricks_03_arm_2k.jpg', repeat: 0.8 },
    'Wood Planks': { diffuse: './material/wood_planks_diff_2k.jpg', normal: './material/wood_planks_nor_gl_2k.jpg', arm: './material/wood_planks_arm_2k.jpg', repeat: 1.0 },
    'Black Bricks': { diffuse: './material/bricks06_basecolor.jpg', normal: './material/bricks06_normal_opengl.jpg', arm: './material/bricks06_roughness.jpg', repeat: 0.7 },
    'Black Metal': {
        diffuse: "./material/Metal028_1K-JPG_Color.jpg",
        normal: "./material/Metal028_1K-JPG_NormalGL.jpg",
        arm: "./material/Metal028_1K-JPG_Roughness.jpg",
    },
    'Marble Tiles': {
        diffuse: "./material/Marble tiles 1_BaseColor.jpg",
        normal: "./material/Marble tiles 1_Normal.jpg",
        arm: "./material/Marble tiles 1_Roughness.jpg",
    }
};

Object.keys(materialLibrary).forEach(key => {
    const mat = materialLibrary[key];
    mat.diffuseMap = textureLoader.load(mat.diffuse);
    mat.normalMap = textureLoader.load(mat.normal);
    mat.armMap = textureLoader.load(mat.arm);

    [mat.diffuseMap, mat.normalMap, mat.armMap].forEach(tex => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(mat.repeat, mat.repeat);
    });
    mat.diffuseMap.colorSpace = THREE.SRGBColorSpace;
});

const palette: Record<string, string> = {
    'Anthracite': '#383E42', 'White': '#ffffff', 'Oak': '#a0855b', 'Walnut': '#4a3728'
};

const base = {
    leftWall: null,
    rightWall: null,
    backWall: null,
    frontLeftWall: null,
    frontRightWall: null,
    frontTopWall: null,
    floor: null,
    roofRight: null,
    roofLeft: null,
    roofBack: null,
    pipeLeft: null,
    pipeRight: null,
};

let model: THREE.Mesh | null = null;
const roofRegistry: { [key: string]: THREE.Mesh } = {};
const doorRegistry: { [key: string]: THREE.Mesh } = {};
const gltfLoader = new GLTFLoader();
// gltfLoader.setMeshoptDecoder(MeshoptDecoder);
// const dracoLoader = new DRACOLoader();
// dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
// dracoLoader.preload();
// gltfLoader.setDRACOLoader(dracoLoader);

const loaderScreen = document.getElementById('loader-screen');
const loaderText = document.getElementById('loader-text');

const startMat = materialLibrary[state.material];
const globalExteriorMaterial = new THREE.MeshStandardMaterial({
    color: 'white',
    map: startMat.diffuseMap,
    normalMap: startMat.normalMap,
    aoMap: startMat.armMap,
    roughnessMap: startMat.armMap,
    metalnessMap: startMat.armMap,
});

const roofMat = materialLibrary['Black Metal'];
const globalRoofMaterial = new THREE.MeshStandardMaterial({
    color: 'white',
    map: roofMat.diffuseMap,
    normalMap: roofMat.normalMap,
    // aoMap: roofMat.armMap,
    roughnessMap: roofMat.armMap,
    // metalnessMap: roofMat.armMap,
});
applyWorldSpaceUVs(globalRoofMaterial, 0.5);

const floorMat = materialLibrary['Marble Tiles'];
const globalFloorMaterial = new THREE.MeshStandardMaterial({
    color: 'white',
    map: floorMat.diffuseMap,
    normalMap: floorMat.normalMap,
    // aoMap: floorMat.armMap,
    roughnessMap: floorMat.armMap,
    // metalnessMap: floorMat.armMap,
});
applyWorldSpaceUVs(globalFloorMaterial, 0.2);

const dynamicFurniture: THREE.Object3D[] = [];
let mixer:THREE.AnimationMixer = null;

gltfLoader.load("/model.glb", (gltf) => {
    model = gltf.scene;

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
            if (mat && mat.transmission > 0) {
                mesh.castShadow = false; 
                mesh.receiveShadow = true;
            } else {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
            }
        }
    });

    base.rightWall      = model.getObjectByName("RightWall");
    base.leftWall       = model.getObjectByName("LeftWall");
    base.backWall       = model.getObjectByName("BackWall");
    base.frontLeftWall  = model.getObjectByName("FrontLeft");
    base.frontRightWall = model.getObjectByName("FrontRight");
    base.frontTopWall   = model.getObjectByName("FrontTop");
    base.floor   = model.getObjectByName("Floor");
    base.roofRight = model.getObjectByName("RoofRight");
    base.roofLeft = model.getObjectByName("RoofLeft");
    base.roofBack = model.getObjectByName("RoofBack");

    base.pipeLeft = model.getObjectByName("PipeLeft");
    base.pipeRight = model.getObjectByName("PipeRight");
    applyPipeMaterial(state.pipeMaterial);

    base.roofRight.material = globalRoofMaterial;
    base.roofLeft.material  = globalRoofMaterial;
    base.roofBack.material  = globalRoofMaterial;

    base.floor.material  = globalFloorMaterial;

    [globalExteriorMaterial.map, globalExteriorMaterial.normalMap, globalExteriorMaterial.aoMap].forEach(tex => {
        if (tex) {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
        }
    });

    applyWorldSpaceUVs(globalExteriorMaterial, 0.5);

    base.backWall.children[0].material       = globalExteriorMaterial;
    base.leftWall.children[0].material       = globalExteriorMaterial;
    base.rightWall.children[0].material      = globalExteriorMaterial;
    base.frontLeftWall.children[0].material  = globalExteriorMaterial;
    base.frontRightWall.children[0].material = globalExteriorMaterial;
    base.frontTopWall.children[0].material   = globalExteriorMaterial;

    Object.keys(pricing.doors).forEach(name => {
        const mesh = gltf.scene.getObjectByName(name) as THREE.Mesh;
        if (mesh) {
            doorRegistry[name] = mesh;
            mesh.visible = (name === state.doorModel);
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

    base.roofLeft.visible = !(state.roofVariant === "None");
    base.roofRight.visible = !(state.roofVariant === "None");
    base.roofBack.visible = !(state.roofVariant === "None");
    Object.keys(pricing.roofs).forEach(name => {
        const mesh = gltf.scene.getObjectByName(name) as THREE.Mesh;
        if (mesh) {
            roofRegistry[name] = mesh;
            mesh.children[0].material = globalRoofMaterial;
            mesh.visible = (name === state.roofVariant);
        }
    });

    // Anchoring the furniture
    const sofa = gltf.scene.getObjectByName("Sofa");
    sofa.userData.anchorX = 'LeftWall';
    sofa.userData.anchorZ = 'LeftWall';
    sofa.userData.offsetX = sofa.position.x - base.leftWall.position.x;
    sofa.userData.offsetZ = sofa.position.z - base.leftWall.position.z;
    dynamicFurniture.push(sofa);

    const painting = gltf.scene.getObjectByName("Painting");
    painting.userData.anchorX = 'LeftWall';
    painting.userData.offsetX = painting.position.x - base.leftWall.position.x;
    dynamicFurniture.push(painting);

    const plant = gltf.scene.getObjectByName("Plant");
    plant.userData.anchorX = 'LeftWall';
    plant.userData.offsetX = plant.position.x - base.leftWall.position.x;
    dynamicFurniture.push(plant);

    const tv = gltf.scene.getObjectByName("TV");
    tv.userData.anchorX = 'RightWall';
    tv.userData.anchorZ = 'RightWall';
    tv.userData.offsetX = tv.position.x - base.rightWall.position.x;
    tv.userData.offsetZ = tv.position.z - base.rightWall.position.z;
    dynamicFurniture.push(tv);

    const cabinet = gltf.scene.getObjectByName("cabinet");
    cabinet.userData.anchorZ = 'BackWall';
    cabinet.userData.offsetZ = cabinet.position.z - base.backWall.position.z;
    cabinet.userData.visibleDepth = 0.8;
    dynamicFurniture.push(cabinet);

    updateFurnitureAnchors();
    scene.add(gltf.scene);
    applyColorToDoor(state.doorModel, palette[state.doorFinish]);

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

function applyColorToDoor(doorName: string, hexValue: string) {
    if (!doorRegistry[doorName]) return;
    const mesh = doorRegistry[doorName].getObjectByName(`${doorName}_1`) as THREE.Mesh;
    if (!mesh) return;
    (mesh.material as THREE.MeshStandardMaterial).color.set(hexValue);
}

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

    // Render Exterior Materials
    const materialContainer = document.getElementById('material-options')!;
    materialContainer.innerHTML = '';

    Object.entries(pricing.materials).forEach(([matName, cost]) => {
        const btn = createOptionButton(matName, cost, state.material === matName, () => {
            state.material = matName;

            // Grab the newly selected textures from your library
            const newMatData = materialLibrary[matName];

            // Update the maps on the single shared material
            if (globalExteriorMaterial) {
                globalExteriorMaterial.map = newMatData.diffuseMap;
                globalExteriorMaterial.normalMap = newMatData.normalMap;
                globalExteriorMaterial.aoMap = newMatData.armMap;
                globalExteriorMaterial.roughnessMap = newMatData.armMap;
                globalExteriorMaterial.metalnessMap = newMatData.armMap;

                // Crucial: Tell Three.js to re-compile with the new textures
                globalExteriorMaterial.needsUpdate = true;
            }

            updateStateAndCost();
            updateUI();
        });

        materialContainer.appendChild(btn);
    });

    // Render Doors
    const doorContainer = document.getElementById('door-options')!;
    doorContainer.innerHTML = '';
    Object.entries(pricing.doors).forEach(([doorName, cost]) => {
        const btn = createOptionButton(doorName.replace('_', ' '), cost, state.doorModel === doorName, () => {
            state.doorModel = doorName;
            Object.keys(doorRegistry).forEach(name => {
                if (doorRegistry[name]) doorRegistry[name].visible = (name === doorName);
            });
            applyColorToDoor(state.doorModel, palette[state.doorFinish]);
            updateStateAndCost();
            updateUI();
        });
        doorContainer.appendChild(btn);
    });

    // Render Door Finishes
    const finishContainer = document.getElementById('door-color-options')!;
    finishContainer.innerHTML = '';
    Object.entries(pricing.finishes).forEach(([finishName, cost]) => {
        const btn = createOptionButton(finishName, cost, state.doorFinish === finishName, () => {
            state.doorFinish = finishName;
            applyColorToDoor(state.doorModel, palette[finishName]);
            updateStateAndCost();
            updateUI();
        });

        const swatch = document.createElement('div');
        swatch.className = 'w-4 h-4 rounded-full mt-2 border border-white/20 shadow-sm';
        swatch.style.backgroundColor = palette[finishName];
        btn.appendChild(swatch);

        finishContainer.appendChild(btn);
    });

    // Render roof variants
    const roofContainer = document.getElementById('roof-options');
    if (roofContainer) {
        roofContainer.innerHTML = '';
        Object.entries(pricing.roofs).forEach(([roofName, cost]) => {
            const btn = createOptionButton(roofName.replace('_', ' '), cost, state.roofVariant === roofName, () => {

                state.roofVariant = roofName;
                base.roofLeft.visible = !(roofName === "None");
                base.roofRight.visible = !(roofName === "None");
                base.roofBack.visible = !(roofName === "None");

                Object.keys(roofRegistry).forEach(name => {
                    if (roofRegistry[name]) {
                        roofRegistry[name].visible = (name === roofName);
                    }
                });

                updateStateAndCost();
                updateUI();
            });
            roofContainer.appendChild(btn);
        });
    }
    const pipeLayoutContainer = document.getElementById('pipe-options');
    if (pipeLayoutContainer) {
        pipeLayoutContainer.innerHTML = '';
        Object.entries(pricing.pipeLayout).forEach(([layoutName, cost]) => {
            const btn = createOptionButton(layoutName, cost, state.pipeLayout === layoutName, () => {

                // 1. Update State
                state.pipeLayout = layoutName;

                // 2. Toggle Visibility based on the selected layout
                if (base.pipeLeft) base.pipeLeft.visible = (layoutName === 'Left Only' || layoutName === 'Both');
                if (base.pipeRight) base.pipeRight.visible = (layoutName === 'Right Only' || layoutName === 'Both');

                // 3. Update Pricing and UI
                updateStateAndCost();
                updateUI();
            });
            pipeLayoutContainer.appendChild(btn);
        });
    }

    // Render Pipe Materials
    const pipeMaterialContainer = document.getElementById('pipe-material-options');
    if (pipeMaterialContainer) {
        pipeMaterialContainer.innerHTML = '';
        Object.entries(pricing.pipeMaterials).forEach(([matName, cost]) => {
            const btn = createOptionButton(matName, cost, state.pipeMaterial === matName, () => {

                // 1. Update State
                state.pipeMaterial = matName;

                // 2. Apply the material changes
                applyPipeMaterial(matName);

                // 3. Update Pricing and UI
                updateStateAndCost();
                updateUI();
            });
            pipeMaterialContainer.appendChild(btn);
        });
    }

    const animationBtn = document.getElementById('animation-toggle');
    if (animationBtn) {
        const isAnimatedDoor = state.doorModel === 'Door_Animated'; 

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
    base.rightWall.position.x = addedWidth;

    const backScale = 1.0 + (addedWidth / 2); 
    base.backWall.scale.x = backScale;

    const frontRightScale = 1.0 + addedWidth * 1.8;
    base.frontRightWall.scale.x = frontRightScale;
    const frontLeftScale = 1.0 + addedWidth * 1.65;
    base.frontLeftWall.scale.x = frontLeftScale;

    base.floor.scale.x = 1.0 + addedWidth/2.4;

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

    const sideScale = 1.0 + (addedDepth/3.95); 

    base.leftWall.scale.z = sideScale;
    base.rightWall.scale.z = sideScale;

    base.floor.scale.z = 1.0 + addedDepth/4.0;

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

function applyPipeMaterial(materialName: string) {
    if (!base.pipeLeft && !base.pipeRight) return;

    // Define the visual properties for your pipe materials
    const pipeMaterialProps: Record<string, { color: string, metalness: number, roughness: number }> = {
        'Black PVC': { 
            color: '#222222', 
            metalness: 0.0,   
            roughness: 0.35   
        },
        'Zinc': { 
            color: '#a0a4a8', 
            metalness: 1.0,   
            roughness: 0.45   
        },
        'White Plastic': { 
            color: '#ececec', 
            metalness: 0.0,   
            roughness: 0.3    
        }
    };

    const props = pipeMaterialProps[materialName];
    if (!props) return;

    [base.pipeLeft, base.pipeRight].forEach(pipe => {
        if (pipe && pipe.isMesh) {
            // Ensure we clone the material so we don't accidentally tint other objects
            if (!pipe.userData.hasClonedMaterial) {
                pipe.material = (pipe.material as THREE.Material).clone();
                pipe.userData.hasClonedMaterial = true;
            }

            const mat = pipe.material as THREE.MeshStandardMaterial;
            mat.color.set(props.color);
            mat.metalness = props.metalness;
            mat.roughness = props.roughness;
            mat.needsUpdate = true;
        }
    });
}

function updateStateAndCost() {
    const dimCost = ((state.width || 0) * pricing.dimensions.widthMax) + ((state.depth || 0) * pricing.dimensions.depthMax);
    const matCost = pricing.materials[state.material as keyof typeof pricing.materials] || 0;
    const doorCost = pricing.doors[state.doorModel as keyof typeof pricing.doors] || 0;
    const finishCost = pricing.finishes[state.doorFinish as keyof typeof pricing.finishes] || 0;
    const roofCost = pricing.roofs[state.roofVariant as keyof typeof pricing.roofs] || 0;
    const pipeLayoutCost = pricing.pipeLayout ? (pricing.pipeLayout[state.pipeLayout as keyof typeof pricing.pipeLayout] || 0) : 0;
    const pipeMatCost = pricing.pipeMaterials ? (pricing.pipeMaterials[state.pipeMaterial as keyof typeof pricing.pipeMaterials] || 0) : 0; 
    const newTotal = pricing.base + dimCost + matCost + doorCost + finishCost + roofCost + pipeLayoutCost + pipeMatCost;
    const priceElement = document.getElementById('total-price');
    gsap.to(state, {
        currentTotal: newTotal,
        duration: 0.5,
        ease: "power2.out",
        onUpdate: () => {
            if (priceElement) {
                priceElement.innerText = Math.round(state.currentTotal).toLocaleString();
            }
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
