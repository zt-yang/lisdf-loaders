import {
    WebGLRenderer,
    PerspectiveCamera,
    Scene,
    Mesh,
    PlaneBufferGeometry,
    ShadowMaterial,
    DirectionalLight,
    PCFSoftShadowMap,
    sRGBEncoding,
    Color,
    AmbientLight,
    LoadingManager,
    MeshPhysicalMaterial, MathUtils
} from 'three';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import LISDFLoader from '../../src/LISDFLoader.js';
import URDFLoader from '../../src/URDFLoader.js';

let scene, camera, renderer, bodies, controls;

init();
render();

/*
Reference coordinate frames for THREE.js and ROS.
Both coordinate systems are right handed so the URDF is instantiated without
frame transforms. The resulting model can be rotated to rectify the proper up,
right, and forward directions

THREE.js
   Y
   |
   |
   .-----X
 ／
Z

ROS URDf
       Z
       |   X
       | ／
 Y-----.

*/

const tempQuaternion = new THREE.Quaternion();
const tempEuler = new THREE.Euler();

function applyRotation(obj, rpy, additive = false) {

    // if additive is true the rotation is applied in
    // addition to the existing rotation
    if (!additive) obj.rotation.set(0, 0, 0);

    tempEuler.set(rpy[0], rpy[1], rpy[2], 'ZYX');
    tempQuaternion.setFromEuler(tempEuler);
    tempQuaternion.multiply(obj.quaternion);
    obj.quaternion.copy(tempQuaternion);

}

function setPose(body, pose) {
    body.updateMatrixWorld(true);
    body.position.set(pose[0], pose[1], pose[2]);
    applyRotation(body, [pose[3], pose[4], pose[5]]);
    // body.rotation.set(pose[3], pose[4], pose[5], 'XYZ');
}

function init() {

    scene = new Scene();
    scene.background = new Color(0x263238);

    camera = new PerspectiveCamera();
    camera.position.set(12, 6, 6);
    camera.lookAt(0, 0, 0);

    renderer = new WebGLRenderer({ antialias: true });
    renderer.outputEncoding = sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    const directionalLight = new DirectionalLight(0xffffff, 1.0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.setScalar(1024);
    directionalLight.position.set(5, 30, 5);
    scene.add(directionalLight);

    const ambientLight = new AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    const ground = new Mesh(new PlaneBufferGeometry(), new ShadowMaterial({ opacity: 0.25 }));
    ground.rotation.x = -Math.PI / 2;
    ground.scale.setScalar(30);
    ground.receiveShadow = true;
    scene.add(ground);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 4;
    controls.target.y = 1;
    controls.update();

    const geometry = new THREE.BoxGeometry(0.02, 0.02, 2);
    const material = new THREE.MeshNormalMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    const geometry2 = new THREE.BoxGeometry(2, 0.02, 0.02);
    const material2 = new THREE.MeshNormalMaterial();
    const mesh2 = new THREE.Mesh(geometry2, material2);
    const loaded = [
        ['x-axis', mesh, [0.01, -0.01, 1, 0, 0, 0]],
        ['y-axis', mesh2, [1, -0.01, 0.01, 0, 0, 0]],
    ];

    // Load bodies
    const manager = new LoadingManager();

    const loader = new LISDFLoader(manager);
    loader.load('../../../scenes/full-kitchen.lisdf', result => {
        bodies = result;
    });

    const manager2 = new LoadingManager();
    const loaderurdf = new URDFLoader(manager2);
    manager.onLoad = () => {

        for (const name in bodies) {
            if (typeof bodies[name][0] === 'string') {
                const [uri, scale, pose, positions] = bodies[name];
                // console.log('loading include', name, uri);
                loaderurdf.load(uri, result => {
                    result.scale.set(scale, scale, scale);
                    loaded.push([name, result, pose, positions]);
                });
            } else {
                const [size, pose, color] = bodies[name];
                // console.log('loading model', name, size);
                const geometry1 = new THREE.BoxGeometry(size[0], size[1], size[2]);
                const material1 = new MeshPhysicalMaterial({ color: color });
                const body = new THREE.Mesh(geometry1, material1);
                loaded.push([name, body, pose, null]);
            }

        }
    };

    // wait until all the geometry has loaded to add the model to the scene
    manager2.onLoad = () => {
        console.log('loaded', loaded);
        loaded.forEach(function(record) {
            const [name, body, pose, positions] = record;
            console.log('setting', name, pose);
            setPose(body, pose);
            body.traverse(c => {
                c.castShadow = true;
            });
            if (positions) {

                for (const k in positions) {
                    body.joints[k].setJointValue(positions[k]);
                }

            }
            scene.add(body);
        });
    };

    onResize();
    window.addEventListener('resize', onResize);

}

function onResize() {

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

}

function render() {

    requestAnimationFrame(render);
    renderer.render(scene, camera);

}
