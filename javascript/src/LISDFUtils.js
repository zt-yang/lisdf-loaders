import * as THREE from 'three';

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

export function setPose(body, pose) {
    body.updateMatrixWorld(true);
    body.position.set(pose[0], pose[1], pose[2]);
    applyRotation(body, [pose[3], pose[4], pose[5]]);
}

function quat2Euler(quat) {
    tempQuaternion.set(quat[0], quat[1], quat[2], quat[3]);
    tempEuler.setFromQuaternion(tempQuaternion);
    return [tempEuler.x, tempEuler.y, tempEuler.z];
}

export function processPose(pose) {
    // the axes in pybullet and here are different

    if (pose.length === 2) {
        pose = pose[0].concat(quat2Euler(pose[1]));
    }

    /* from pybullet to THREE.js, rotate 90 degrees around X then 180 degrees around Y
        Pybullet
           Z
           |
           |
           .-----Y
         ／
        X
        THREE.js
          Y
          |   X
          | ／
          .----- Z
    */
    pose[3] -= Math.PI / 2;
    pose[5] += Math.PI;
    pose = [-pose[0], pose[2], pose[1], pose[3], pose[5], pose[4]];
    return pose;
}

export function processRobotPositions(positions) {
    // the axes in pybullet and here are different
    const jointMap = [];
    for (var name in positions) {
        var value = positions[name];
        if (name === 'y' || name === 'x') {
            value = -value;
        } else if (name === 'theta') {
            value += Math.PI;
        }
        jointMap[name] = value;
    }
    return jointMap;
}
