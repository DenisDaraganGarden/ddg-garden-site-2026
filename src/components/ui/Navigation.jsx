import React from 'react';
import { NavLink } from 'react-router-dom';
import './Navigation.css';

const navItems = [
    { name: 'News', path: '/news' },
    { name: 'Info', path: '/info' },
    { name: 'Monographs', path: '/monographs' },
    { name: 'Press', path: '/press' },
    { name: 'Map', path: '/map' },
    { name: 'Archive', path: '/archive' }
];

const Navigation = () => {
    return (
        <nav className="main-nav">
            <div className="nav-brand">
                <NavLink to="/">
                    Denis Daragan
                    <span className="brand-subtitle">Design</span>
                </NavLink>
            </div>

            <ul className="nav-links">
                {navItems.map((item) => (
                    <li key={item.name}>
                        <NavLink
                            to={item.path}
                            className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
                        >
                            {item.name}
                        </NavLink>
                    </li>
                ))}
            </ul>
        </nav>
    );
};

export default Navigation;
