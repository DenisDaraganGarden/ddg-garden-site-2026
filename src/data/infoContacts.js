export const infoContacts = {
  sheetLabel: {
    ru: 'Контактный лист',
    en: 'Contact sheet',
  },
  heading: {
    ru: 'Офисы бюро и базовая связь',
    en: 'Bureau offices and core contact details',
  },
  note: {
    ru: 'На странице оставлена только базовая информация: офис СПБ, офис США, телефон и карта Яндекса.',
    en: 'Only the essential information remains on this page: SPB office, US office, phone number, and a Yandex map.',
  },
  openMapLabel: {
    ru: 'Открыть в Яндекс Картах',
    en: 'Open in Yandex Maps',
  },
  phoneLabel: {
    ru: 'Телефон',
    en: 'Phone',
  },
  phoneNumber: '+7 999 695-15-90',
  mapOfficeId: 'spb',
  offices: [
    {
      id: 'spb',
      label: {
        ru: 'Офис СПБ',
        en: 'SPB Office',
      },
      address: {
        ru: 'Большой проспект Петроградской стороны, 76-78, Санкт-Петербург, 197136',
        en: 'Bolshoy Prospekt Petrogradskoy Storony, 76-78, Saint Petersburg, 197136',
      },
      coords: '59.963665, 30.30814',
      mapLink: 'https://yandex.ru/maps/?ll=30.30814%2C59.963665&z=16',
      mapEmbedUrl: 'https://yandex.ru/map-widget/v1/?ll=30.30814%2C59.963665&z=16',
    },
    {
      id: 'us',
      label: {
        ru: 'Офис США',
        en: 'US Office',
      },
      address: {
        ru: '123 Ocean Drive, Santa Monica, CA 90401',
        en: '123 Ocean Drive, Santa Monica, CA 90401',
      },
      coords: '34.0116, -118.4923',
      mapLink: 'https://yandex.com/maps/?ll=-118.4923%2C34.0116&z=16',
      mapEmbedUrl: '',
    },
  ],
};
