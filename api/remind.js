export default async function handler(req, res) {
  const FIREBASE_KEY = 'AIzaSyBctM2iT1ZQNdULg_xkApLgovOyiDE61uw';
  const EMAILJS_SERVICE  = 'service_tv43dbg';
  const EMAILJS_TEMPLATE = 'template_aean98y';
  const EMAILJS_KEY      = '7fJGpccqCowAh_5eM';
  const REMINDER_EMAIL   = 'office@popescusiasociatii.ro';

  const TMAP = {civil:'Drept Civil',recovery:'Recuperare Creanțe',business:'Consultanță Business',funds:'Fonduri UE',other:'Altele'};
  const ZILE = ['duminică','luni','marți','miercuri','joi','vineri','sâmbătă'];
  const LUNI = ['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie'];

  // Data azi in Romania
  const roNow = new Date(new Date().toLocaleString('en-US', {timeZone: 'Europe/Bucharest'}));
  const pad = n => String(n).padStart(2,'0');
  const todayStr = `${roNow.getFullYear()}-${pad(roNow.getMonth()+1)}-${pad(roNow.getDate())}`;
  const todayFmt = `${ZILE[roNow.getDay()]}, ${roNow.getDate()} ${LUNI[roNow.getMonth()]} ${roNow.getFullYear()}`;

  // Citeste Firestore
  const fsUrl = `https://firestore.googleapis.com/v1/projects/psa-agenda/databases/(default)/documents/firms/PSA?key=${FIREBASE_KEY}`;
  const fsRes = await fetch(fsUrl);
  const doc = await fsRes.json();
  const fields = doc.fields || {};

  const appointments = JSON.parse(fields.psa_appts?.stringValue || '[]');
  const clients      = JSON.parse(fields.psa_clients?.stringValue || '[]');
  const clientsMap   = Object.fromEntries(clients.map(c => [c.id, c]));

  const todayAppts = appointments
    .filter(a => a.date === todayStr && a.status !== 'cancelled')
    .sort((a, b) => a.time.localeCompare(b.time));

  if (!todayAppts.length) {
    return res.status(200).json({ok: true, message: 'Nicio programare azi'});
  }

  // Construieste tabel HTML
  let html = '<table style="border-collapse:collapse;width:100%;font-family:Times New Roman,serif;">';
  todayAppts.forEach((a, i) => {
    const c = clientsMap[a.clientId] || {};
    const name = a.clientId !== 'own' ? (c.name || '?') : (a.notes || 'Blocat');
    const tip  = TMAP[a.type] || a.type || '';
    const bg   = i % 2 === 0 ? '#f9f9f9' : '#ffffff';
    html += `<tr style="background:${bg};"><td style="padding:10px 12px;font-weight:bold;color:#8b6914;width:60px;">${a.time}</td><td style="padding:10px 12px;">${name}</td><td style="padding:10px 12px;color:#555;font-size:13px;">${tip}</td><td style="padding:10px 12px;color:#777;font-size:13px;">${a.duration||60} min</td></tr>`;
  });
  html += '</table>';

  // Trimite EmailJS
  const ejRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'origin': 'https://psa-agenda-p3ew.vercel.app'},
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE,
      template_id: EMAILJS_TEMPLATE,
      user_id: EMAILJS_KEY,
      template_params: {email_destinatar: REMINDER_EMAIL, data: todayFmt, lista_programari: html}
    })
  });

  if (!ejRes.ok) {
    const err = await ejRes.text();
    return res.status(500).json({error: err});
  }

  return res.status(200).json({ok: true, sent: todayAppts.length, date: todayFmt});
}
