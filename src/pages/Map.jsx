import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import Globe from 'react-globe.gl';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../i18n/useLanguage';
import { projectRegistry } from '../data/projectRegistry';
import { localizeField } from '../lib/localizeField';
import '../styles/Map.css';

const COUNTRIES_GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson';
const PROJECT_CLUSTER_DISTANCE_KM = 60;
const LABEL_NEIGHBORHOOD_DISTANCE_KM = 2200;

const MAJOR_COUNTRIES = [
    { lat: 37.0902, lng: -95.7129, text: 'USA' },
    { lat: 61.5240, lng: 105.3188, text: 'Russia' },
    { lat: 35.8617, lng: 104.1954, text: 'China' },
    { lat: -14.2350, lng: -51.9253, text: 'Brazil' },
    { lat: 20.5937, lng: 78.9629, text: 'India' },
    { lat: -25.2744, lng: 133.7751, text: 'Australia' },
    { lat: 56.1304, lng: -106.3468, text: 'Canada' },
    { lat: -30.5595, lng: 22.9375, text: 'South Africa' },
];

const toRadians = (value) => value * (Math.PI / 180);

const getDistanceKm = (first, second) => {
    const latDelta = toRadians(second.lat - first.lat);
    const lngDelta = toRadians(second.lng - first.lng);
    const lat1 = toRadians(first.lat);
    const lat2 = toRadians(second.lat);

    const a = (
        Math.sin(latDelta / 2) ** 2
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2
    );

    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getClusterCenter = (projects) => {
    const totals = projects.reduce((accumulator, project) => {
        const coordinates = project.coordinates ?? project;

        return {
            lat: accumulator.lat + coordinates.lat,
            lng: accumulator.lng + coordinates.lng,
        };
    }, {
        lat: 0,
        lng: 0,
    });

    return {
        lat: totals.lat / projects.length,
        lng: totals.lng / projects.length,
    };
};

const getLabelPlacement = (latDiff, lngDiff) => {
    const angle = Math.atan2(latDiff, lngDiff) * (180 / Math.PI);

    if (angle >= -22.5 && angle < 22.5) return 'east';
    if (angle >= 22.5 && angle < 67.5) return 'north-east';
    if (angle >= 67.5 && angle < 112.5) return 'north';
    if (angle >= 112.5 && angle < 157.5) return 'north-west';
    if (angle >= 157.5 || angle < -157.5) return 'west';
    if (angle >= -157.5 && angle < -112.5) return 'south-west';
    if (angle >= -112.5 && angle < -67.5) return 'south';
    return 'south-east';
};

const LABEL_PLACEMENT_FALLBACKS = {
    east: ['east', 'north-east', 'south-east', 'north', 'south', 'west'],
    'north-east': ['north-east', 'east', 'north', 'south-east', 'north-west', 'west'],
    north: ['north', 'north-east', 'north-west', 'east', 'west', 'south'],
    'north-west': ['north-west', 'west', 'north', 'south-west', 'north-east', 'east'],
    west: ['west', 'north-west', 'south-west', 'north', 'south', 'east'],
    'south-west': ['south-west', 'west', 'south', 'north-west', 'south-east', 'east'],
    south: ['south', 'south-east', 'south-west', 'east', 'west', 'north'],
    'south-east': ['south-east', 'east', 'south', 'north-east', 'south-west', 'west'],
};

const assignClusterPlacements = (clusters) => {
    const neighborhoods = [];
    const visited = new Set();

    clusters.forEach((cluster, index) => {
        if (visited.has(index)) {
            return;
        }

        const neighborhood = [];
        const stack = [index];
        visited.add(index);

        while (stack.length > 0) {
            const currentIndex = stack.pop();
            const currentCluster = clusters[currentIndex];

            neighborhood.push(currentCluster);

            clusters.forEach((candidate, candidateIndex) => {
                if (visited.has(candidateIndex)) {
                    return;
                }

                if (getDistanceKm(currentCluster, candidate) <= LABEL_NEIGHBORHOOD_DISTANCE_KM) {
                    visited.add(candidateIndex);
                    stack.push(candidateIndex);
                }
            });
        }

        neighborhoods.push(neighborhood);
    });

    return neighborhoods.flatMap((items) => {
        if (items.length === 1) {
            return items.map((item) => ({ ...item, placement: 'east' }));
        }

        if (items.length === 2) {
            return [...items]
                .sort((left, right) => left.lng - right.lng)
                .map((item, index) => ({
                    ...item,
                    placement: ['west', 'east'][index],
                }));
        }

        if (items.length === 3) {
            return [...items]
                .sort((left, right) => left.lng - right.lng)
                .map((item, index) => ({
                    ...item,
                    placement: ['south-west', 'north-west', 'east'][index],
                }));
        }

        if (items.length === 4) {
            return [...items]
                .sort((left, right) => left.lng - right.lng)
                .map((item, index) => ({
                    ...item,
                    placement: ['south-west', 'north-west', 'north-east', 'south-east'][index],
                }));
        }

        const center = getClusterCenter(items);
        const usedPlacements = new Set();

        return [...items]
            .sort((left, right) => left.lng - right.lng)
            .map((item) => {
                const preferredPlacement = getLabelPlacement(item.lat - center.lat, item.lng - center.lng);
                const placement = (
                    LABEL_PLACEMENT_FALLBACKS[preferredPlacement].find((option) => !usedPlacements.has(option))
                    ?? preferredPlacement
                );

                usedPlacements.add(placement);

                return {
                    ...item,
                    placement,
                };
            });
    });
};

const buildProjectClusters = (projects, language) => {
    const groups = [];

    projects.forEach((project) => {
        const existingGroup = groups.find((group) => (
            group.projects.some((groupProject) => (
                getDistanceKm(groupProject.coordinates, project.coordinates) <= PROJECT_CLUSTER_DISTANCE_KM
            ))
        ));

        if (existingGroup) {
            existingGroup.projects.push(project);
            return;
        }

        groups.push({ projects: [project] });
    });

    const clusters = groups.map((group, index) => {
        const projectsInGroup = [...group.projects].sort((left, right) => (
            Number(right.year) - Number(left.year)
            || left.title.localeCompare(right.title, language)
        ));
        const center = getClusterCenter(projectsInGroup);

        return {
            id: projectsInGroup.length > 1 ? `project-cluster-${index}` : projectsInGroup[0].id,
            lat: center.lat,
            lng: center.lng,
            count: projectsInGroup.length,
            labelText: getClusterLabelText(projectsInGroup),
            projects: projectsInGroup,
            type: projectsInGroup.length > 1 ? 'project-cluster' : 'project',
        };
    });

    return assignClusterPlacements(clusters);
};

const getClusterLabelText = (projects) => (
    [...projects]
        .map((project) => project.locationText)
        .sort((left, right) => left.length - right.length)[0]
);

const createNoirGlobeMaterial = () => {
    const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color('#040608'),
        emissive: new THREE.Color('#020304'),
        emissiveIntensity: 0.8,
        shininess: 18,
        specular: new THREE.Color('#56626d'),
    });

    material.customProgramCacheKey = () => 'ddg-noir-gloss-v3';
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uDeepColor = { value: new THREE.Color('#030507') };
        shader.uniforms.uWaveColor = { value: new THREE.Color('#0b1218') };
        shader.uniforms.uRimColor = { value: new THREE.Color('#7d92a6') };
        shader.uniforms.uHighlightColor = { value: new THREE.Color('#d8e3f0') };
        shader.uniforms.uFogColor = { value: new THREE.Color('#2b3641') };
        shader.uniforms.uCoreColor = { value: new THREE.Color('#7ea2c7') };
        shader.uniforms.uCorePulseColor = { value: new THREE.Color('#f6fbff') };

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
                varying vec3 vWorldPosition;
                varying vec3 vWorldNormal;`,
            )
            .replace(
                '#include <worldpos_vertex>',
                `#include <worldpos_vertex>
                vWorldPosition = worldPosition.xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * normal);`,
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
                uniform float uTime;
                uniform vec3 uDeepColor;
                uniform vec3 uWaveColor;
                uniform vec3 uRimColor;
                uniform vec3 uHighlightColor;
                uniform vec3 uFogColor;
                uniform vec3 uCoreColor;
                uniform vec3 uCorePulseColor;
                varying vec3 vWorldPosition;
                varying vec3 vWorldNormal;

                float waveBand(vec3 point, float scale, float speed, float phase) {
                    return sin(point.x * scale + point.y * (scale * 0.63) + point.z * (scale * 0.37) + uTime * speed + phase);
                }`,
            )
            .replace(
                '#include <opaque_fragment>',
                `
                vec3 spherePoint = normalize(vWorldPosition);
                vec3 worldNormal = normalize(vWorldNormal);
                vec3 viewDir = normalize(cameraPosition - vWorldPosition);

                float wave = 0.0;
                wave += waveBand(spherePoint, 12.0, 0.16, 0.0);
                wave += waveBand(spherePoint.zxy, 18.0, -0.11, 1.7);
                wave += waveBand(spherePoint.yzx, 26.0, 0.09, 3.1);
                wave = wave / 3.0 * 0.5 + 0.5;

                float fresnel = pow(1.0 - max(dot(worldNormal, viewDir), 0.0), 2.7);
                float specSweep = smoothstep(0.62, 0.95, wave) * 0.14;
                float surfaceTone = smoothstep(0.18, 0.88, wave);
                float frontMask = pow(max(dot(worldNormal, viewDir), 0.0), 1.45);

                float fogPattern = 0.0;
                fogPattern += waveBand(spherePoint * 0.85, 5.5, 0.05, 0.4);
                fogPattern += waveBand(spherePoint.yzx * 1.15, 8.0, -0.035, 2.2);
                fogPattern += waveBand(spherePoint.zxy * 1.4, 11.0, 0.025, 4.1);
                fogPattern = fogPattern / 3.0 * 0.5 + 0.5;

                float innerFog = smoothstep(0.24, 0.86, fogPattern) * frontMask * 0.22;
                innerFog += pow(frontMask, 3.0) * 0.06;

                float corePulse = 0.5 + 0.5 * sin(uTime * 0.28);
                float coreMask = pow(frontMask, 1.85);
                float coreShape = smoothstep(0.18, 0.95, fogPattern) * 0.72 + 0.28;
                float coreGlow = coreMask * coreShape * (1.05 + corePulse * 0.28);
                float coreHotspot = pow(frontMask, 3.8) * (0.55 + corePulse * 0.18);
                float coreBloom = pow(frontMask, 1.25) * 0.18;
                vec3 coreLight = mix(uCoreColor, uCorePulseColor, corePulse * 0.35);

                vec3 noirWater = mix(uDeepColor, uWaveColor, surfaceTone * 0.65);
                outgoingLight = mix(outgoingLight, noirWater, 0.82);
                outgoingLight = mix(outgoingLight, uFogColor, innerFog);
                outgoingLight += uFogColor * innerFog * 0.18;
                outgoingLight = mix(outgoingLight, coreLight, coreGlow * 0.42);
                outgoingLight += coreLight * (coreGlow * 1.05 + coreHotspot * 1.45 + coreBloom);
                outgoingLight += uRimColor * fresnel * 0.16;
                outgoingLight += uHighlightColor * (specSweep + fresnel * 0.03);

                #include <opaque_fragment>`,
            );

        material.userData.shader = shader;
    };

    material.onBeforeRender = () => {
        const shader = material.userData.shader;

        if (shader) {
            shader.uniforms.uTime.value = performance.now() * 0.001;
        }
    };

    return material;
};

const createInnerCoreSprite = (radius) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;

    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(256, 256, 24, 256, 256, 256);
    gradient.addColorStop(0, 'rgba(245, 250, 255, 0.92)');
    gradient.addColorStop(0.18, 'rgba(170, 194, 221, 0.68)');
    gradient.addColorStop(0.42, 'rgba(94, 121, 150, 0.28)');
    gradient.addColorStop(0.72, 'rgba(52, 68, 86, 0.08)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
    });

    const sprite = new THREE.Sprite(material);
    const size = radius * 1.18;
    sprite.scale.set(size, size, 1);
    sprite.renderOrder = 1;

    return sprite;
};

const navigateToProject = (projectId) => {
    window.location.assign(`/portfolio?project=${projectId}`);
};

const attachProjectHover = (element, project, setHoverD) => {
    element.onmouseenter = () => setHoverD(project);
    element.onmouseleave = () => {
        setHoverD((previous) => (previous?.id === project.id ? null : previous));
    };
};

const Map = () => {
    const { language, t } = useLanguage();
    const routerLocation = useLocation();
    const queryParams = new URLSearchParams(routerLocation.search);
    const focusProjectId = queryParams.get('project') ?? '';
    const globeEl = useRef();

    const [hoverD, setHoverD] = useState(null);
    const [countries, setCountries] = useState({ features: [] });
    const [globeRadius, setGlobeRadius] = useState(0);

    useEffect(() => {
        const controller = new AbortController();

        fetch(COUNTRIES_GEOJSON_URL, { signal: controller.signal })
            .then((response) => response.json())
            .then(setCountries)
            .catch((error) => {
                if (error.name !== 'AbortError') {
                    console.error('Error loading GeoJSON:', error);
                }
            });

        return () => controller.abort();
    }, []);

    const globeMaterial = useMemo(() => createNoirGlobeMaterial(), []);

    useEffect(() => () => globeMaterial.dispose(), [globeMaterial]);

    const localizedProjects = useMemo(() => (
        projectRegistry.map((project) => ({
            ...project,
            title: localizeField(project.title, language),
            locationText: localizeField(project.location, language),
        }))
    ), [language]);

    const mappableProjects = useMemo(() => (
        localizedProjects.filter((project) => (
            project.coordinates
            && project.status !== 'placeholder'
        ))
    ), [localizedProjects]);

    const projectClusters = useMemo(() => (
        buildProjectClusters(mappableProjects, language)
    ), [language, mappableProjects]);

    const ringData = useMemo(() => (
        projectClusters.map((cluster) => ({
            lat: cluster.lat,
            lng: cluster.lng,
            maxR: cluster.count > 1 ? 3.3 : 2.6,
            propagationSpeed: cluster.count > 1 ? 1.2 : 1,
            repeatPeriod: cluster.count > 1 ? 1500 : 1200,
        }))
    ), [projectClusters]);

    const coreLayerData = useMemo(() => (
        globeRadius > 0 ? [{ id: 'inner-core', radius: globeRadius }] : []
    ), [globeRadius]);

    const labelData = useMemo(() => {
        const projectLabels = projectClusters.map((cluster) => ({
            ...cluster,
            altitude: cluster.count > 1 ? 0.018 : 0.014,
        }));

        const countryLabels = MAJOR_COUNTRIES.map((country) => ({
            ...country,
            altitude: 0.006,
            type: 'country',
        }));

        return [...projectLabels, ...countryLabels];
    }, [projectClusters]);

    useEffect(() => {
        if (focusProjectId && globeEl.current) {
            const project = mappableProjects.find((item) => item.id === focusProjectId || item.slug === focusProjectId);

            if (project) {
                globeEl.current.pointOfView({
                    lat: project.coordinates.lat,
                    lng: project.coordinates.lng,
                    altitude: 1.8,
                }, 1400);
            }
        }
    }, [focusProjectId, mappableProjects]);

    useEffect(() => {
        if (!globeEl.current) {
            return;
        }

        const controls = globeEl.current.controls();
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.06;
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
    }, []);

    return (
        <div className="map-page map-page--globe" data-testid="map-page">
            <div className="map-page__header">
                <span className="portfolio-kicker">{t('navigation.map')}</span>
                <h1>{t('map.title')}</h1>
            </div>

            <div className="globe-container">
                <Globe
                    ref={globeEl}
                    backgroundColor="#000000"
                    globeMaterial={globeMaterial}
                    rendererConfig={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
                    showAtmosphere
                    atmosphereColor="#ffffff"
                    atmosphereAltitude={0.12}
                    polygonsTransitionDuration={0}
                    htmlTransitionDuration={200}
                    onGlobeReady={() => {
                        const renderer = globeEl.current?.renderer();

                        if (renderer) {
                            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
                        }

                        if (globeEl.current) {
                            setGlobeRadius(globeEl.current.getGlobeRadius());
                        }
                    }}
                    polygonsData={countries.features}
                    polygonCapColor={() => 'rgba(0, 0, 0, 0)'}
                    polygonSideColor={() => 'rgba(0, 0, 0, 0)'}
                    polygonStrokeColor={() => 'rgba(255, 255, 255, 0.16)'}
                    polygonAltitude={0.0024}
                    ringsData={ringData}
                    ringColor={() => '#ffffff'}
                    ringAltitude={0.006}
                    ringResolution={32}
                    ringMaxRadius="maxR"
                    ringPropagationSpeed="propagationSpeed"
                    ringRepeatPeriod="repeatPeriod"
                    customLayerData={coreLayerData}
                    customThreeObject={(item) => createInnerCoreSprite(item.radius)}
                    customThreeObjectUpdate={(object, item) => {
                        const size = item.radius * 1.18;
                        object.scale.set(size, size, 1);
                    }}
                    htmlElementsData={labelData}
                    htmlLat={(item) => item.lat}
                    htmlLng={(item) => item.lng}
                    htmlAltitude={(item) => item.altitude ?? 0}
                    htmlElementVisibilityModifier={(element, isVisible) => {
                        element.dataset.visible = isVisible ? 'true' : 'false';
                        element.style.pointerEvents = isVisible ? 'auto' : 'none';
                    }}
                    htmlElement={(item) => {
                        const element = document.createElement('div');
                        element.className = `globe-html-label globe-html-label--${item.type}`;
                        element.dataset.visible = 'true';

                        if (item.type === 'country') {
                            const text = document.createElement('span');
                            text.className = 'globe-html-label__country-text';
                            text.innerText = item.text;
                            element.appendChild(text);
                            return element;
                        }

                        element.classList.add(`globe-html-label--placement-${item.placement ?? 'east'}`);

                        const anchor = document.createElement('div');
                        anchor.className = 'globe-html-label__anchor';

                        const dot = document.createElement('span');
                        dot.className = 'globe-html-label__dot';
                        anchor.appendChild(dot);

                        if (item.count > 1) {
                            const count = document.createElement('span');
                            count.className = 'globe-html-label__cluster-count';
                            count.innerText = String(item.count);
                            anchor.appendChild(count);
                        }

                        element.appendChild(anchor);

                        const body = document.createElement('div');
                        body.className = 'globe-html-label__body';

                        const summary = document.createElement('button');
                        summary.type = 'button';
                        summary.className = 'globe-html-label__project-link globe-html-label__project-link--summary';
                        summary.innerText = item.labelText;
                        body.appendChild(summary);

                        if (item.type === 'project') {
                            const project = item.projects[0];

                            summary.onclick = (event) => {
                                event.stopPropagation();
                                navigateToProject(project.id);
                            };

                            attachProjectHover(summary, project, setHoverD);
                            element.appendChild(body);
                            return element;
                        }

                        item.projects.forEach((project) => {
                            const button = document.createElement('button');
                            button.type = 'button';
                            button.className = 'globe-html-label__project-link globe-html-label__project-link--detail';
                            button.innerText = project.title;
                            button.onclick = (event) => {
                                event.stopPropagation();
                                navigateToProject(project.id);
                            };

                            attachProjectHover(button, project, setHoverD);
                            body.appendChild(button);
                        });

                        element.appendChild(body);
                        return element;
                    }}
                    minAltitude={1.1}
                    maxAltitude={4}
                />

                {hoverD && (
                    <div className="globe-tooltip">
                        <span className="globe-tooltip__year">{hoverD.year}</span>
                        <h3 className="globe-tooltip__title">{hoverD.title}</h3>
                        <p className="globe-tooltip__location">{hoverD.locationText}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Map;
