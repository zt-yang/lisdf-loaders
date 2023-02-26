import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { URDFRobot, URDFJoint, URDFLink, URDFCollider, URDFVisual, URDFMimicJoint } from './URDFClasses.js';
import URDFLoader from './URDFLoader.js';
import { processTuple, applyRotation } from './URDFLoader.js';

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

/* URDFLoader Class */
// Loads and reads a URDF file into a THREEjs Object3D format
export default
class LISDFLoader {

    constructor(manager) {

        this.manager = manager || THREE.DefaultLoadingManager;
        this.loadMeshCb = this.defaultMeshLoader.bind(this);
        this.parseVisual = true;
        this.parseCollision = false;
        this.packages = '';
        this.workingPath = '';
        this.fetchOptions = {};

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

                const models = this.parse(data);
                onComplete(models);
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

        const manager = this.manager;
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

            console.log(world);

            const worldNodes = [ ...world.children ];
            const includes = worldNodes.filter(c => c.nodeName.toLowerCase() === 'include');
            const models = worldNodes.filter(c => c.nodeName.toLowerCase() === 'model');
            // const state = worldNodes.filter(c => c.nodeName.toLowerCase() === 'state');

            // Create the <include> map
            includes.forEach(m => {

                const name = m.getAttribute('name');
                bodyMap[name] = processInclude(m);

            });

            // // Create the <joint> map
            // models.forEach(j => {
            //
            //     const name = j.getAttribute('name');
            //     bodyMap[name] = processModel(j);
            //
            // });

            return bodyMap;

        }

        // Process joint nodes and parent them
        function processInclude(include) {

            console.log(include);

            const name = include.getAttribute('name');
            var children = [ ...include.children ];
            var scale = 1;
            if (name !== 'pr20') {
                scale = children.filter(c => c.nodeName.toLowerCase() === 'scale').pop().map(parseFloat);
            }
            const uri = resolvePath(children.filter(c => c.nodeName.toLowerCase() === 'uri').pop().textContent);
            const pose = children.filter(c => c.nodeName.toLowerCase() === 'pose').pop();
            const poseArray = pose.textContent.split(' ').map(parseFloat);

            console.log(name, uri, scale, poseArray);

            const loader = new URDFLoader(manager);
            let body;
            loader.load(uri, result => { body = result; });
            console.log(body);
            // body.scale.setScalar(scale);
            setPose(body, poseArray);
            return body;

        }

        // Resolves the path of urdf files
        function resolvePath(path) {
            return path.replace('../../assets/models/', '../../../kitchen-models/');
        }

        function setPose(body, pose) {
            body.position = new THREE.Vector3(pose[0], pose[1], pose[2]);
        }

        function processModel(model) {

            const pose = model.filter(c => c.nodeName.toLowerCase() === 'pose').pop();
            const poseArray = pose.textContent.split(' ').map(parseFloat);

            const link = model.filter(c => c.nodeName.toLowerCase() === 'link').pop();
            const collision = link.filter(c => c.nodeName.toLowerCase() === 'collision').pop();
            const geometry = collision.filter(c => c.nodeName.toLowerCase() === 'geometry').pop();
            const box = geometry.filter(c => c.nodeName.toLowerCase() === 'box').pop();
            const size = box.filter(c => c.nodeName.toLowerCase() === 'size').pop();
            const sizeArray = size.textContent.split(' ').map(parseFloat);

            const geom = new THREE.BoxGeometry(sizeArray[0], sizeArray[1], sizeArray[2]);
            const material = new THREE.MeshNormalMaterial();
            const body = new THREE.Mesh(geom, material);
            setPose(body, poseArray);
            return body;

        }

        return processLisdf(content);

    }

};
