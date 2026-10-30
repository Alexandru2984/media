import PublicInformationPage from '../components/PublicInformationPage';

const sections = [
  {
    id: 'date-colectate',
    title: 'Ce date prelucrează Media',
    paragraphs: ['Media păstrează numai datele necesare contului, funcțiilor sociale, siguranței și operării serviciului. Parolele nu sunt stocate în clar, iar tokenurile de sesiune și de recuperare sunt păstrate numai sub formă de hash.'],
    items: [
      'Date de cont și profil: adresă de email, nume de utilizator, biografie, avatar și preferințe.',
      'Conținut și relații: postări, imagini, comentarii, aprecieri, urmăritori, mesaje și elemente salvate.',
      'Siguranță: sesiuni, evenimente de securitate, blocări, silențieri, raportări și audit de moderare.',
      'Date tehnice limitate: identificator de cerere, metodă, cale, stare și durată; corpurile, parolele și query string-urile nu intră în jurnalul aplicației.',
    ],
  },
  {
    id: 'scopuri',
    title: 'De ce sunt folosite datele',
    paragraphs: ['Datele sunt folosite pentru a crea și proteja contul, a afișa conținutul publicului ales, a livra conversații și notificări, a preveni abuzul, a investiga incidente și a îndeplini obligații legale aplicabile. Nu vindem profiluri publicitare și nu construim în aplicație un istoric de navigare între site-uri.'],
  },
  {
    id: 'vizibilitate',
    title: 'Cine poate vedea conținutul',
    paragraphs: ['Identitatea de bază a profilului rămâne descoperibilă, însă un cont privat limitează postările, imaginile, comentariile și listele sociale la proprietar și urmăritorii acceptați. Blocarea se aplică pe suprafețele autentificate, iar raportările și controalele de siguranță sunt private. Mesajele nu sunt pagini publice.'],
  },
  {
    id: 'furnizori',
    title: 'Infrastructură și furnizori',
    paragraphs: ['Traficul public trece prin Cloudflare Tunnel și Nginx către aplicația găzduită pe un VPS. Datele aplicației sunt stocate în MariaDB, iar Brevo este configurat pentru emailurile de verificare și recuperare. În prezent, autentificarea SMTP Brevo este defectă, astfel încât acele mesaje nu sunt livrate; eroarea nu schimbă controalele contului din aplicație.'],
  },
  {
    id: 'retentie',
    title: 'Păstrare și ștergere',
    paragraphs: ['Notificările sunt limitate la 500 de înregistrări per destinatar, iar activitatea de securitate afișată utilizatorului are o fereastră limitată. Ștergerea contului elimină în cascadă datele operaționale și programează eliminarea fișierelor administrate. Unele referințe de audit ale rolurilor de moderare pot rămâne pentru responsabilitate. Politica completă pentru backupuri, termene juridice și legal hold este încă în curs de formalizare și nu este prezentată aici ca fiind finalizată.'],
  },
  {
    id: 'controale',
    title: 'Controalele tale',
    paragraphs: ['Din setările profilului poți administra sesiunile, parola, emailul, vizibilitatea contului și preferințele de notificare. Poți descărca o copie JSON protejată prin parolă și poți șterge permanent contul prin confirmare dublă. Centrul de siguranță oferă acces la raportări, silențieri și postări ascunse. Nu publica date personale în issue-uri GitHub publice.'],
  },
];

export default function Privacy() {
  return (
    <PublicInformationPage
      metaTitle="Confidențialitate și date personale — Media"
      description="Află ce date prelucrează Media, cum sunt protejate și ce controale ai pentru vizibilitate, export și ștergere."
      canonicalPath="/confidentialitate"
      eyebrow="Confidențialitate"
      title="Datele tale trebuie să rămână explicabile și controlabile."
      introduction="Această pagină descrie practicile tehnice observabile ale platformei și limitele care mai trebuie formalizate. Preferăm precizia în locul promisiunilor vagi."
      updatedAt="30 octombrie 2026"
      sections={sections}
      notice={{ title: 'Transparență operațională', copy: 'Emailurile de verificare și recuperare nu sunt livrate momentan din cauza unei erori de autentificare SMTP Brevo. Sesiunile existente și controalele locale de securitate continuă să funcționeze.' }}
      callout={{
        eyebrow: 'Control direct',
        title: 'Verifică setările înainte să publici.',
        copy: 'Alege vizibilitatea potrivită, revizuiește sesiunile active și folosește exportul înaintea unei ștergeri definitive.',
        actions: [
          { href: '/login', label: 'Deschide contul', primary: true },
          { href: '/ajutor', label: 'Vezi ajutorul' },
        ],
      }}
    />
  );
}
