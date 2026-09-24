import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Мини-карта панели «Окружение»: где участок и сколько карты вокруг. Точку
// тянут или ставят щелчком; сплошной круг — радиус, пунктир — что уже
// загружено. Схема — OpenStreetMap, спутник — Esri World Imagery: по снимку
// видно свой забор, по схеме — адреса. Leaflet грузится только с этой панелью.
const ROSTOV = [47.2357, 39.7015];

// Leaflet меряет коробку карты: пока панель свёрнута или ещё раскрывается, она
// нулевая, fitBounds даёт NaN и бросает — а с ним падал весь редактор. Такой
// показ круга ждёт первого настоящего размера.
function fit(current) {
    const size = current.map.getSize();
    current.fitLater = !size.x || !size.y;
    if (!current.fitLater) current.map.fitBounds(current.circle.getBounds(), { padding: [10, 10] });
}

export default function MiniMap({ lat, lon, radius, loaded, layer, onPick }) {
    const box = useRef(null);
    const parts = useRef(null);
    const pick = useRef(onPick);
    pick.current = onPick;
    const located = lat !== null && lon !== null;

    useEffect(() => {
        const map = L.map(box.current, { center: located ? [lat, lon] : ROSTOV, zoom: located ? 16 : 11, keyboard: false, attributionControl: true });
        const layers = {
            scheme: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© участники OpenStreetMap' }),
            photo: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' }),
        };
        map.attributionControl.setPrefix(false);
        const marker = L.marker(located ? [lat, lon] : ROSTOV, {
            icon: L.divIcon({ className: 'surroundings-pin', iconSize: [14, 14], iconAnchor: [7, 7] }), draggable: true, keyboard: false, opacity: located ? 1 : 0,
        }).addTo(map);
        marker.on('dragend', () => { const { lat: y, lng: x } = marker.getLatLng(); pick.current(y, x); });
        const circle = L.circle(located ? [lat, lon] : ROSTOV, { radius, weight: 1.5, color: '#f2d27c', fillOpacity: 0.06, interactive: false }).addTo(map);
        const done = L.circle(ROSTOV, { radius: 1, weight: 1, color: '#ffffff', dashArray: '4 4', fill: false, opacity: 0, interactive: false }).addTo(map);
        map.on('click', (event) => pick.current(event.latlng.lat, event.latlng.lng));
        parts.current = { map, marker, circle, done, layers, fitLater: false };
        if (located) fit(parts.current);
        // Панель могла ещё раскрываться, когда Leaflet мерил коробку.
        const resize = new ResizeObserver(() => {
            map.invalidateSize();
            if (parts.current?.fitLater) fit(parts.current);
        });
        resize.observe(box.current);
        return () => {
            resize.disconnect();
            map.remove();
            parts.current = null;
        };
    // Карта создаётся один раз; точку и круги двигает эффект ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const { map, layers } = parts.current ?? {};
        if (!map) return;
        const shown = layers[layer] ?? layers.scheme;
        for (const tiles of Object.values(layers)) if (tiles !== shown && map.hasLayer(tiles)) map.removeLayer(tiles);
        if (!map.hasLayer(shown)) shown.addTo(map);
    }, [layer]);

    // Новая точка — карта показывает весь круг; новый радиус — только если круг вышел за край.
    useEffect(() => {
        const current = parts.current;
        if (!current || !located) return;
        current.marker.setLatLng([lat, lon]).setOpacity(1);
        current.circle.setLatLng([lat, lon]);
        fit(current);
    }, [located, lat, lon]);
    useEffect(() => {
        const current = parts.current;
        if (!current || !located) return;
        current.circle.setRadius(radius);
        const size = current.map.getSize();
        if (!size.x || !size.y || !current.map.getBounds().contains(current.circle.getBounds())) fit(current);
    }, [located, radius]);

    const { lat: doneLat, lon: doneLon, radius: doneRadius } = loaded ?? {};
    useEffect(() => {
        const current = parts.current;
        if (!current) return;
        if (doneRadius) current.done.setLatLng([doneLat, doneLon]).setRadius(doneRadius).setStyle({ opacity: 0.8 });
        else current.done.setStyle({ opacity: 0 });
    }, [doneLat, doneLon, doneRadius]);

    return <div ref={box} className="surroundings-map" data-testid="surroundings-map" />;
}
