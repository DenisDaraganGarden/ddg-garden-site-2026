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
const MOBILE_VIEWPORT_MAX_WIDTH = 900;

let cachedCountriesGeojson = null;
let countriesGeojsonPromise = null;

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

const isMobileViewport = () => (
    typeof window !== 'undefined' && window.innerWidth <= MOBILE_VIEWPORT_MAX_WIDTH
);

const loadCountriesGeojson = async (signal) => {
    if (cachedCountriesGeojson) {
        return cachedCountriesGeojson;
    }

    if (!countriesGeojsonPromise) {
        countriesGeojsonPromise = fetch(COUNTRIES_GEOJSON_URL, { signal })
            .then((response) => response.json())
            .then((data) => {
                cachedCountriesGeojson = data;
                return data;
            })
            .catch((error) => {
                countriesGeojsonPromise = null;
                throw error;
            });
    }

    return countriesGeojsonPromise;
};

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

const makePixelTexture = (r, g, b) => {
    const texture = new THREE.DataTexture(
        new Uint8Array([r, g, b, 255]),
        1,
        1,
        THREE.RGBAFormat,
    );
    texture.needsUpdate = true;
    return texture;
};

// White-on-black land mask, drawn at runtime from the same country geojson that
// feeds the border outlines — so the scales sit exactly inside the coastlines.
const buildLandMaskTexture = (features) => {
    const width = 2048;
    const height = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    context.fillStyle = '#000000';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#ffffff';

    const project = (lng, lat) => [
        ((lng + 180) / 360) * width,
        ((90 - lat) / 180) * height,
    ];

    const drawRing = (ring) => {
        if (!ring || ring.length < 3) {
            return;
        }

        // Unwrap longitudes so polygons that straddle the antimeridian (Russia,
        // Fiji…) don't smear a horizontal band across the ocean.
        let previousLng = ring[0][0];
        const unwrapped = ring.map((coordinate, index) => {
            let lng = coordinate[0];

            if (index > 0) {
                while (lng - previousLng > 180) lng -= 360;
                while (lng - previousLng < -180) lng += 360;
            }

            previousLng = lng;
            return [lng, coordinate[1]];
        });

        // Draw the ring plus its ±360° copies so wrapped land shows on both edges.
        [-360, 0, 360].forEach((offset) => {
            context.beginPath();
            unwrapped.forEach(([lng, lat], index) => {
                const [x, y] = project(lng + offset, lat);
                if (index === 0) {
                    context.moveTo(x, y);
                } else {
                    context.lineTo(x, y);
                }
            });
            context.closePath();
            context.fill();
        });
    };

    const drawPolygon = (rings) => rings.forEach(drawRing);

    features.forEach((feature) => {
        const geometry = feature.geometry;
        if (!geometry) {
            return;
        }

        if (geometry.type === 'Polygon') {
            drawPolygon(geometry.coordinates);
        } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach(drawPolygon);
        }
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
};

const createNoirGlobeMaterial = () => {
    const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color('#070809'),
        emissive: new THREE.Color('#010102'),
        emissiveIntensity: 0.5,
        shininess: 60,
        specular: new THREE.Color('#2c3034'),
    });

    // Expose the sphere's native UVs (vUv) to the shader. three-globe aligns
    // standard equirectangular textures to the country outlines via these UVs,
    // so we sample the land mask the same way for pixel-perfect coastlines.
    material.defines = { USE_UV: '' };

    // Shared uniform objects: stored on userData so the component can swap the
    // land mask in once the geojson loads, and reused as-is inside the shader.
    const uniforms = {
        uTime: { value: 0 },
        uLandMask: { value: makePixelTexture(255, 255, 255) },
        uMaskUvOffset: { value: new THREE.Vector2(0, 0) },
        uGapColor: { value: new THREE.Color('#020203') },
        uScaleColor: { value: new THREE.Color('#0e0f11') },
        uWaterColor: { value: new THREE.Color('#050607') },
        uSheenColor: { value: new THREE.Color('#ffffff') },
        uRimColor: { value: new THREE.Color('#8b9097') },
        uWaterLightDir: { value: new THREE.Vector3(-0.3, 0.55, 0.78).normalize() },
        // x = scales per longitude band, y = scale rows per latitude (fine grain)
        uScaleFreq: { value: new THREE.Vector2(900.0, 475.0) },
    };
    material.userData.uniforms = uniforms;

    material.customProgramCacheKey = () => 'ddg-snake-scale-v9';
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
                varying vec3 vWorldPosition;
                varying vec3 vWorldNormal;
                varying vec3 vObjPosition;`,
            )
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                vec4 ddgWorldPosition = modelMatrix * vec4(transformed, 1.0);
                vWorldPosition = ddgWorldPosition.xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
                vObjPosition = normalize(transformed);`,
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
                uniform float uTime;
                uniform sampler2D uLandMask;
                uniform vec2 uMaskUvOffset;
                uniform vec3 uGapColor;
                uniform vec3 uScaleColor;
                uniform vec3 uWaterColor;
                uniform vec3 uSheenColor;
                uniform vec3 uRimColor;
                uniform vec3 uWaterLightDir;
                uniform vec2 uScaleFreq;
                varying vec3 vWorldPosition;
                varying vec3 vWorldNormal;
                varying vec3 vObjPosition;

                float ddgHash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                // One snake scale for integer row ri, sampled at this fragment.
                // Columns per row follow cos(lat) and snap to an integer, so the
                // tiling closes seamlessly in longitude (no meridian seam) and
                // thins toward the poles instead of spiralling into a vortex.
                // Returns (bodyMask, rimShade, scaleHash).
                vec3 ddgScale(float ri, float ulon, float rowF, vec2 freq) {
                    float rowLat = ((ri + 0.5) / freq.y) * PI - PI * 0.5;
                    float cosc = max(cos(rowLat), 0.06);
                    float cols = max(floor(freq.x * cosc + 0.5), 1.0);
                    float colF = ulon * cols + 0.5 * mod(ri, 2.0);
                    float cx = fract(colF) - 0.5;
                    float cy = rowF - (ri + 0.5);
                    float r = length(vec2(cx, cy * 0.9));
                    float body = 1.0 - smoothstep(0.42, 0.5, r);
                    float shade = smoothstep(0.5, -0.4, cy); // bright on the exposed lower rim
                    float id = ddgHash(vec2(floor(colF), ri));
                    return vec3(body, shade, id);
                }`,
            )
            .replace(
                '#include <opaque_fragment>',
                `
                vec3 worldNormal = normalize(vWorldNormal);
                vec3 viewDir = normalize(cameraPosition - vWorldPosition);
                float ndv = max(dot(worldNormal, viewDir), 0.0);
                float fresnel = pow(1.0 - ndv, 3.0);

                // object-space point keeps the scale tiling glued to the sphere
                vec3 sp = normalize(vObjPosition);
                float lon = atan(sp.z, sp.x);
                float lat = asin(clamp(sp.y, -1.0, 1.0));

                // land vs ocean from the geojson-built mask (white = land).
                // Sample via the sphere's native UVs — three-globe maps standard
                // equirectangular textures by uv and keeps them aligned with the
                // country outlines, so the scales land exactly on the coastlines.
                float landRaw = texture2D(uLandMask, vUv + uMaskUvOffset).r;
                float land = smoothstep(0.35, 0.65, landRaw);

                // --- overlapping snake scales (procedural, seamless) ---
                float ulon = fract((lon + PI) / (2.0 * PI));
                float rowF = ((lat + PI * 0.5) / PI) * uScaleFreq.y;
                float r0 = floor(rowF);

                // composite two rows: the upper scale genuinely lies over the lower
                vec3 sLow = ddgScale(r0, ulon, rowF, uScaleFreq);
                vec3 sUp = ddgScale(r0 + 1.0, ulon, rowF, uScaleFreq);
                float body = max(sLow.x, sUp.x);
                float shade = mix(sLow.y, sUp.y, sUp.x);
                float hashId = mix(sLow.z, sUp.z, sUp.x);

                // antialias: dissolve the micro-pattern as cells approach 1px (the
                // longitude seam self-hides here too, since ulon's wrap spikes fwidth)
                float density = fwidth(rowF) + fwidth(ulon * uScaleFreq.x);
                float detail = 1.0 - smoothstep(0.6, 1.4, density);

                // melt the converging rows into a smooth matte cap at the poles,
                // so the rings never collapse into a bullseye (~69deg..~84deg)
                float poleFade = 1.0 - smoothstep(1.20, 1.46, abs(lat));
                body *= detail * poleFade;

                // matte near-black body; per-scale jitter + overlap relief shading
                vec3 bodyTone = mix(uGapColor, uScaleColor, body);
                bodyTone *= 0.80 + 0.34 * hashId;
                bodyTone *= 0.74 + 0.52 * shade;

                // monochrome glint along the exposed scale rim + silhouette
                float crest = smoothstep(0.72, 1.0, shade) * body;
                float glint = (crest * 0.9 + fresnel * 0.5) * (0.35 + 0.65 * body);

                vec3 landSurface = mix(outgoingLight, bodyTone, 0.92);
                landSurface += uSheenColor * glint * 0.16;
                landSurface += uRimColor * fresnel * 0.10;

                // ocean: glossy black water. A fixed light + the globe's spin makes
                // the specular "sun glint" drift across the surface; faint ripple
                // (object-space, so no poles/seam) breaks it into sparkle.
                vec3 L = normalize(uWaterLightDir);
                vec3 reflDir = reflect(-viewDir, worldNormal);
                float rl = max(dot(reflDir, L), 0.0);
                float ripple = 0.62 + 0.38
                    * sin(sp.x * 90.0 + uTime * 0.8)
                    * sin(sp.z * 86.0 - uTime * 0.6);
                float waterGlint = pow(rl, 90.0) * ripple; // tight, broken highlight
                float sheen = pow(rl, 6.0) * 0.14;          // broad soft sheen

                vec3 waterSurface = mix(outgoingLight, uWaterColor, 0.92);
                waterSurface += uSheenColor * (waterGlint * 0.9 + sheen);
                waterSurface += uRimColor * fresnel * 0.10;

                outgoingLight = mix(waterSurface, landSurface, land);

                #include <opaque_fragment>`,
            );

        material.userData.shader = shader;
    };

    material.onBeforeRender = () => {
        uniforms.uTime.value = performance.now() * 0.001;
    };

    return material;
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
    const [mobileViewport, setMobileViewport] = useState(() => isMobileViewport());

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const updateViewport = () => {
            setMobileViewport(isMobileViewport());
        };

        updateViewport();
        window.addEventListener('resize', updateViewport);

        return () => {
            window.removeEventListener('resize', updateViewport);
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();

        loadCountriesGeojson(controller.signal)
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

    useEffect(() => {
        if (!countries.features || countries.features.length === 0) {
            return undefined;
        }

        const maskTexture = buildLandMaskTexture(countries.features);
        const landMaskUniform = globeMaterial.userData.uniforms?.uLandMask;
        const previousTexture = landMaskUniform?.value;

        if (landMaskUniform) {
            landMaskUniform.value = maskTexture;
        }

        if (previousTexture && previousTexture !== maskTexture) {
            previousTexture.dispose();
        }

        return () => {
            maskTexture.dispose();
        };
    }, [countries, globeMaterial]);

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
        controls.autoRotateSpeed = mobileViewport ? 0.04 : 0.06;
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
    }, [mobileViewport]);

    useEffect(() => {
        if (!globeEl.current || typeof document === 'undefined') {
            return undefined;
        }

        const globe = globeEl.current;
        const controls = globe.controls?.();

        const applyVisibilityState = () => {
            const isHidden = document.hidden || document.visibilityState !== 'visible';

            if (controls) {
                controls.autoRotate = !isHidden;
                controls.enabled = !isHidden;
            }

            if (isHidden) {
                globe.pauseAnimation?.();
            } else {
                globe.resumeAnimation?.();
            }
        };

        applyVisibilityState();
        document.addEventListener('visibilitychange', applyVisibilityState);
        window.addEventListener('pagehide', applyVisibilityState);
        window.addEventListener('pageshow', applyVisibilityState);
        window.addEventListener('blur', applyVisibilityState);
        window.addEventListener('focus', applyVisibilityState);

        return () => {
            document.removeEventListener('visibilitychange', applyVisibilityState);
            window.removeEventListener('pagehide', applyVisibilityState);
            window.removeEventListener('pageshow', applyVisibilityState);
            window.removeEventListener('blur', applyVisibilityState);
            window.removeEventListener('focus', applyVisibilityState);
        };
    }, []);

    useEffect(() => {
        if (!globeEl.current || typeof window === 'undefined') {
            return;
        }

        const renderer = globeEl.current.renderer?.();
        if (renderer) {
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileViewport ? 1 : 1.5));
        }
    }, [mobileViewport]);

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
                    rendererConfig={{
                        antialias: false,
                        alpha: true,
                        powerPreference: mobileViewport ? 'low-power' : 'default',
                    }}
                    showAtmosphere
                    atmosphereColor="#ffffff"
                    atmosphereAltitude={0.12}
                    polygonsTransitionDuration={0}
                    htmlTransitionDuration={200}
                    onGlobeReady={() => {
                        const renderer = globeEl.current?.renderer();

                        if (renderer) {
                            renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileViewport ? 1 : 1.5));
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
                    ringResolution={mobileViewport ? 22 : 32}
                    ringMaxRadius="maxR"
                    ringPropagationSpeed="propagationSpeed"
                    ringRepeatPeriod="repeatPeriod"
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

                        summary.onclick = (event) => {
                            event.stopPropagation();

                            const shouldExpand = !element.classList.contains('is-expanded');
                            document
                                .querySelectorAll('.globe-html-label--project-cluster.is-expanded')
                                .forEach((node) => node.classList.remove('is-expanded'));
                            element.classList.toggle('is-expanded', shouldExpand);
                        };

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
