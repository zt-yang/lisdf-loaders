/* globals */
import * as THREE from 'three';
import { registerDragEvents } from './dragAndDrop.js';
import LISDFManipulator from '../../src/lisdf-manipulator-element.js';
import {setPose, processRobotPositions, processPose} from '../../src/LISDFUtils.js';

customElements.define('lisdf-viewer', LISDFManipulator);

// declare these globally for the sake of the example.
// Hack to make the build work with webpack for now.
// TODO: Remove this once modules or parcel is being used
const viewer = document.querySelector('lisdf-viewer');

const limitsToggle = document.getElementById('ignore-joint-limits');
const collisionToggle = document.getElementById('collision-toggle');
const radiansToggle = document.getElementById('radians-toggle');
const autocenterToggle = document.getElementById('autocenter-toggle');
const sliderList = document.querySelector('#controls ul');
const controlsel = document.getElementById('controls');
const controlsToggle = document.getElementById('toggle-controls');
const animToggle = document.getElementById('do-animate');
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 1 / DEG2RAD;
let sliders = {};

// Global Functions
const setColor = color => {

    document.body.style.backgroundColor = color;
    viewer.highlightColor = '#' + (new THREE.Color(0xffffff)).lerp(new THREE.Color(color), 0.35).getHexString();

};

// Events
// toggle checkbox
limitsToggle.addEventListener('click', () => {
    limitsToggle.classList.toggle('checked');
    viewer.ignoreLimits = limitsToggle.classList.contains('checked');
});

radiansToggle.addEventListener('click', () => {
    radiansToggle.classList.toggle('checked');
    Object
        .values(sliders)
        .forEach(sl => sl.update());
});

collisionToggle.addEventListener('click', () => {
    collisionToggle.classList.toggle('checked');
    viewer.showCollision = collisionToggle.classList.contains('checked');
});

autocenterToggle.addEventListener('click', () => {
    autocenterToggle.classList.toggle('checked');
    viewer.noAutoRecenter = !autocenterToggle.classList.contains('checked');
});

controlsToggle.addEventListener('click', () => controlsel.classList.toggle('hidden'));

// watch for lisdf changes
viewer.addEventListener('lisdf-change', () => {

    Object
        .values(sliders)
        .forEach(sl => sl.remove());
    sliders = {};

});

viewer.addEventListener('ignore-limits-change', () => {

    Object
        .values(sliders)
        .forEach(sl => sl.update());

});

viewer.addEventListener('angle-change', e => {

    if (sliders[e.detail]) sliders[e.detail].update();

});

viewer.addEventListener('joint-mouseover', e => {

    const j = document.querySelector(`li[joint-name="${ e.detail }"]`);
    if (j) j.setAttribute('robot-hovered', true);

});

viewer.addEventListener('joint-mouseout', e => {

    const j = document.querySelector(`li[joint-name="${ e.detail }"]`);
    if (j) j.removeAttribute('robot-hovered');

});

let originalNoAutoRecenter;
viewer.addEventListener('manipulate-start', e => {

    const j = document.querySelector(`li[joint-name="${ e.detail }"]`);
    if (j) {
        j.scrollIntoView({ block: 'nearest' });
        window.scrollTo(0, 0);
    }

    originalNoAutoRecenter = viewer.noAutoRecenter;
    viewer.noAutoRecenter = true;

});

viewer.addEventListener('manipulate-end', e => {

    viewer.noAutoRecenter = originalNoAutoRecenter;

});

// create the sliders
viewer.addEventListener('lisdf-processed', () => {

    // const r = viewer.robot;
    for (const name in viewer.models) {
        const r = viewer.models[name];
        if (r.joints === undefined || r.joints.length === 0) continue;

        // add the name of the model
        const lili = document.createElement('li');
        lili.innerHTML =
            `
            <span title="${name}" class="model-name">${name}</span>
            `;
        sliderList.appendChild(lili);
        var added = 0;

        // add each joint
        Object
            .keys(r.joints)
            .sort((a, b) => {

                const da = a.split(/[^\d]+/g).filter(v => !!v).pop();
                const db = b.split(/[^\d]+/g).filter(v => !!v).pop();

                if (da !== undefined && db !== undefined) {
                    const delta = parseFloat(da) - parseFloat(db);
                    if (delta !== 0) return delta;
                }

                if (a > b) return 1;
                if (b > a) return -1;
                return 0;

            })
            .map(key => r.joints[key])
            .forEach(joint => {

                const li = document.createElement('li');
                li.innerHTML =
                    `
                    <span title="${joint.name}">${joint.name}</span>
                    <input type="range" value="0" step="0.0001"/>
                    <input type="number" step="0.0001" />
                    `;
                li.setAttribute('joint-type', joint.jointType);
                li.setAttribute('joint-name', joint.name);

                sliderList.appendChild(li);
                added += 1;

                // update the joint display
                const slider = li.querySelector('input[type="range"]');
                const input = li.querySelector('input[type="number"]');
                li.update = () => {
                    const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : RAD2DEG;
                    let angle = joint.angle;

                    if (joint.jointType === 'revolute' || joint.jointType === 'continuous') {
                        angle *= degMultiplier;
                    }

                    if (Math.abs(angle) > 1) {
                        angle = angle.toFixed(1);
                    } else {
                        angle = angle.toPrecision(2);
                    }

                    input.value = parseFloat(angle);

                    // directly input the value
                    slider.value = joint.angle;

                    if (viewer.ignoreLimits || joint.jointType === 'continuous') {
                        slider.min = -6.28;
                        slider.max = 6.28;

                        input.min = -6.28 * degMultiplier;
                        input.max = 6.28 * degMultiplier;
                    } else {
                        slider.min = joint.limit.lower;
                        slider.max = joint.limit.upper;

                        input.min = joint.limit.lower * degMultiplier;
                        input.max = joint.limit.upper * degMultiplier;
                    }
                };

                switch (joint.jointType) {

                    case 'continuous':
                    case 'prismatic':
                    case 'revolute':
                        break;
                    default:
                        li.update = () => {
                        };
                        input.remove();
                        slider.remove();
                        sliderList.removeChild(li);
                        added -= 1;

                }

                slider.addEventListener('input', () => {
                    viewer.setJointValue(joint, slider.value);
                    li.update();
                });

                input.addEventListener('change', () => {
                    const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : RAD2DEG;
                    viewer.setJointValue(joint, input.value * degMultiplier);
                    li.update();
                });

                li.update();

                sliders[(name, joint.name)] = li;

            });

        if (added === 0) {
            sliderList.removeChild(lili);
        }
    }
});

// animToggle.addEventListener('click', () => {
//     animToggle.classList.toggle('checked');
//     updateAnimation();
// });

document.addEventListener('WebComponentsReady', () => {

    document.querySelector('li[lisdf]').dispatchEvent(new Event('click'));

    if (/javascript\/example\/bundle/i.test(window.location)) {
        viewer.package = '../../../scene';
    }

    registerDragEvents(viewer, () => {
        setColor('#263238');
        animToggle.classList.remove('checked');
        updateList();
    });

});

// const updateLoop = () => {
//
//     if (animToggle.classList.contains('checked')) {
//         updateAnimation();
//     }
//
//     requestAnimationFrame(updateLoop);
//
// };

const updateList = () => {

    document.querySelectorAll('#lisdf-options li[lisdf]').forEach(el => {

        el.addEventListener('click', e => {

            const lisdf = e.target.getAttribute('lisdf');
            const color = e.target.getAttribute('color');

            // viewer.up = '-Z';
            // document.getElementById('up-select').value = viewer.up;
            viewer.lisdf = lisdf;
            animToggle.classList.add('checked');
            setColor(color);

        });

    });

};

updateList();

async function updateAnimation() {

    if (viewer.jsonPath === null) return;
    const response = await fetch(viewer.jsonPath);
    const animation = await response.json();
    var t = 0;

    function runKeyFrame() {
        const data = animation[t];
        for (const name in data) {
            const pose = data[name]['pose'];
            const positions = data[name]['joint_state'];
            if (name === 'pr20') {
                viewer.models[name].setJointValues(processRobotPositions(positions));
            } else {
                setPose(viewer.models[name], processPose(pose));
            }
            // console.log(name, pose, positions);
        }
        t += 1;
    }

    function loopKeyFrame() {
        if (animation.length === t) {
            return;
        }
        runKeyFrame();
        setTimeout(function() {
            requestAnimationFrame(loopKeyFrame);
            viewer.renderer.render(viewer.scene, viewer.camera);
        }, 20);
    }
    loopKeyFrame();

};

document.addEventListener('WebComponentsReady', () => {

    animToggle.addEventListener('click', () => animToggle.classList.toggle('checked'));

    // stop the animation if user tried to manipulate the model
    viewer.addEventListener('manipulate-start', e => animToggle.classList.remove('checked'));
    viewer.addEventListener('lisdf-processed', e => updateAnimation());
    // updateLoop();
    viewer.camera.position.set(-12, 6, 12);
    viewer.camera.lookAt(0, 0, 6);

});
