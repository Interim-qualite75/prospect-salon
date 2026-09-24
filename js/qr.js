// Génération de QR codes (bibliothèque qrcode-generator, encodage UTF-8 pour les accents).

const SRC = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
let chargement;

function chargerLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  chargement ??= new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.onload = () => ok(window.qrcode);
    s.onerror = () => ko(new Error('Impossible de charger le générateur de QR code'));
    document.head.append(s);
  });
  return chargement;
}

export async function matriceQR(texte, niveau = 'M') {
  const qrcode = await chargerLib();
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const qr = qrcode(0, niveau);
  qr.addData(texte, 'Byte');
  qr.make();
  return { n: qr.getModuleCount(), sombre: (r, c) => qr.isDark(r, c) };
}

// SVG net et net à toutes les tailles (écran plein pot en mode salon)
export async function qrSVG(texte, { niveau = 'M', marge = 4, titre = 'QR code' } = {}) {
  const { n, sombre } = await matriceQR(texte, niveau);
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!sombre(r, c)) continue;
      let long = 1;
      while (c + long < n && sombre(r, c + long)) long++;
      d += `M${c + marge} ${r + marge}h${long}v1h-${long}z`;
      c += long - 1;
    }
  }
  const t = n + marge * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges" role="img" aria-label="${titre}"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// Image PNG (pour l'imprimer sur un kakémono, une affiche, un badge…)
export async function qrPNG(texte, { taille = 1200, niveau = 'M', marge = 4 } = {}) {
  const { n, sombre } = await matriceQR(texte, niveau);
  const t = n + marge * 2;
  const echelle = Math.max(1, Math.floor(taille / t));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = t * echelle;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (sombre(r, c)) ctx.fillRect((c + marge) * echelle, (r + marge) * echelle, echelle, echelle);
    }
  }
  return new Promise((ok) => canvas.toBlob(ok, 'image/png'));
}
