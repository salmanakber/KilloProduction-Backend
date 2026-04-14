export interface DoctorData {
  name: string;
  designation: string;
  mobile: string;
  signatureText?: string;
}

export interface ClinicData {
  logoText?: string;
  name?: string;
}

export interface PatientData {
  id: string;
  name: string;
  gender: 'M' | 'F' | string;
  address: string;
  phone: string;
  age: string | number;
  temp?: string;   // optional — shown only if provided
  bp?: string;     // optional — shown only if provided
  adv?: string;
  allergies?: string;
}

export interface PrescriptionDetails {
  date: string;
  time: string;
  diagnosis?: string;
  diagnosisFull?: string;
  followUpDays?: string | number;
  adviceGiven?: string[];
}

export interface MedicineData {
  type: string;
  name: string;
  dosageTiming: string;
  instructions: string;
  durationDays: string | number;
  totalQuantity: string | number;
  quantityType: string;
}

export interface AdvancedPrescriptionData {
  doctor: DoctorData;
  clinic: ClinicData;
  patient: PatientData;
  details: PrescriptionDetails;
  medicines: MedicineData[];
}

export function generatePrescriptionHTML(data: AdvancedPrescriptionData): string {
  const { doctor, clinic, patient, details, medicines } = data;

  // ── Medicine rows
  const scheduleRows = medicines
    .map(
      (m, index) => `
        <tr>
          <td class="col-med">
            <div class="med-cell">
              <div class="med-num">${index + 1}</div>
              <div>
                <div class="med-type-badge">${m.type}</div>
                <div class="med-name">${m.name}</div>
              </div>
            </div>
          </td>
          <td class="col-dosage">
            <div class="dosage-timing">${m.dosageTiming}</div>
            <div class="dosage-instruction">${m.instructions}</div>
          </td>
          <td class="col-duration">
            <div class="duration-chip">${m.durationDays} Days</div>
            <div class="duration-qty">Total: ${m.totalQuantity} ${m.quantityType}</div>
          </td>
        </tr>
      `
    )
    .join('');

  // ── Advice list
  const adviceList = details.adviceGiven
    ? details.adviceGiven
        .map(a => `<div class="advice-item">${a}</div>`)
        .join('')
    : '';

  // ── Optional vitals in stats bar
  const tempStat = patient.temp
    ? `<div class="stat-pill">
         <div class="stat-dot" style="background:#e07b54;"></div>
         <span class="stat-label">Temp</span>
         <span class="stat-value">${patient.temp}</span>
       </div>`
    : '';

  const bpStat = patient.bp
    ? `<div class="stat-pill">
         <div class="stat-dot" style="background:#5488e0;"></div>
         <span class="stat-label">BP</span>
         <span class="stat-value">${patient.bp} mmHg</span>
       </div>`
    : '';

  // ── Optional allergies stat
  const allergiesStat = patient.allergies
    ? `<div class="stat-pill">
         <div class="stat-dot"></div>
         <span class="stat-label">Allergies</span>
         <span class="stat-value">${patient.allergies}</span>
       </div>`
    : '';

  // ── Optional diagnosis sidebar card
  const diagnosisCard =
    details.diagnosis
      ? `<div class="sidebar-card">
           <div class="sidebar-card-label">Diagnosis</div>
           <div class="sidebar-card-value" style="font-size:14px;font-family:'DM Sans',sans-serif;font-weight:600;color:var(--sg1);">${details.diagnosis}</div>
           ${details.diagnosisFull ? `<div class="sidebar-card-sub">${details.diagnosisFull}</div>` : ''}
         </div>`
      : '';

  // ── Optional follow-up sidebar card
  const followUpCard =
    details.followUpDays
      ? `<div class="sidebar-card">
           <div class="sidebar-card-label">Follow-up</div>
           <div class="sidebar-card-value" style="font-size:15px;">${details.followUpDays} Days</div>
           <div class="sidebar-card-sub">Return if no improvement</div>
         </div>`
      : '';

  // ── Optional physician note sidebar card
  const physicianNoteCard =
    patient.adv
      ? `<div class="sidebar-card sidebar-adv">
           <div class="sidebar-card-label">Physician Note</div>
           <div class="sidebar-card-sub">${patient.adv}</div>
         </div>`
      : '';

  const genderLabel =
    patient.gender === 'M' ? 'Male' :
    patient.gender === 'F' ? 'Female' :
    patient.gender;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        --sg1: #0a7c6e;
        --sg2: #12a98e;
        --sg3: #1dd9b0;
        --sg4: #a8f0e0;
        --sg5: #e4faf5;
        --accent-gold: #c9a84c;
        --text-dark: #0d2b27;
        --text-mid: #2e6b5e;
        --text-light: #6aad99;
        --white: #ffffff;
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        font-family: 'DM Sans', sans-serif;
        background: linear-gradient(135deg, #0a7c6e 0%, #12a98e 40%, #1dd9b0 100%);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 30px 20px;
      }

      .page {
        width: 820px;
        background: var(--white);
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 40px 80px rgba(10,124,110,0.35), 0 0 0 1px rgba(255,255,255,0.3);
        position: relative;
      }

      /* ─── HEADER ─── */
      .header {
        background: linear-gradient(135deg, var(--sg1) 0%, var(--sg2) 60%, var(--sg3) 100%);
        padding: 36px 44px 0;
        position: relative;
        overflow: hidden;
      }
      .header::before {
        content: '';
        position: absolute;
        top: -60px; right: -60px;
        width: 220px; height: 220px;
        border-radius: 50%;
        background: rgba(255,255,255,0.07);
      }
      .header::after {
        content: '';
        position: absolute;
        bottom: -40px; left: 30%;
        width: 160px; height: 160px;
        border-radius: 50%;
        background: rgba(255,255,255,0.05);
      }
      .header-grid {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        position: relative;
        z-index: 1;
        padding-bottom: 28px;
      }

      .doc-name {
        font-family: 'Playfair Display', serif;
        font-size: 26px;
        font-weight: 700;
        color: var(--white);
        letter-spacing: 0.5px;
        line-height: 1.1;
        margin-bottom: 6px;
      }
      .doc-tag {
        display: inline-block;
        background: rgba(255,255,255,0.18);
        border: 1px solid rgba(255,255,255,0.3);
        color: rgba(255,255,255,0.95);
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        padding: 3px 10px;
        border-radius: 20px;
        margin-bottom: 8px;
      }
      .doc-contact {
        color: rgba(255,255,255,0.8);
        font-size: 13px;
        margin-top: 4px;
      }
      .doc-contact span { margin-right: 14px; }

      .clinic-center {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      .clinic-emblem {
        width: 72px; height: 72px;
        background: rgba(255,255,255,0.15);
        border: 2px solid rgba(255,255,255,0.4);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
      }
      .clinic-emblem-text {
        font-family: 'Playfair Display', serif;
        font-size: 22px;
        font-weight: 700;
        color: white;
        letter-spacing: 1px;
      }
      .clinic-name {
        color: rgba(255,255,255,0.9);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 2px;
        text-transform: uppercase;
      }

      .patient-block { text-align: right; }
      .patient-id-badge {
        display: inline-block;
        background: var(--accent-gold);
        color: white;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 1px;
        padding: 3px 12px;
        border-radius: 20px;
        margin-bottom: 8px;
        text-transform: uppercase;
      }
      .patient-name {
        font-family: 'Playfair Display', serif;
        font-size: 20px;
        font-weight: 600;
        color: white;
        margin-bottom: 6px;
      }
      .patient-detail {
        color: rgba(255,255,255,0.8);
        font-size: 12.5px;
        margin-bottom: 3px;
        line-height: 1.5;
      }

      /* ─── AI BRANDING STRIP ─── */
      .timing-strip {
        background: rgba(255,255,255,0.12);
        backdrop-filter: blur(4px);
        border-top: 1px solid rgba(255,255,255,0.2);
        padding: 9px 44px;
        display: flex;
        gap: 24px;
        position: relative;
        z-index: 1;
        align-items: center;
      }
      .timing-item {
        font-size: 11.5px;
        color: rgba(255,255,255,0.85);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .timing-item strong { color: white; font-weight: 600; }
      .timing-divider {
        width: 1px;
        height: 16px;
        background: rgba(255,255,255,0.3);
      }

      /* ─── STATS BAR ─── */
      .stats-bar {
        background: var(--sg5);
        border-bottom: 1px solid var(--sg4);
        padding: 12px 44px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .stats-group { display: flex; gap: 28px; flex-wrap: wrap; }
      .stat-pill { display: flex; align-items: center; gap: 7px; }
      .stat-dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: var(--sg2);
        flex-shrink: 0;
      }
      .stat-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-light);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .stat-value {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-dark);
        margin-left: 2px;
      }
      .date-stamp {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-mid);
        background: var(--sg4);
        padding: 4px 14px;
        border-radius: 20px;
        white-space: nowrap;
      }

      /* ─── BODY ─── */
      .body-wrap { display: flex; min-height: 380px; }

      .sidebar {
        width: 190px;
        flex-shrink: 0;
        background: linear-gradient(180deg, var(--sg5) 0%, #d6f5ee 100%);
        border-right: 1px solid var(--sg4);
        padding: 32px 24px;
        display: flex;
        flex-direction: column;
        gap: 22px;
      }
      .sidebar-card {
        background: white;
        border-radius: 12px;
        padding: 14px 16px;
        box-shadow: 0 2px 12px rgba(10,124,110,0.1);
        border: 1px solid var(--sg4);
      }
      .sidebar-card-label {
        font-size: 10px;
        font-weight: 700;
        color: var(--text-light);
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 4px;
      }
      .sidebar-card-value {
        font-size: 18px;
        font-weight: 600;
        color: var(--text-dark);
      }
      .sidebar-card-sub {
        font-size: 11px;
        color: var(--text-mid);
        margin-top: 2px;
      }
      .sidebar-adv {
        background: linear-gradient(135deg, var(--sg1), var(--sg2));
        border-radius: 12px;
        padding: 14px 16px;
        border: none;
      }
      .sidebar-adv .sidebar-card-label { color: rgba(255,255,255,0.7); }
      .sidebar-adv .sidebar-card-sub { color: rgba(255,255,255,0.9); font-size: 12px; line-height: 1.5; }

      .main-content { flex: 1; padding: 32px 36px; }

      .section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
      .section-header-line { flex: 1; height: 2px; background: linear-gradient(90deg, var(--sg3), transparent); }
      .section-title {
        font-family: 'Playfair Display', serif;
        font-size: 15px;
        font-weight: 600;
        color: var(--sg1);
        letter-spacing: 0.5px;
        white-space: nowrap;
      }

      table { width: 100%; border-collapse: collapse; }
      thead tr { border-bottom: 2px solid var(--sg3); }
      th {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: var(--text-light);
        padding: 0 0 10px;
        text-align: left;
      }
      th:last-child { text-align: right; }
      tbody tr { border-bottom: 1px solid var(--sg5); }
      td { padding: 14px 0; vertical-align: top; }

      .col-med { width: 42%; }
      .col-dosage { width: 35%; }
      .col-duration { width: 23%; text-align: right; }

      .med-cell { display: flex; align-items: flex-start; gap: 10px; }
      .med-num {
        width: 22px; height: 22px;
        background: linear-gradient(135deg, var(--sg1), var(--sg2));
        color: white;
        font-size: 11px;
        font-weight: 700;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .med-type-badge {
        display: inline-block;
        background: var(--sg5);
        border: 1px solid var(--sg4);
        color: var(--sg1);
        font-size: 10px;
        font-weight: 700;
        padding: 1px 7px;
        border-radius: 10px;
        margin-bottom: 3px;
        text-transform: uppercase;
      }
      .med-name { font-size: 14px; font-weight: 600; color: var(--text-dark); margin-top: 1px; }
      .dosage-timing { font-size: 13px; font-weight: 500; color: var(--text-dark); }
      .dosage-instruction { font-size: 11.5px; color: var(--text-light); margin-top: 3px; line-height: 1.4; }
      .duration-chip {
        display: inline-block;
        background: linear-gradient(135deg, var(--sg1), var(--sg2));
        color: white;
        font-size: 12px;
        font-weight: 600;
        padding: 3px 12px;
        border-radius: 20px;
        white-space: nowrap;
      }
      .duration-qty { font-size: 11px; color: var(--text-light); margin-top: 4px; text-align: right; }

      /* ─── FOOTER ─── */
      .footer {
        border-top: 1px solid var(--sg4);
        background: var(--sg5);
        padding: 24px 44px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 20px;
      }
      .advice-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--sg1);
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .advice-title::before {
        content: '';
        display: inline-block;
        width: 16px; height: 2px;
        background: var(--sg3);
        border-radius: 2px;
      }
      .advice-item {
        font-size: 12.5px;
        color: var(--text-mid);
        margin-bottom: 3px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .advice-item::before { content: '◆'; font-size: 6px; color: var(--sg3); flex-shrink: 0; }

      .signature-block { text-align: center; flex-shrink: 0; }
      .sig-line { width: 140px; height: 1px; background: var(--sg2); margin: 0 auto 8px; }
      .sig-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        color: var(--text-light);
        margin-bottom: 6px;
      }
      .sig-name { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 700; color: var(--text-dark); }
      .sig-sub { font-size: 11px; color: var(--text-light); margin-top: 2px; }

      .bottom-band {
        height: 8px;
        background: linear-gradient(90deg, var(--sg1), var(--sg3), var(--sg2));
      }
    </style>
  </head>
  <body>
    <div class="page">

      <!-- ═══ HEADER ═══ -->
      <div class="header">
        <div class="header-grid">

          <!-- Doctor Info -->
          <div class="doc-block">
            <div class="doc-name">${doctor.name}</div>
            <div class="doc-tag">${doctor.designation}</div>
            <div class="doc-contact">
              <span> ${doctor.mobile}</span>
            </div>
          </div>

          <!-- Clinic Emblem -->
          <div class="clinic-center">
            <div class="clinic-emblem">
              <div class="clinic-emblem-text">${clinic.logoText || 'Rx'}</div>
            </div>
            <div class="clinic-name">${clinic.name || ''}</div>
          </div>

          <!-- Patient Info -->
          <div class="patient-block">
            <div class="patient-id-badge">ID: ${patient.id}</div>
            <div class="patient-name">${patient.name} (${patient.gender})</div>
            <div class="patient-detail">${patient.address}</div>
            <div class="patient-detail">&#128222; ${patient.phone}</div>
          </div>

        </div>
        
        <div class="timing-strip">
          <div class="timing-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 4v4l3 3"/><circle cx="12" cy="12" r="1"/></svg>
            <strong>${doctor.name}</strong>&nbsp;·&nbsp;Smart Diagnostics &middot; Precision Care
          </div>
          <div class="timing-divider"></div>
          <div class="timing-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Clinically Validated &nbsp;&middot;&nbsp; Round-the-Clock Availability
          </div>
          <div class="timing-divider"></div>
          <div class="timing-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            End-to-End Encrypted &nbsp;&middot;&nbsp; HIPAA-Compliant Record
          </div>
        </div>
      </div>

      <!-- ═══ STATS BAR ═══ -->
      <div class="stats-bar">
        <div class="stats-group">
          <div class="stat-pill">
            <div class="stat-dot"></div>
            <span class="stat-label">Age</span>
            <span class="stat-value">${patient.age} Years</span>
          </div>
          ${allergiesStat}
          ${tempStat}
          ${bpStat}
        </div>
        <div class="date-stamp">&#128197; ${details.date} &nbsp;&middot;&nbsp; ${details.time}</div>
      </div>

      <!-- ═══ BODY ═══ -->
      <div class="body-wrap">

        <!-- Sidebar -->
        <div class="sidebar">
          ${diagnosisCard}
          ${followUpCard}
          ${physicianNoteCard}
        </div>

        <!-- Medicine Table -->
        <div class="main-content">
          <div class="section-header">
            <div class="section-title">Prescribed Medicines</div>
            <div class="section-header-line"></div>
          </div>
          <table>
            <thead>
              <tr>
                <th class="col-med">Medicine Name</th>
                <th class="col-dosage">Dosage Schedule</th>
                <th class="col-duration">Duration</th>
              </tr>
            </thead>
            <tbody>
              ${scheduleRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- ═══ FOOTER ═══ -->
      <div class="footer">
        <div class="advice-section">
          ${adviceList.length ? `<div class="advice-title">Advice Given</div>${adviceList}` : ''}
        </div>
        <div class="signature-block">
          <div class="sig-label">Signature</div>
          <div class="sig-line"></div>
          <div class="sig-name">${doctor.signatureText || doctor.name}</div>
          <div class="sig-sub">${doctor.designation}</div>
        </div>
      </div>

      <div class="bottom-band"></div>
    </div>
  </body>
</html>`;
}
  
  /**
   * PDF GENERATION: NEXT.JS SERVERLESS APPROACH
   * Uses puppeteer-core & @sparticuz/chromium to respect Vercel/AWS 50MB limits.
   */
  import puppeteer from 'puppeteer-core';
  import chromium from '@sparticuz/chromium';
  
  // (Your AdvancedPrescriptionData interface and generatePrescriptionHTML remain exactly the same above this)
  
  export async function generatePrescriptionPdfBuffer(data: AdvancedPrescriptionData): Promise<Buffer> {
    const htmlContent = generatePrescriptionHTML(data);
  
    // 1. Determine if we are running locally or on the server (Vercel/AWS)
    const isLocal = process.env.NODE_ENV === 'development';
  
    // 2. Set the path to your local Chrome browser for local testing
    const localExecutablePath = process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : process.platform === 'linux'
      ? '/usr/bin/google-chrome'
      : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'; // Mac default
  
    // 3. Launch the browser dynamically based on the environment
    const browser = await puppeteer.launch({
      args: isLocal ? ['--no-sandbox', '--disable-setuid-sandbox'] : chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: isLocal ? localExecutablePath : await chromium.executablePath(),
      headless: chromium.headless,
    });
  
    try {
      const page = await browser.newPage();
      
      // Load the HTML
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0', // Ensures CSS/Fonts are loaded
        timeout: 15000 // 15 seconds timeout
      });
  
      // Generate the PDF Buffer
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true, // Crucial for your CSS design
        margin: {
          top: '0px',
          right: '0px',
          bottom: '0px',
          left: '0px'
        }
      });
  
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }