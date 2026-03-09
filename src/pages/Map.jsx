import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useLocation } from 'react-router-dom';
import L from 'leaflet';
import { useLanguage } from '../i18n/LanguageProvider';
import { loadPortfolioProjects, getLocalizedPortfolioProject } from '../lib/portfolioProjectStorage';
import 'leaflet/dist/leaflet.css';
import '../styles/Map.css';

// Fix for default leaflet icons in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom marker icon that fits the DDG aesthetic (minimalist circle/dot)
const DDGMarkerIcon = L.divIcon({
    className: 'ddg-map-marker',
    html: '<div class="ddg-map-marker-inner"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

const MapController = ({ focusCoords }) => {
    const map = useMap();
    useEffect(() => {
        if (focusCoords) {
            map.setView(focusCoords, 12, { animate: true });
        }
    }, [focusCoords, map]);
    return null;
};

const Map = () => {
    const { language, t } = useLanguage();
    const routerLocation = useLocation();
    const queryParams = new URLSearchParams(routerLocation.search);
    const focusProjectId = queryParams.get('project');

    const projects = useMemo(() => loadPortfolioProjects(), []);

    const localizedProjects = useMemo(() =>
        projects.map(p => getLocalizedPortfolioProject(p, language)),
        [projects, language]);

    const focusedProject = useMemo(() =>
        localizedProjects.find(p => p.id === focusProjectId && p.coordinates),
        [localizedProjects, focusProjectId]);

    // Default center (Europe/Russia overview)
    const defaultCenter = [50, 20];
    const defaultZoom = 4;

    return (
        <div className="map-page" data-testid="map-page">
            <div className="map-page__header">
                <span className="portfolio-kicker">{t('navigation.map')}</span>
                <h1>{t('app.placeholders.map.title')}</h1>
            </div>

            <div className="map-container-wrap">
                <MapContainer
                    center={defaultCenter}
                    zoom={defaultZoom}
                    scrollWheelZoom={true}
                    className="ddg-leaflet-container"
                    zoomControl={false}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />

                    {localizedProjects.map((project) => (
                        project.coordinates && (
                            <Marker
                                key={project.id}
                                position={[project.coordinates.lat, project.coordinates.lng]}
                                icon={DDGMarkerIcon}
                                eventHandlers={{
                                    add: (e) => {
                                        if (project.id === focusProjectId) {
                                            e.target.openPopup();
                                        }
                                    }
                                }}
                            >
                                <Popup className="ddg-map-popup">
                                    <div className="ddg-popup-content">
                                        <span className="ddg-popup-year">{project.year}</span>
                                        <h3 className="ddg-popup-title">{project.title}</h3>
                                        <p className="ddg-popup-location">{project.location}</p>
                                        {project.coverImage && (
                                            <img src={project.coverImage} alt={project.title} className="ddg-popup-image" />
                                        )}
                                    </div>
                                </Popup>
                            </Marker>
                        )
                    ))}

                    <MapController focusCoords={focusedProject?.coordinates ? [focusedProject.coordinates.lat, focusedProject.coordinates.lng] : null} />
                </MapContainer>
            </div>
        </div>
    );
};

export default Map;
