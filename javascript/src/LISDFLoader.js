import * as THREE from 'three';

/* URDFLoader Class */
// Loads and reads a URDF file into a THREEjs Object3D format
export default
class LISDFLoader {

    constructor(manager) {
        this.manager = manager || THREE.DefaultLoadingManager;
    }

    /* Public API */
    loadAsync(lisdf) {

        return new Promise((resolve, reject) => {

            this.load(lisdf, resolve, null, reject);

        });

    }

    // urdf:    The path to the URDF within the package OR absolute
    // onComplete:      Callback that is passed the model once loaded
    load(lisdf, onComplete, onProgress, onError) {

        // Check if a full URI is specified before
        // prepending the package info
        const manager = this.manager;
        const workingPath = THREE.LoaderUtils.extractUrlBase(lisdf);
        const lisdfPath = this.manager.resolveURL(lisdf);

        manager.itemStart(lisdfPath);

        fetch(lisdfPath, this.fetchOptions)
            .then(res => {

                if (res.ok) {

                    if (onProgress) {

                        onProgress(null);

                    }
                    return res.text();

                } else {

                    throw new Error(`URDFLoader: Failed to load url '${ lisdfPath }' with error code ${ res.status } : ${ res.statusText }.`);

                }

            })
            .then(data => {

                if (this.workingPath === '') {

                    this.workingPath = workingPath;

                }

                const model = this.parse(data);
                onComplete(model);
                manager.itemEnd(lisdfPath);

            })
            .catch(e => {

                if (onError) {

                    onError(e);

                } else {

                    console.error('URDFLoader: Error loading file.', e);

                }
                manager.itemError(lisdfPath);
                manager.itemEnd(lisdfPath);

            });

    }

    parse(content) {

        const bodyMap = {};

        // Process the URDF text format
        function processLisdf(data) {

            let children;
            if (data instanceof Document) {

                children = [ ...data.children ];

            } else if (data instanceof Element) {

                children = [ data ];

            } else {

                const parser = new DOMParser();
                const urdf = parser.parseFromString(data, 'text/xml');
                children = [ ...urdf.children ];

            }

            const sdfNode = children.filter(c => c.nodeName === 'sdf').pop();
            children = [ ...sdfNode.children ];
            const worldNode = children.filter(c => c.nodeName === 'world').pop();

            return processWorld(worldNode);

        }

        // Process the <robot> node
        function processWorld(world) {

            const worldNodes = [ ...world.children ];
            const includes = worldNodes.filter(c => c.nodeName.toLowerCase() === 'include');
            const models = worldNodes.filter(c => c.nodeName.toLowerCase() === 'model');
            const state = worldNodes.filter(c => c.nodeName.toLowerCase() === 'state').pop();
            const stateNodes = [ ...state.children ];
            const states = stateNodes.filter(c => c.nodeName.toLowerCase() === 'model');

            // To load urdf files for the <include> nodes
            includes.forEach(m => {

                const name = m.getAttribute('name');
                bodyMap[name] = processInclude(m);
                if (name === 'pr20') {
                    bodyMap[name][2] = [0, 0, 0, -Math.PI / 2, 0, 0];
                }

            });

            // To create boxes for the <model> nodes
            models.forEach(m => {

                const name = m.getAttribute('name');
                bodyMap[name] = processModel(m);

            });

            // Record intitial joint positions
            states.forEach(m => {

                const name = m.getAttribute('name');
                bodyMap[name][3] = processJointState(m);

            });

            return bodyMap;

        }

        // Resolves the path of urdf files
        function resolvePath(path) {
            return path.replace('../../assets/models/', '../../../kitchen-models/');
        }

        function processPose(pose) {
            var poseArray = pose.textContent.split(' ').map(parseFloat);
            if (poseArray[3] === 0) {
                poseArray[3] -= Math.PI / 2;
            }
            poseArray = [poseArray[0], poseArray[2], poseArray[1], poseArray[3], poseArray[5], poseArray[4]];
            return poseArray;
        }

        function processInclude(include) {

            const name = include.getAttribute('name');
            var children = [ ...include.children ];
            var scale = 1;
            if (name !== 'pr20') {
                scale = parseFloat(children.filter(c => c.nodeName.toLowerCase() === 'scale').pop().textContent);
            }
            var uri = resolvePath(children.filter(c => c.nodeName.toLowerCase() === 'uri').pop().textContent);
            const pose = children.filter(c => c.nodeName.toLowerCase() === 'pose').pop();
            const poseArray = processPose(pose);
            const positions = null;
            return [uri, scale, poseArray, positions];

        }

        function processModel(model) {

            var children = [ ...model.children ];
            const pose = children.filter(c => c.nodeName.toLowerCase() === 'pose').pop();
            const poseArray = processPose(pose);

            const link = children.filter(c => c.nodeName.toLowerCase() === 'link').pop();
            const visual = link.children[1];
            const geometry = visual.children[0];
            const box = geometry.children[0];
            const size = box.children[0];
            const sizeArray = size.textContent.split(' ').map(parseFloat);

            const material = visual.children[1];
            const color = material.children[0];
            const colorHex = color.textContent.split(' ').map(parseFloat);
            const hex = rgbToHex(colorHex);

            return [sizeArray, poseArray, hex];

        }

        function rgbToHex(rgba) {
            // https://threejs.org/docs/#api/en/math/Color
            function c2h(c) {
                var hex = c.toString(16);
                return hex.length === 1 ? '0' + hex : hex;
            }
            var [r, g, b, a] = rgba;
            r = Math.round(r * 255);
            g = Math.round(g * 255);
            b = Math.round(b * 255);
            const color = new THREE.Color(`rgb(${r}, ${g}, ${b})`);
            return color.getHex();
            // return '0x' + c2h(r) + c2h(g) + c2h(b);
        }

        function processJointState(model) {
            const jointMap = {};
            var children = [ ...model.children ];
            children.forEach(j => {

                const name = j.getAttribute('name');
                jointMap[name] = parseFloat(j.children[0].textContent);

            });
            return jointMap;
        }

        return processLisdf(content);

    }

};
