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

            const worldNodes = [ ...world.children ];
            const includes = worldNodes.filter(c => c.nodeName.toLowerCase() === 'include');
            const models = worldNodes.filter(c => c.nodeName.toLowerCase() === 'model');
            // const state = worldNodes.filter(c => c.nodeName.toLowerCase() === 'state');

            // Create the <include> map
            includes.forEach(m => {

                const name = m.getAttribute('name');
                bodyMap[name] = processInclude(m);

            });

            // Create the <joint> map
            models.forEach(j => {

                const name = j.getAttribute('name');
                bodyMap[name] = processModel(j);

            });

            return bodyMap;

        }

        // Resolves the path of urdf files
        function resolvePath(path) {
            return path.replace('../../assets/models/', '../../../kitchen-models/');
        }

        function processPose(pose) {
            var poseArray = pose.textContent.split(' ').map(parseFloat);
            poseArray = [poseArray[0], poseArray[2], poseArray[1], Math.PI / 2, poseArray[5], poseArray[4]];
            return poseArray;
        }

        // Process joint nodes and parent them
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
            return [uri, poseArray, scale];

        }

        function processModel(model) {

            var children = [ ...model.children ];
            const pose = children.filter(c => c.nodeName.toLowerCase() === 'pose').pop();
            const poseArray = processPose(pose);

            const link = children.filter(c => c.nodeName.toLowerCase() === 'link').pop();
            const collision = link.children[0];
            const geometry = collision.children[0];
            const box = geometry.children[0];
            const size = box.children[0];
            const sizeArray = size.textContent.split(' ').map(parseFloat);

            return [sizeArray, poseArray];

        }

        return processLisdf(content);

    }

};
