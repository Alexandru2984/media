import { profilePath } from './urls.js';

export function normalizeCommandSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('ro-RO')
    .trim();
}

export function isEditableTarget(target) {
  const tagName = String(target?.tagName || '').toLowerCase();
  return Boolean(target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName));
}

export function buildCommandPaletteCommands({ authenticated = false, userId = '', role = '' } = {}) {
  const commands = [
    {
      id: 'home',
      title: 'Acasă',
      description: authenticated ? 'Deschide fluxul comunității' : 'Revino la pagina principală',
      group: 'Navigare',
      icon: 'home',
      path: '/',
      keywords: ['start', 'feed', 'flux', 'principal'],
    },
  ];

  if (authenticated) {
    commands.push(
      {
        id: 'search',
        title: 'Caută',
        description: 'Găsește persoane și postări',
        group: 'Navigare',
        icon: 'search',
        path: '/search',
        keywords: ['gaseste', 'oameni', 'persoane', 'postari'],
      },
      {
        id: 'compose',
        title: 'Creează o postare',
        description: 'Deschide editorul din flux',
        group: 'Acțiuni',
        icon: 'compose',
        action: 'compose',
        keywords: ['publica', 'scrie', 'postare', 'nou'],
      },
      {
        id: 'notifications',
        title: 'Notificări',
        description: 'Vezi activitatea recentă',
        group: 'Cont',
        icon: 'notifications',
        path: '/notificari',
        keywords: ['alerte', 'activitate', 'noutati'],
      },
      {
        id: 'saved',
        title: 'Postări salvate',
        description: 'Revino la conținutul păstrat',
        group: 'Cont',
        icon: 'saved',
        path: '/salvate',
        keywords: ['favorite', 'bookmark', 'colectie'],
      },
      {
        id: 'profile',
        title: 'Profilul meu',
        description: 'Vezi profilul și setările contului',
        group: 'Cont',
        icon: 'profile',
        path: profilePath(userId),
        keywords: ['cont', 'setari', 'securitate', 'avatar'],
      },
      {
        id: 'follow-requests',
        title: 'Cereri de urmărire',
        description: 'Gestionează cererile primite',
        group: 'Cont',
        icon: 'connections',
        path: '/cereri',
        keywords: ['prieteni', 'urmaritori', 'conexiuni'],
      },
      {
        id: 'safety',
        title: 'Centrul de siguranță',
        description: 'Raportări, conturi blocate și conținut ascuns',
        group: 'Siguranță',
        icon: 'safety',
        path: '/siguranta',
        keywords: ['raportari', 'blocare', 'mute', 'ascuns'],
      },
    );

    if (['moderator', 'admin'].includes(role)) {
      commands.push({
        id: 'moderation',
        title: 'Moderare',
        description: 'Deschide coada de moderare',
        group: 'Administrare',
        icon: 'moderation',
        path: '/moderare',
        keywords: ['rapoarte', 'roluri', 'audit', 'admin'],
      });
    }
  } else {
    commands.push(
      {
        id: 'login',
        title: 'Conectare',
        description: 'Intră în contul tău',
        group: 'Cont',
        icon: 'login',
        path: '/login',
        keywords: ['autentificare', 'cont', 'login'],
      },
      {
        id: 'register',
        title: 'Creează un cont',
        description: 'Alătură-te comunității Media',
        group: 'Cont',
        icon: 'profile',
        path: '/register',
        keywords: ['inregistrare', 'cont nou', 'register'],
      },
    );
  }

  commands.push(
    {
      id: 'theme',
      title: 'Schimbă tema',
      description: 'Comută între tema luminoasă și cea întunecată',
      group: 'Preferințe',
      icon: 'theme',
      action: 'toggle-theme',
      keywords: ['dark', 'light', 'luminoasa', 'intunecata', 'aspect'],
    },
    {
      id: 'help',
      title: 'Ajutor',
      description: 'Răspunsuri și pași de rezolvare',
      group: 'Informații',
      icon: 'help',
      path: '/ajutor',
      keywords: ['suport', 'intrebari', 'probleme'],
    },
    {
      id: 'about',
      title: 'Despre Media',
      description: 'Află principiile platformei',
      group: 'Informații',
      icon: 'about',
      path: '/despre',
      keywords: ['platforma', 'misiune', 'principii'],
    },
    {
      id: 'guidelines',
      title: 'Regulile comunității',
      description: 'Consultă regulile de participare',
      group: 'Informații',
      icon: 'guidelines',
      path: '/reguli',
      keywords: ['comunitate', 'politici', 'continut'],
    },
  );

  return commands;
}

export function filterCommandPaletteCommands(commands, query) {
  const normalizedQuery = normalizeCommandSearch(query);
  if (!normalizedQuery) return commands;

  return commands
    .map((command, index) => {
      const title = normalizeCommandSearch(command.title);
      const searchable = normalizeCommandSearch([
        command.title,
        command.description,
        command.group,
        ...(command.keywords || []),
      ].join(' '));

      let score = Number.POSITIVE_INFINITY;
      if (title === normalizedQuery) score = 0;
      else if (title.startsWith(normalizedQuery)) score = 1;
      else if (title.split(' ').some((word) => word.startsWith(normalizedQuery))) score = 2;
      else if (searchable.includes(normalizedQuery)) score = 3;

      return { command, index, score };
    })
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ command }) => command);
}
