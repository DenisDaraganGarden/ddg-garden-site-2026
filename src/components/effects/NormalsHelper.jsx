import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { VertexNormalsHelper } from 'three/examples/jsm/helpers/VertexNormalsHelper.js';

const NormalsHelper = () => {
    const helperRef = useRef();
    const { scene } = useThree();

    useEffect(() => {
        const planeMesh = scene.getObjectByName('plane');
        if (planeMesh) {
            const helper = new VertexNormalsHelper(planeMesh, 0.3, 0x00ff00);
            scene.add(helper);
            helperRef.current = helper;
            return () => {
                scene.remove(helper);
                helper.dispose();
            };
        }
    }, [scene]);

    useFrame(() => {
        if (helperRef.current) {
            helperRef.current.update();
        }
    });

    return null;
};

export default NormalsHelper;
