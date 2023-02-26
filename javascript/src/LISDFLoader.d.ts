import { LoadingManager, Object3D } from 'three';
import { URDFRobot } from './URDFClasses';

export default class LISDFLoader {

    manager: LoadingManager;

    constructor(manager?: LoadingManager);
    load(
        url: string,
        onLoad: (robot: {}) => void,
        onProgress?: (progress?: any) => void,
        onError?: (err?: any) => void
    ): void;
    parse(content: string | Element | Document): {};

}

export * from './URDFClasses';
