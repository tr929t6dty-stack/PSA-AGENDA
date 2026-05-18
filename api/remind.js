// Vercel Cron — Reminder programări PSA Agenda
// Rulează zilnic la 06:00 UTC (08:00 ora României)
// Trimite email dacă există programări în 1, 2 sau 3 zile

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const SB_URL    = process.env.SUPABASE_URL;
  const SB_KEY    = process.env.SUPABASE_ANON_KEY;
  const EJS_SVC   = process.env.EMAILJS_SERVICE_ID  || 'service_tv43dbg';
  const EJS_TPL   = process.env.EMAILJS_TEMPLATE_ID || 'template_aean98y';
  const EJS_KEY   = process.env.EMAILJS_PUBLIC_KEY  || '7fJGpccqCowAh_5eM';
  const TO_EMAIL  = process.env.REMINDER_EMAIL       || 'office@popescusiasociatii.ro';

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Lipsesc variabilele SUPABASE_URL / SUPABASE_ANON_KEY în Vercel.' });
  }

  // Calculează datele țintă în fusul orar România
  function romaniaDate(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' }); // YYYY-MM-DD
  }

  const targets = [1, 2, 3].map(romaniaDate);

  // Fetch programări din Supabase
  const apptRes = await fetch(`${SB_URL}/rest/v1/psa_appointments?select=*`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  if (!apptRes.ok) return res.status(500).json({ error: 'Supabase error', status: apptRes.status });
  const apptRows = await apptRes.json();
  if (!Array.isArray(apptRows)) return res.status(500).json({ error: 'Răspuns invalid Supabase', detail: apptRows });

  // Filtrează programările pentru datele țintă
  const upcoming = apptRows
    .map(row => row.data)
    .filter(a => a && targets.includes(a.date) && a.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  if (upcoming.length === 0) {
    return res.status(200).json({ message: 'Nicio programare în 1-3 zile. Email nesolicitat.' });
  }

  // Fetch clienți
  const clRes = await fetch(`${SB_URL}/rest/v1/psa_clients?select=*`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  const clRows = await clRes.json();
  const clientMap = {};
  if (Array.isArray(clRows)) clRows.forEach(row => { if (row.data) clientMap[row.id] = row.data; });

  const TMAP = {
    civil: 'Drept Civil', recovery: 'Recuperare Creanțe',
    business: 'Consultanță Business', funds: 'Fonduri UE', other: 'Altele'
  };

  const daysLabel = {
    [targets[0]]: 'Mâine',
    [targets[1]]: 'Poimâine',
    [targets[2]]: 'În 3 zile'
  };

  // Construiește tabelul HTML pentru email
  let listaHTML = '<table style="border-collapse:collapse;width:100%;font-family:\'Times New Roman\',Times,serif;">';
  let currentDate = '';
  upcoming.forEach((a, i) => {
    const client = clientMap[a.clientId];
    const name = client ? client.name : (a.notes ? a.notes.substring(0, 50) : 'Programare');
    const bg = i % 2 === 0 ? '#f9f9f9' : '#ffffff';

    if (a.date !== currentDate) {
      currentDate = a.date;
      const dt = new Date(a.date + 'T00:00:00');
      const dateStr = dt.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Bucharest' });
      const label = daysLabel[a.date] || dateStr;
      listaHTML += `<tr><td colspan="4" style="padding:12px 14px;background:#1a2d5a;color:#fff;font-weight:bold;font-size:14px;">📅 ${label} — ${dateStr}</td></tr>`;
    }
    listaHTML += `<tr style="background:${bg};">
      <td style="padding:10px 12px;font-weight:bold;color:#8b6914;width:65px;">${a.time}</td>
      <td style="padding:10px 12px;font-family:'Times New Roman',Times,serif;">${name}</td>
      <td style="padding:10px 12px;color:#555;font-size:13px;">${TMAP[a.type] || a.type || ''}</td>
      <td style="padding:10px 12px;color:#777;font-size:13px;">${a.duration || 60} min</td>
    </tr>`;
  });
  listaHTML += '</table>';

  const todayFmt = new Date().toLocaleDateString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // Trimite email via EmailJS REST API
  const ejsRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'origin': 'https://psa-agenda-p3ew.vercel.app'
    },
    body: JSON.stringify({
      service_id: EJS_SVC,
      template_id: EJS_TPL,
      user_id: EJS_KEY,
      template_params: {
        email_destinatar: TO_EMAIL,
        data: `⚠️ Reminder — ${upcoming.length} programări în 1-3 zile (${todayFmt})`,
        lista_programari: listaHTML
      }
    })
  });

  const ejsText = await ejsRes.text();
  if (!ejsRes.ok) {
    return res.status(500).json({ error: 'EmailJS error', detail: ejsText });
  }

  return res.status(200).json({
    message: `✅ Email trimis: ${upcoming.length} programări în ${targets.join(', ')}`,
    count: upcoming.length
  });
}
