import * as THREE from 'three';
import {LoadingManager, MeshPhongMaterial, MeshPhysicalMaterial} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import LISDFLoader from './LISDFLoader.js';
import URDFLoader from './URDFLoader.js';

/*
Reference coordinate frames for THREE.js and ROS.
Both coordinate systems are right-handed so the URDF is instantiated without
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

const tempVec2 = new THREE.Vector2();
const emptyRaycast = () => {};

// lisdf-viewer element
// Loads and displays a 3D view of a LISDF-formatted scene

// Events
// lisdf-change: Fires when the LISDF has finished loading and getting processed
// lisdf-processed: Fires when the LISDF has finished loading and getting processed
// geometry-loaded: Fires when all the geometry has been fully loaded
// ignore-limits-change: Fires when the 'ignore-limits' attribute changes
// angle-change: Fires when an angle changes
export default
class LISDFViewer extends HTMLElement {

    static get observedAttributes() {
        // 'up',
        return ['package', 'lisdf', 'display-shadow', 'ambient-color', 'ignore-limits', 'show-collision'];

    }

    get package() { return this.getAttribute('package') || ''; }
    set package(val) { this.setAttribute('package', val); }

    get lisdf() { return this.getAttribute('lisdf') || ''; }
    set lisdf(val) { this.setAttribute('lisdf', val); }

    get ignoreLimits() { return this.hasAttribute('ignore-limits') || false; }
    set ignoreLimits(val) { val ? this.setAttribute('ignore-limits', val) : this.removeAttribute('ignore-limits'); }

    get displayShadow() { return this.hasAttribute('display-shadow') || false; }
    set displayShadow(val) { val ? this.setAttribute('display-shadow', '') : this.removeAttribute('display-shadow'); }

    get ambientColor() { return this.getAttribute('ambient-color') || '#455A64'; }
    set ambientColor(val) { val ? this.setAttribute('ambient-color', val) : this.removeAttribute('ambient-color'); }

    get autoRedraw() { return this.hasAttribute('auto-redraw') || false; }
    set autoRedraw(val) { val ? this.setAttribute('auto-redraw', true) : this.removeAttribute('auto-redraw'); }

    get noAutoRecenter() { return this.hasAttribute('no-auto-recenter') || false; }
    set noAutoRecenter(val) { val ? this.setAttribute('no-auto-recenter', true) : this.removeAttribute('no-auto-recenter'); }

    get showCollision() { return this.hasAttribute('show-collision') || false; }
    set showCollision(val) { val ? this.setAttribute('show-collision', true) : this.removeAttribute('show-collision'); }

    get jointValues() {

        const values = {};
        if (this.robot) {

            for (const name in this.robot.joints) {

                const joint = this.robot.joints[name];
                values[name] = joint.jointValue.length === 1 ? joint.angle : [...joint.jointValue];

            }
            console.log('jointValues', values);
        }
        return values;

    }
    set jointValues(val) { this.setJointValues(val); }

    get angles() {

        return this.jointValues;

    }
    set angles(v) {

        this.jointValues = v;

    }

    /* Lifecycle Functions */
    constructor() {

        super();

        this._requestId = 0;
        this._dirty = false;
        this._loadScheduled = false;
        this.robot = null;
        this.models = null;
        this.urlModifierFunc = null;
        this.animation = null;
        this.startTime = null;

        // Scene setup
        const scene = new THREE.Scene();

        const ambientLight = new THREE.HemisphereLight(this.ambientColor, '#000');
        ambientLight.groundColor.lerp(ambientLight.color, 0.5);
        ambientLight.intensity = 0.5;
        ambientLight.position.set(0, 1, 0);
        scene.add(ambientLight);

        // Light setup
        const dirLight = new THREE.DirectionalLight(0xffffff);
        dirLight.position.set(4, 10, 1);
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.normalBias = 0.001;
        dirLight.castShadow = true;
        scene.add(dirLight);
        scene.add(dirLight.target);

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setClearColor(0xffffff);
        renderer.setClearAlpha(0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;

        // Camera setup
        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        camera.position.z = -10;

        // World setup
        const world = new THREE.Object3D();
        scene.add(world);

        const plane = new THREE.Mesh(
            new THREE.PlaneBufferGeometry(40, 40),
            new THREE.ShadowMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.5 }),
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -0.5;
        plane.receiveShadow = true;
        plane.scale.set(10, 10, 10);
        scene.add(plane);

        // Controls setup
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.rotateSpeed = 2.0;
        controls.zoomSpeed = 5;
        controls.panSpeed = 2;
        controls.enableZoom = true;
        controls.enableDamping = false;
        controls.maxDistance = 50;
        controls.minDistance = 0.25;
        controls.addEventListener('change', () => this.recenter());

        this.scene = scene;
        this.world = world;
        this.renderer = renderer;
        this.camera = camera;
        this.controls = controls;
        this.plane = plane;
        this.directionalLight = dirLight;
        this.ambientLight = ambientLight;

        this._collisionMaterial = new MeshPhongMaterial({
            transparent: true,
            opacity: 0.35,
            shininess: 2.5,
            premultipliedAlpha: true,
            color: 0xffbe38,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        });

        const _renderLoop = () => {

            if (this.parentNode) {

                this.updateSize();

                if (this._dirty || this.autoRedraw) {

                    if (!this.noAutoRecenter) {

                        this._updateEnvironment();
                    }

                    this.renderer.render(scene, camera);
                    this._dirty = false;

                }

                // update controls after the environment in
                // case the controls are retargeted
                this.controls.update();

            }
            this._renderLoopId = requestAnimationFrame(_renderLoop);

        };
        _renderLoop();

    }

    connectedCallback() {

        // Add our initialize styles for the element if they haven't
        // been added yet
        if (!this.constructor._styletag) {

            const styletag = document.createElement('style');
            styletag.innerHTML =
            `
                ${ this.tagName } { display: block; }
                ${ this.tagName } canvas {
                    width: 100%;
                    height: 100%;
                }
            `;
            document.head.appendChild(styletag);
            this.constructor._styletag = styletag;

        }

        // add the renderer
        if (this.childElementCount === 0) {

            this.appendChild(this.renderer.domElement);

        }

        this.updateSize();
        requestAnimationFrame(() => this.updateSize());

    }

    disconnectedCallback() {

        cancelAnimationFrame(this._renderLoopId);

    }

    attributeChangedCallback(attr, oldval, newval) {

        this._updateCollisionVisibility();
        if (!this.noAutoRecenter) {
            this.recenter();
        }

        switch (attr) {

            case 'package':
            case 'lisdf': {

                this._scheduleLoad();
                break;

            }

            case 'ambient-color': {

                this.ambientLight.color.set(this.ambientColor);
                this.ambientLight.groundColor.set('#000').lerp(this.ambientLight.color, 0.5);
                break;

            }

            case 'ignore-limits': {

                this._setIgnoreLimits(this.ignoreLimits, true);
                break;

            }

        }

    }

    /* Public API */
    updateSize() {

        const r = this.renderer;
        const w = this.clientWidth;
        const h = this.clientHeight;
        const currSize = r.getSize(tempVec2);

        if (currSize.width !== w || currSize.height !== h) {

            this.recenter();

        }

        r.setPixelRatio(window.devicePixelRatio);
        r.setSize(w, h, false);

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();

    }

    redraw() {

        this._dirty = true;
    }

    recenter() {

        this._updateEnvironment();
        this.redraw();

    }

    // Set the joint with jointName to
    // angle in degrees  // TODO: change multiple joints
    setJointValue(jointName, ...values) {

        if (!this.robot) return;
        if (!this.robot.joints) return;
        if (!this.robot.joints[jointName]) return;

        if (this.robot.joints[jointName].setJointValue(...values)) {
            // console.log('setJointValue', jointName, values);
            this.redraw();
            this.dispatchEvent(new CustomEvent('angle-change', { bubbles: true, cancelable: true, detail: jointName }));

        }

    }

    setJointValues(values) {

        for (const name in values) this.setJointValue(name, values[name]);

    }

    /* Private Functions */
    // Updates the position of the plane to be at the
    // lowest point below the robot and focuses the
    // camera on the center of the scene
    _updateEnvironment() {

        const robot = this.robot;
        if (!robot) return;

        this.world.updateMatrixWorld();

        const bbox = new THREE.Box3();
        bbox.makeEmpty();
        robot.traverse(c => {
            if (c.isURDFVisual) {
                bbox.expandByObject(c);
            }
        });

        const center = bbox.getCenter(new THREE.Vector3());
        this.controls.target.y = center.y;
        this.plane.position.y = bbox.min.y - 1e-3;

        const dirLight = this.directionalLight;
        dirLight.castShadow = this.displayShadow;

        if (this.displayShadow) {

            // Update the shadow camera rendering bounds to encapsulate the
            // model. We use the bounding sphere of the bounding box for
            // simplicity -- this could be a tighter fit.
            const sphere = bbox.getBoundingSphere(new THREE.Sphere());
            const minmax = sphere.radius;
            const cam = dirLight.shadow.camera;
            cam.left = cam.bottom = -minmax;
            cam.right = cam.top = minmax;

            // Update the camera to focus on the center of the model so the
            // shadow can encapsulate it
            const offset = dirLight.position.clone().sub(dirLight.target.position);
            dirLight.target.position.copy(center);
            dirLight.position.copy(center).add(offset);

            cam.updateProjectionMatrix();

        }

    }

    _scheduleLoad() {

        // if our current model is already what's being requested
        // or has been loaded then early out
        if (this._prevload === `${ this.package }|${ this.lisdf }`) return;
        this._prevload = `${ this.package }|${ this.lisdf }`;

        // if we're already waiting on a load then early out
        if (this._loadScheduled) return;
        this._loadScheduled = true;

        if (this.robot) {

            this.robot.traverse(c => c.dispose && c.dispose());
            this.robot.parent.remove(this.robot);
            this.robot = null;

        }

        requestAnimationFrame(() => {

            this._loadLisdf(this.package, this.lisdf);
            this._loadScheduled = false;

        });
    }

    // Watch the package and lisdf field and load the robot model.
    // This should _only_ be called from _scheduleLoad because that
    // ensures the that current robot has been removed
    _loadLisdf(pkg, lisdf) {
        console.log('loading lisdf', pkg, lisdf);

        this.dispatchEvent(new CustomEvent('lisdf-change', { bubbles: true, cancelable: true, composed: true }));

        if (lisdf) {

            // Keep track of this request and make
            // sure it doesn't get overwritten by
            // a subsequent one
            this._requestId++;
            const requestId = this._requestId;

            if (pkg.includes(':') && (pkg.split(':')[1].substring(0, 2)) !== '//') {
                // E.g. pkg = "pkg_name: path/to/pkg_name, pk2: path2/to/pk2"}
                // Convert pkg(s) into a map. E.g.
                // { "pkg_name": "path/to/pkg_name",
                //   "pk2":      "path2/to/pk2"      }

                pkg = pkg.split(',').reduce((map, value) => {

                    const split = value.split(/:/).filter(x => !!x);
                    const pkgName = split.shift().trim();
                    const pkgPath = split.join(':').trim();
                    map[pkgName] = pkgPath;

                    return map;

                }, {});
            }

            const manager = new THREE.LoadingManager();

            if (this.urlModifierFunc) {

                manager.setURLModifier(this.urlModifierFunc);

            }

            let bodies = null;
            const loader = new LISDFLoader(manager);
            loader.packages = pkg;
            loader.load(lisdf, result => bodies = result);

            const manager2 = new LoadingManager();
            const loaderurdf = new URDFLoader(manager2);

            const loaded = [];
            manager.onLoad = () => {

                if (requestId !== this._requestId) return;

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

            const models = new Map();
            // wait until all the geometry has loaded to add the model to the scene
            manager2.onLoad = () => {
                // If another request has come in to load a new
                // robot, then ignore this one
                if (this._requestId !== requestId) {
                    console.log('ignoring', requestId, this._requestId);
                    for (const mm in models) {
                        mm.traverse(c => c.dispose && c.dispose());
                    }
                    return;
                }
                loaded.forEach(record => {
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
                    this.scene.add(body);
                    models.put(name, body);
                });

                this.models = models;
                this.robot = models['pr20'];
                this.world.add(this.robot);

                // load animation json file
                const jsonPath = 'https://zt-yang.github.io/lisdf-loaders/javascript/' + lisdf.replace('.lisdf', '.json').replace('../../../', '');
                fetch(jsonPath)
                    .then((response) => response.json())
                    .then((json) => {
                        this.animation = json;
                        console.log('animation', json);
                    });
                this.startTime = Date.now() / 3e2;

                this._setIgnoreLimits(this.ignoreLimits);
                this._updateCollisionVisibility();

                this.dispatchEvent(new CustomEvent('lisdf-processed', { bubbles: true, cancelable: true, composed: true }));
                this.dispatchEvent(new CustomEvent('geometry-loaded', { bubbles: true, cancelable: true, composed: true }));

                this.recenter();
                console.log(this.scene);
            };

        }

    }

    _updateCollisionVisibility() {

        const showCollision = this.showCollision;
        const collisionMaterial = this._collisionMaterial;
        const robot = this.robot;

        if (robot === null) return;

        const colliders = [];
        robot.traverse(c => {

            if (c.isURDFCollider) {

                c.visible = showCollision;
                colliders.push(c);

            }

        });

        colliders.forEach(coll => {

            coll.traverse(c => {

                if (c.isMesh) {

                    c.raycast = emptyRaycast;
                    c.material = collisionMaterial;
                    c.castShadow = false;

                }

            });

        });

    }

    // Updates the current robot's angles to ignore
    // joint limits or not
    _setIgnoreLimits(ignore, dispatch = false) {

        if (this.robot) {

            Object
                .values(this.robot.joints)
                .forEach(joint => {

                    joint.ignoreLimits = ignore;
                    joint.setJointValue(...joint.jointValue);

                });

        }

        if (dispatch) {

            this.dispatchEvent(new CustomEvent('ignore-limits-change', { bubbles: true, cancelable: true, composed: true }));

        }

    }

};
