'use strict';
(() => {
  // Russian is the editable source. Keep translations separate from project IDs,
  // source links and artwork, and translate text nodes without rebuilding DOM.
  const english = {
    'Denis Daragan · Ландшафт': 'Denis Daragan · Landscape',
    'Сады и ландшафтные концепции Дениса Дарагана. Избранные работы.': 'Gardens and landscape concepts by Denis Daragan. Selected works.',
    'Сады и ландшафтные концепции. Избранные работы.': 'Gardens and landscape concepts. Selected works.',
    'Звук': 'Sound',
    'К работам': 'View works',
    'Меню': 'Menu',
    'Работы': 'Works',
    'НАГРАДЫ': 'Awards',
    'Автопортрет': 'Self-portrait',
    'Почерк': 'Signature',
    'Почерк.': 'Signature.',
    'Истоки': 'Origins',
    'Истоки.': 'Origins.',
    'Волна': 'Wave',
    'Свет': 'Light',
    'Память': 'Memory',
    'Иван Айвазовский · «Девятый вал», 1850': 'Ivan Aivazovsky · The Ninth Wave, 1850',
    'Рембрандт · «Снятие с креста», 1634': 'Rembrandt · The Descent from the Cross, 1634',
    'Читать': 'Read',
    'Целиком': 'Full image',
    'Фрагмент': 'Detail',
    'Образы': 'Imagery',
    'Денис Дараган': 'Denis Daragan',
    'Природа': 'Nature',
    'Природа.': 'Nature.',
    'Живое': 'Living',
    'Материя': 'Matter',
    'Живое.': 'Living.',
    'Материя.': 'Matter.',
    'Портфолио ↓': 'Portfolio ↓',
    'Портфолио': 'Portfolio',
    'Портфолио.': 'Portfolio.',
    'Мои сады ↓': 'My gardens ↓',
    'Все': 'All',
    'Парки': 'Parks',
    'Отели': 'Hotels',
    'Город': 'Urban',
    'Частные': 'Private',
    'Сад выпускников': 'Alumni Garden',
    'Крым': 'Crimea',
    'Пространство и скульптура': 'Space and Sculpture',
    'Жилой комплекс · Москва I': 'Residential Complex · Moscow I',
    'Жилой комплекс · Москва II': 'Residential Complex · Moscow II',
    'Жилой комплекс · Москва III': 'Residential Complex · Moscow III',
    'Жилой комплекс · Москва IV': 'Residential Complex · Moscow IV',
    'Пока нет работ в этой категории.': 'There are no works in this category yet.',
    'Для Derevo Park': 'For Derevo Park',
    'О проекте': 'About the project',
    'Совместно с CHADO': 'In collaboration with CHADO',
    'В сотрудничестве с L.BURO': 'In collaboration with L.BURO',
    'Москва · В сотрудничестве с L.BURO': 'Moscow · In collaboration with L.BURO',
    'В сотрудничестве с Derevo Park': 'In collaboration with Derevo Park',
    'Золото · 2025': 'Gold · 2025',
    'Серебро · 2025': 'Silver · 2025',
    'Серебро · 2024': 'Silver · 2024',
    'Золото · 2023': 'Gold · 2023',
    'Серебро · 2023': 'Silver · 2023',
    'Ямское': 'Yamskoe',
    'Чайный дом': 'Tea House',
    'Обсудим проект': 'Discuss a project',
    'ПОЧТА': 'Email',
    'Закрыть': 'Close',
    'Трава ложится по ветру.': 'The grass bends with the wind.',
    'Потом поднимается.': 'Then rises again.',
    'Ветвь помнит,': 'A branch remembers',
    'откуда приходил свет.': 'where the light came from.',
    'Я могу провести линию сада.': 'I can draw the line of a garden.',
    'Но лист развернётся сам.': 'But a leaf will unfold on its own.',
    'Камень хранит остывший огонь.': 'Stone holds a fire that has cooled.',
    'Песок — движение воды.': 'Sand is the movement of water.',
    'Я касаюсь поверхности': 'I touch the surface',
    'и задерживаю руку.': 'and let my hand linger.',
    'Иногда этого достаточно,': 'Sometimes that is enough',
    'чтобы начать.': 'to begin.',
    'Пароль': 'Password',
    'Скачать ↓': 'Download ↓',
    'Запросить пароль': 'Request password',
    'Во мне звучит.': 'What resonates within.',
    'Борис Гмыря · Шуберт': 'Borys Hmyria · Schubert',
    'Смерть и девушка': 'Death and the Maiden',
    'Украинская народная песня': 'Ukrainian folk song',
    'Ой, Марічко, чичері': 'Oi, Marichko, chycheri',
    'Дон': 'Don',
    'Тихий Дон': 'Quiet Don',
    'Записи открываются на YouTube.': 'Recordings open on YouTube.',
    'Открыть аудиофайл': 'Open audio file',
    'Манифест': 'Manifesto',
    'Волна за кадром': 'The wave beyond the frame',
    'Море штормит. Но где же та самая волна?': 'The sea is raging. But where is that very wave?',
    'У Айвазовского есть и более яростное море. В «Девятом вале» меня держит другое: для меня буря этой картины — прежде всего в стихии событий, в судьбе людей.': 'Aivazovsky painted seas more violent than this. Something else holds me in The Ninth Wave: for me, its storm lies above all in the force of events, in the fate of the people.',
    'Я смотрю на обломок мачты, за который держатся моряки, и вижу крест. Солнце не пугает. Оно притягивает, обещает надежду. И всё это — внутри истории о трагедии.': 'I look at the broken mast the sailors cling to and see a cross. The sun does not frighten me. It draws me in and promises hope. All of this is held within a story of tragedy.',
    'В моём прочтении самая страшная волна остаётся за кадром. Я чувствую её присутствие, хотя не могу на неё указать. Это композиционное решение заставляет меня возвращаться к картине.': 'In my reading, the most terrifying wave remains beyond the frame. I feel its presence, although I cannot point to it. This compositional choice keeps bringing me back to the painting.',
    'Вот чем мне интересно заниматься: искать смыслы. Понимать, как изображение рассказывает о том, чего буквально не показывает.': 'This is what interests me: finding meaning. Understanding how an image can speak of what it does not literally show.',
    'Денис Дараган · личное прочтение картины': 'Denis Daragan · a personal reading of the painting',
    'Свет изнутри': 'Light from within',
    'Для меня в «Снятии с креста» — суть христианства в одном моменте.': 'For me, The Descent from the Cross holds the essence of Christianity in a single moment.',
    'Спаситель мёртв. Его принимают на руки, готовят плащаницу. И великая история становится предельно человеческой: тяжесть тела, осторожность прикосновения, горе каждого из тех, кто рядом.': 'The Saviour is dead. They receive him in their arms and prepare the shroud. A great story becomes profoundly human: the weight of a body, the care of a touch, the grief of everyone around him.',
    'Мне кажется, фонарь внизу не может дать столько света. Тело Христа отражает его так, будто само становится источником. Свет здесь рассказывает больше, чем объясняет.': 'It seems to me that the lantern below cannot give off so much light. The body of Christ reflects it as though becoming a source of light itself. Here, light tells more than it explains.',
    'Я не вижу натянутых лиц, готовой маски гнева или печали. Здесь мне нужны именно настоящие эмоции. Эта честность трогает меня сильнее любого эффектного жеста.': 'I see no strained faces, no ready-made mask of anger or sorrow. What I need here is real emotion. This honesty moves me more than any dramatic gesture.',
    'Я рассматривал картины Рембрандта ещё ребёнком. Тогда это было почти невообразимой фантазией. Теперь я возвращаюсь к ним, чтобы понять, как свет, тень и композиция могут сказать правду.': 'I studied Rembrandt’s paintings as a child. Back then they felt like an almost unimaginable fantasy. Now I return to them to understand how light, shadow and composition can tell the truth.',
    'Картины и образы': 'Paintings and imagery',
    'Иван Айвазовский. «Девятый вал», 1850.': 'Ivan Aivazovsky. The Ninth Wave, 1850.',
    'Государственный Русский музей.': 'The State Russian Museum.',
    'Картина в коллекции музея': 'Painting in the museum collection',
    'Рембрандт. «Снятие с креста», 1634.': 'Rembrandt. The Descent from the Cross, 1634.',
    'Государственный Эрмитаж.': 'The State Hermitage Museum.',
    'Коллекция Эрмитажа': 'Hermitage collection',
    'Репродукция · Wikimedia Commons': 'Reproduction · Wikimedia Commons',
    'Крест, огонь, животные, фактуры, растения и пейзажи в монтаже — образы из моей коллекции вдохновения, работы других авторов. Они передают ассоциации, а не документируют места моей биографии. Авторские работы и монограмма Дениса Дарагана отмечены отдельно.': 'The cross, fire, animals, textures, plants and landscapes in the montage are images from my collection of inspiration, created by other authors. They convey associations rather than document places from my biography. Denis Daragan’s own works and monogram are identified separately.',
    'Тексты рядом с картинами — моё личное прочтение.': 'The texts accompanying the paintings are my personal readings.',
    'Начало': 'Home',
    'Обо мне': 'About me',
    'Контакт': 'Contact',
    'Ландшафт: Денис Дараган': 'Landscape: Denis Daragan',
    'По заказу студии Derevo Park': 'Commissioned by Derevo Park studio',
    'Совместно с архитектурным бюро CHADO': 'In collaboration with CHADO architecture studio',
    'Ландшафтная концепция: Денис Дараган. В сотрудничестве с L.BURO.': 'Landscape concept: Denis Daragan. In collaboration with L.BURO.',
    'Серебряный диплом АЛАРОС 2023': 'ALAROS Silver Diploma 2023',
    'Золотой диплом АЛАРОС 2025': 'ALAROS Gold Diploma 2025',
    'Серебряный диплом АЛАРОС 2025': 'ALAROS Silver Diploma 2025',
    'Серебряный диплом АЛАРОС 2024': 'ALAROS Silver Diploma 2024',
    'Золотой диплом АЛАРОС 2023': 'ALAROS Gold Diploma 2023',
    'На конкурсном планшете': 'Competition board credits',
    'Пётр Лари': 'Petr Lari',
    'главный архитектор': 'chief architect',
    'архитектор': 'architect',
    'На сайте АЛАРОС': 'On the ALAROS website',
    'Снимок страницы': 'Page capture',
    'Жилой комплекс, Москва.': 'Residential complex, Moscow.',
    'Концепция команды Denis Daragan Бюро. Руководство: Денис Дараган.': 'Concept by the Denis Daragan Bureau team. Led by Denis Daragan.',
    'Денис Дараган и команда.': 'Denis Daragan and team.',
    'В сотрудничестве с Derevo Park.': 'In collaboration with Derevo Park.',
    'Денис Дараган.': 'Denis Daragan.',
    'В сотрудничестве с L.BURO.': 'In collaboration with L.BURO.',
    'Play Hub «Сад вне времени»': 'Play Hub “Garden Beyond Time”',
    'Лучший нереализованный проект общественного пространства площадью менее 1 Га': 'Best unbuilt public space project under 1 hectare',
    'Заявитель: Ландшафтная Студия «L.BURO»': 'Applicant: L.BURO landscape studio',
    'Заявитель: Ландшафтная студия «L.BURO»': 'Applicant: L.BURO landscape studio',
    'Заявитель: ООО «ДЕРЕВОПАРК»': 'Applicant: DEREVOPARK LLC',
    'Андрей Кочетков': 'Andrey Kochetkov',
    'руководитель группы': 'team lead',
    'Владимир Соколов': 'Vladimir Sokolov',
    'Лучший нереализованный проект комплексного благоустройства жилой среды площадью менее 1 Га': 'Best unbuilt comprehensive residential landscape project under 1 hectare',
    'Лев Осипов': 'Lev Osipov',
    'Лучший нереализованный проект комплексного благоустройства жилой среды площадью более 1 Га': 'Best unbuilt comprehensive residential landscape project over 1 hectare',
    'Лучший нереализованный проект частного объекта площадью более 1 Га': 'Best unbuilt private property project over 1 hectare',
    'Язык сайта': 'Site language',
    'Русский': 'Russian',
    'Denis Daragan, в начало': 'Denis Daragan, home',
    'Основная навигация': 'Main navigation',
    'Вернуться к работам': 'Return to works',
    'Вернуться к автопортрету': 'Return to self-portrait',
    'Автор': 'Author',
    'Почерк: авторские работы': 'Signature: works by the author',
    'Предыдущий образ': 'Previous image',
    'Воспроизвести историю': 'Play story',
    'Приостановить историю': 'Pause story',
    'Следующий образ': 'Next image',
    'Картина или фрагмент': 'Painting or detail',
    'Иван Айвазовский. Девятый вал, 1850': 'Ivan Aivazovsky. The Ninth Wave, 1850',
    'Снятие с креста, 1634. Эрмитаж': 'The Descent from the Cross, 1634. Hermitage',
    'Путник у воды. Авторская работа Дениса Дарагана': 'Traveller by the Water. A work by Denis Daragan',
    'Растения и материалы': 'Plants and materials',
    'Изогнутые ветви старого дерева': 'Curved branches of an old tree',
    'Тонкие травы на ветру': 'Fine grasses in the wind',
    'Папоротники среди тёмного камня': 'Ferns among dark stone',
    'Воспроизвести последовательность': 'Play sequence',
    'Приостановить последовательность': 'Pause sequence',
    'Светлые и тёмные прожилки мрамора': 'Light and dark marble veins',
    'Пористая поверхность тёмного камня': 'The porous surface of dark stone',
    'Рельеф мокрого песка': 'The relief of wet sand',
    'Мои работы как картины': 'My works as paintings',
    'Змея в оранжерее': 'Snake in the Greenhouse',
    'Змея в оранжерее. Денис Дараган': 'Snake in the Greenhouse. Denis Daragan',
    'Ночной сад': 'Night Garden',
    'Ночной сад. Денис Дараган': 'Night Garden. Denis Daragan',
    'Сад и скульптура': 'Garden and Sculpture',
    'Сад и скульптура. Денис Дараган': 'Garden and Sculpture. Denis Daragan',
    'Авторские работы': 'Works by the author',
    'Предыдущая работа': 'Previous work',
    'Следующая работа': 'Next work',
    'Тип работ': 'Type of work',
    'Выбрать проект': 'Select a project',
    'Кадры проекта': 'Project images',
    'Предыдущий кадр': 'Previous image',
    'Следующий кадр': 'Next image',
    'Написать Денису Дарагану в Telegram': 'Contact Denis Daragan on Telegram',
    'Написать Денису Дарагану по почте': 'Email Denis Daragan',
    'Разделы': 'Sections',
    'Просмотр изображения': 'Image viewer',
    'Закрыть изображение': 'Close image',
    'Девятый вал. Фрагмент: моряки на обломке мачты': 'The Ninth Wave. Detail: sailors on the broken mast',
    '«Девятый вал» · обломок мачты, фрагмент': 'The Ninth Wave · broken mast, detail',
    'Крест': 'Cross',
    'Овен': 'Ram',
    'Змея': 'Snake',
    'Конь': 'Horse',
    'Огонь': 'Fire',
    'Уроборос. Монограмма Дениса Дарагана.': 'Ouroboros. Denis Daragan’s monogram.',
    'Эффекты': 'Effects',
    'Наклон телефона': 'Phone tilt',
    'Наклон недоступен. Изображения откликаются на касание.': 'Tilt is unavailable. Images respond to touch.',
    'Доступ к наклону закрыт. Можно управлять касанием.': 'Tilt access was denied. You can still use touch.',
    'Наклон недоступен. Можно управлять касанием.': 'Tilt is unavailable. You can still use touch.',
    'Открываю…': 'Opening…',
    'Скачивание PDF началось.': 'PDF download has started.',
    'Пароль не подошёл. Попробуйте ещё раз.': 'Incorrect password. Please try again.',
    'Откройте сайт по защищённому адресу HTTPS.': 'Open the site using a secure HTTPS address.',
    'Не удалось получить PDF. Попробуйте ещё раз.': 'Unable to retrieve the PDF. Please try again.',
    'Включить музыку': 'Play music',
    'Приостановить музыку': 'Pause music',
    'Нажмите воспроизведение. Если файл не открывается, выберите другой.': 'Press play. If the file does not open, choose another one.',
    'Не удалось воспроизвести файл. Выберите другой аудиофайл.': 'Unable to play the file. Choose another audio file.',
  };
  const fragments = {
    'Открыть проект: ': 'Open project: ',
    'Рассмотреть: ': 'View: ',
    ': изображения': ': images',
    ', кадр ': ', image ',
    ' · АЛАРОС ': ' · ALAROS ',
    ' / Денис Дараган': ' / Denis Daragan',
  };
  const pairs = Object.entries({...english, ...fragments}).sort((a, b) => b[0].length - a[0].length);
  const reverse = new Map(Object.entries(english).map(([ru, en]) => [en, ru]));
  const texts = new WeakMap();
  const attributes = new WeakMap();
  const translatedAttributes = ['aria-label', 'alt', 'title', 'placeholder', 'data-caption'];
  const attributeSelector = translatedAttributes.map(name => `[${name}]`).join(',') + ',meta[name="description"],meta[property="og:title"],meta[property="og:description"]';
  const storageKey = 'landscape-language';
  let language = 'ru';

  const preferred = () => {
    const query = new URL(location.href).searchParams.get('lang')?.toLowerCase();
    if (query === 'ru' || query === 'en') return query;
    try {return localStorage.getItem(storageKey) === 'en' ? 'en' : 'ru';} catch {return 'ru';}
  };
  const canonical = value => {
    if (reverse.has(value)) return reverse.get(value);
    const count = value.match(/^Works shown: (\d+)$/);
    if (count) return `Показано работ: ${count[1]}`;
    const page = value.match(/^(.*), (\d+) (?:of|из) (\d+)$/);
    if (page) return `${reverse.get(page[1]) || page[1]}, ${page[2]} из ${page[3]}`;
    if (/[А-Яа-яЁё]/.test(value)) return value;
    let result = value;
    for (const [ru, en] of Object.entries(fragments)) result = result.split(en).join(ru);
    for (const ru of ['Play Hub «Сад вне времени»', 'Жилой комплекс · Москва IV', 'Жилой комплекс · Москва III', 'Жилой комплекс · Москва II', 'Жилой комплекс · Москва I', 'Пространство и скульптура', 'Сад выпускников', 'Денис Дараган', 'Чайный дом', 'Ямское', 'Крым']) result = result.split(english[ru]).join(ru);
    return result;
  };
  const translate = value => {
    const core = value.trim();
    if (!core || language === 'ru') return value;
    let result = english[core];
    if (!result) {
      const count = core.match(/^Показано работ: (\d+)$/);
      const page = core.match(/^(.*), (\d+) из (\d+)$/);
      if (count) result = `Works shown: ${count[1]}`;
      else if (page) result = `${translate(page[1])}, ${page[2]} of ${page[3]}`;
      else {
        result = core;
        for (const [ru, en] of pairs) result = result.split(ru).join(en);
      }
    }
    return value.slice(0, value.indexOf(core)) + result + value.slice(value.indexOf(core) + core.length);
  };
  const updateText = node => {
    if (!node.parentElement || node.parentElement.closest('script,style,svg,.brand,.hero h1,.portfolio-intro-name') || !node.nodeValue.trim()) return;
    let entry = texts.get(node);
    if (!entry || node.nodeValue !== entry.rendered) entry = {source:canonical(node.nodeValue), rendered:node.nodeValue};
    const value = translate(entry.source);
    entry.rendered = value;
    texts.set(node, entry);
    if (node.nodeValue !== value) node.nodeValue = value;
  };
  const updateAttributes = element => {
    let entries = attributes.get(element);
    if (!entries) {entries = new Map(); attributes.set(element, entries);}
    const names = element.matches('meta[name="description"],meta[property="og:title"],meta[property="og:description"]') ? ['content'] : translatedAttributes;
    for (const name of names) {
      const current = element.getAttribute(name);
      if (!current) continue;
      let entry = entries.get(name);
      if (!entry || current !== entry.rendered) entry = {source:canonical(current), rendered:current};
      const value = translate(entry.source);
      entry.rendered = value;
      entries.set(name, entry);
      if (current !== value) element.setAttribute(name, value);
    }
  };
  const refresh = root => {
    if (root.nodeType === Node.TEXT_NODE) return updateText(root);
    if (![Node.ELEMENT_NODE, Node.DOCUMENT_NODE].includes(root.nodeType)) return;
    if (root instanceof Element) updateAttributes(root);
    root.querySelectorAll(attributeSelector).forEach(updateAttributes);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) updateText(walker.currentNode);
  };
  const setLanguage = (next, save = true) => {
    language = next === 'en' ? 'en' : 'ru';
    document.documentElement.lang = language;
    document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === language)));
    refresh(document);
    if (save) {
      try {localStorage.setItem(storageKey, language);} catch { /* Private browsing can disable storage. */ }
      const url = new URL(location.href);
      url.searchParams.set('lang', language);
      history.replaceState(history.state, '', url);
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    // Controllers have read their Russian source captions before this first pass.
    setLanguage(preferred(), false);
    document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.language)));
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') updateAttributes(record.target);
        else if (record.type === 'characterData') updateText(record.target);
        else record.addedNodes.forEach(refresh);
      }
    }).observe(document.documentElement, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:[...translatedAttributes, 'content']});
    window.addEventListener('popstate', () => setLanguage(preferred(), false));
  }, {once:true});
})();
