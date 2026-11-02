function safeCount(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return fallback;
  return Math.floor(count);
}

export function getProfileCompletion(profile, fallbackPostCount = 0) {
  const normalizedProfile = profile || {};
  const postCount = safeCount(normalizedProfile.posts_count, safeCount(fallbackPostCount));
  const followingCount = safeCount(normalizedProfile.following_count);
  const bioLength = typeof normalizedProfile.bio === 'string'
    ? normalizedProfile.bio.trim().length
    : 0;

  const steps = [
    {
      id: 'avatar',
      title: 'Adaugă un avatar',
      description: 'Ajută oamenii să te recunoască mai ușor.',
      actionLabel: 'Alege avatarul',
      complete: Boolean(normalizedProfile.avatar_url),
    },
    {
      id: 'bio',
      title: 'Scrie o descriere',
      description: 'Spune în cel puțin 10 caractere ce te interesează.',
      actionLabel: 'Completează bio',
      complete: bioLength >= 10,
    },
    {
      id: 'post',
      title: 'Publică prima idee',
      description: 'Pornește o conversație în comunitate.',
      actionLabel: 'Creează o postare',
      complete: postCount > 0,
    },
    {
      id: 'connection',
      title: 'Urmărește primul cont',
      description: 'Personalizează fluxul cu oameni relevanți pentru tine.',
      actionLabel: 'Descoperă oameni',
      complete: followingCount > 0,
    },
  ];
  const completed = steps.filter(({ complete }) => complete).length;

  return {
    steps,
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
  };
}
