import React from 'react';
import { infoContacts } from '../data/infoContacts';
import { useLanguage } from '../i18n/useLanguage';
import { localizeField } from '../lib/localizeField';
import '../styles/Info.css';

const Info = () => {
  const { language, t } = useLanguage();
  const mapOffice = infoContacts.offices.find((office) => office.id === infoContacts.mapOfficeId)
    ?? infoContacts.offices[0];
  const dialHref = `tel:${infoContacts.phoneNumber.replace(/[^\d+]/g, '')}`;

  return (
    <div className="info-page" data-testid="info-page">
      <div className="info-shell">
        <header className="info-header">
          <div className="info-title-wrap">
            <h1 className="info-title" data-testid="info-title">{t('info.title')}</h1>
            <span className="info-kicker">{localizeField(infoContacts.sheetLabel, language)}</span>
          </div>
        </header>

        <div className="info-main-grid">
          <div className="info-column info-column--left">
            <div className="info-office-hero">
              <img src="/info/office.jpg" alt="Office" className="info-office-hero__image" />
              <div className="info-office-hero__overlay" />
            </div>
          </div>

          <div className="info-column info-column--right">
            <div className="info-personal-photo">
              <img src="/info/personal.webp" alt="Denis Daragan" className="info-personal-image" />
              <div className="info-personal-label">Denis Daragan</div>
            </div>

            <div className="info-header__copy">
              <p className="info-heading">{localizeField(infoContacts.heading, language)}</p>
              <p className="info-note">{localizeField(infoContacts.note, language)}</p>
            </div>

            <section className="info-contact-sheet" data-testid="info-contact-sheet">
              <div className="info-phone-block">
                <span className="info-field-label">{localizeField(infoContacts.phoneLabel, language)}</span>
                <a className="info-phone-link" href={dialHref} data-testid="info-phone-link">
                  {infoContacts.phoneNumber}
                </a>
              </div>

              <div className="info-office-list">
                {infoContacts.offices.map((office) => (
                  <a
                    key={office.id}
                    className="info-office-card"
                    href={office.mapLink}
                    target="_blank"
                    rel="noreferrer"
                    data-testid={`info-office-${office.id}`}
                  >
                    <span className="info-field-label">{localizeField(office.label, language)}</span>
                    <strong className="info-office-card__address">{localizeField(office.address, language)}</strong>
                    <span className="info-office-card__coords">{office.coords}</span>
                  </a>
                ))}
              </div>

              <aside className="info-map-panel">
                <div className="info-map-frame" data-testid="info-map-frame">
                  <iframe
                    title={localizeField(mapOffice.label, language)}
                    src={mapOffice.mapEmbedUrl}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>

                <div className="info-map-meta">
                  <span>{localizeField(mapOffice.label, language)}</span>
                  <span>{mapOffice.coords}</span>
                </div>

                <a
                  className="info-map-link"
                  href={mapOffice.mapLink}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="info-open-map-link"
                >
                  {localizeField(infoContacts.openMapLabel, language)}
                </a>
              </aside>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Info;
