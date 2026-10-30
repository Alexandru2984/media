import PublicInformationPage from '../components/PublicInformationPage';

const sections = [
  {
    id: 'acceptare',
    title: 'Folosirea serviciului',
    paragraphs: ['Prin crearea și folosirea unui cont accepți aceste condiții și regulile comunității. Folosește Media numai dacă poți încheia în mod legal acest acord în jurisdicția ta și păstrează datele de autentificare în siguranță. Contul tău nu trebuie cedat pentru a evita limite sau măsuri de siguranță.'],
  },
  {
    id: 'continut',
    title: 'Conținutul tău',
    paragraphs: ['Rămâi responsabil pentru ceea ce publici și trebuie să ai dreptul de a distribui textul și imaginile încărcate. Acordezi platformei numai permisiunea tehnică necesară pentru a stoca, procesa, redimensiona, transmite și afișa conținutul conform audienței alese. Această permisiune încetează când conținutul este șters, cu excepția copiilor temporare sau a păstrării cerute de lege.'],
  },
  {
    id: 'conduita',
    title: 'Conduită și utilizare interzisă',
    paragraphs: ['Nu folosi serviciul pentru hărțuire, amenințări, impersonare, fraudă, spam, acces neautorizat, distribuirea de malware sau publicarea ilegală a datelor altora. Nu încerca să ocolești limitele tehnice, controalele de acces, blocările sau mecanismele de moderare. Regulile comunității oferă exemple mai concrete.'],
  },
  {
    id: 'moderare',
    title: 'Raportare și moderare',
    paragraphs: ['Utilizatorii pot raporta conturi, postări și comentarii. Moderatorii pot tria și documenta raportările, însă fluxul actual nu șterge automat conținut și nu suspendă automat conturi. Orice viitoare măsură de aplicare trebuie separată, autorizată și auditată. Raportările false sau abuzive pot fi limitate.'],
  },
  {
    id: 'disponibilitate',
    title: 'Disponibilitate și schimbări',
    paragraphs: ['Media este un proiect independent aflat în dezvoltare activă. Pot exista întreruperi, funcții modificate sau defecte ale furnizorilor externi. Facem eforturi rezonabile pentru securitate și continuitate, dar serviciul nu trebuie considerat un canal garantat pentru urgențe, arhivare unică sau comunicări critice. Schimbările materiale ale acestor condiții trebuie datate și explicate.'],
  },
  {
    id: 'inchidere',
    title: 'Închiderea contului',
    paragraphs: ['Îți poți exporta datele și șterge contul din setări după confirmarea parolei. Ștergerea este permanentă pentru datele operaționale, sub rezerva cozilor tehnice de eliminare, backupurilor și obligațiilor legale aplicabile. Dacă pierzi accesul la cont, fluxul de recuperare depinde de email și este afectat momentan de incidentul SMTP documentat în pagina de ajutor.'],
  },
];

export default function Terms() {
  return (
    <PublicInformationPage
      metaTitle="Termeni de utilizare — Media"
      description="Condițiile clare pentru folosirea Media, publicarea conținutului, conduită, moderare și închiderea contului."
      canonicalPath="/termeni"
      eyebrow="Termeni de utilizare"
      title="Reguli clare pentru un produs construit responsabil."
      introduction="Aceste condiții descriu relația practică dintre platformă și membrii săi. Nu extind capabilitățile de moderare dincolo de ceea ce produsul poate face astăzi."
      updatedAt="30 octombrie 2026"
      sections={sections}
      callout={{
        eyebrow: 'Standard comun',
        title: 'Citește și regulile comunității.',
        copy: 'Termenii stabilesc cadrul, iar regulile comunității explică tipurile de comportament și conținut care nu sunt acceptate.',
        actions: [
          { href: '/reguli', label: 'Regulile comunității', primary: true },
          { href: '/confidentialitate', label: 'Confidențialitate' },
        ],
      }}
    />
  );
}
