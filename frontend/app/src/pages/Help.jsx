import PublicInformationPage from '../components/PublicInformationPage';

const sections = [
  {
    id: 'acces',
    title: 'Conectare și acces la cont',
    paragraphs: ['Autentificarea folosește un cookie de sesiune HttpOnly, nu un token vizibil în browser. Dacă ești deja conectat, verifică sesiunile active din setările profilului și revocă dispozitivele necunoscute. Nu trimite nimănui parola, cookie-ul sau linkurile de unică folosință.'],
    items: ['Recuperarea parolei și verificarea emailului sunt momentan afectate de eroarea SMTP Brevo.', 'Dacă sesiunea ta este încă activă, schimbă parola direct din setări și verifică toate sesiunile.', 'Dacă nu mai ai nicio sesiune, nu repeta agresiv cererile de email; acestea nu rezolvă incidentul furnizorului.'],
  },
  {
    id: 'vizibilitate',
    title: 'Profil privat și relații',
    paragraphs: ['Un profil privat cere aprobarea urmăritorilor înainte de a le oferi acces la postări și media protejată. Poți anula cereri, elimina relații prin unfollow și bloca un cont. Identitatea de bază a profilului rămâne descoperibilă pentru ca oamenii să poată găsi contul corect.'],
  },
  {
    id: 'notificari',
    title: 'Notificări',
    paragraphs: ['Inboxul din aplicație funcționează independent de email. Din Setări → Notificări poți opri separat cererile de urmărire, acceptările, urmăritorii noi, aprecierile și comentariile. Preferința se aplică evenimentelor viitoare și nu rescrie istoricul existent.'],
  },
  {
    id: 'siguranta',
    title: 'Siguranță și raportare',
    paragraphs: ['Folosește blocarea când ai nevoie să întrerupi interacțiunea, silențierea când vrei doar să nu mai vezi un cont și ascunderea pentru o postare individuală. Raportările sunt private față de contul raportat și pot fi revizuite sau retrase din Centrul de siguranță cât timp sunt deschise. Pentru pericol imediat, contactează serviciile locale de urgență; Media nu este un serviciu de intervenție.'],
  },
  {
    id: 'date',
    title: 'Export și ștergere',
    paragraphs: ['Exportul produce un fișier JSON și cere parola curentă. Ștergerea contului cere parola plus fraza exactă de confirmare și nu poate fi anulată după finalizare. Descarcă exportul înainte de ștergere și păstrează-l într-un loc sigur; poate include conversații și metadate personale.'],
  },
  {
    id: 'diagnostic',
    title: 'Când ceva nu funcționează',
    paragraphs: ['Reîncarcă pagina, verifică dacă browserul acceptă cookie-uri same-site și notează identificatorul de cerere afișat de o eroare. Nu publica emailuri, parole, exporturi sau capturi cu date private într-un issue public. Starea tehnică observabilă este disponibilă prin endpointurile de sănătate, dar acestea nu dezvăluie detalii despre infrastructură.'],
  },
];

export default function Help() {
  return (
    <PublicInformationPage
      metaTitle="Ajutor și siguranța contului — Media"
      description="Ghid pentru conectare, profil privat, notificări, raportare, exportul datelor și ștergerea contului Media."
      canonicalPath="/ajutor"
      eyebrow="Centru de ajutor"
      title="Răspunsuri directe pentru contul și siguranța ta."
      introduction="Începe cu pașii de mai jos. Ei descriu comportamentul actual al produsului, inclusiv limitările cunoscute, fără să presupună că emailul funcționează."
      updatedAt="30 octombrie 2026"
      sections={sections}
      notice={{ title: 'Incident activ: email', copy: 'Brevo respinge autentificarea SMTP, iar mesajele de verificare și recuperare nu ajung momentan. Problema este operațională și necesită rotirea credentialului de către proprietarul serviciului.' }}
      callout={{
        eyebrow: 'Mai întâi, protejează contul',
        title: 'Ai încă o sesiune activă?',
        copy: 'Folosește-o pentru a schimba parola și a revoca dispozitivele pe care nu le recunoști. Evită să ieși din ultima sesiune înainte să verifici accesul.',
        actions: [
          { href: '/login', label: 'Deschide conectarea', primary: true },
          { href: '/confidentialitate', label: 'Cum folosim datele' },
        ],
      }}
    />
  );
}
