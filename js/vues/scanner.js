// Scanner une carte : photo -> lecture -> fiche pré-remplie.

import { profil, enregistrerProfil } from '../donnees.js';
import { $, esc, icone, toast } from '../ui.js';
import { chargerImage, lireTexte, analyserTexte, lireCarteIA, redimensionner, canvasEnBlob } from '../ocr.js';
import { definirBrouillon } from './fiche.js';

export function afficher(vue, params, { aller }) {
  const moi = profil();
  vue.innerHTML = `
    <div class="pile" style="max-width:640px;margin:0 auto">
      <label class="champ"><span>Salon en cours</span>
        <input id="salon" value="${esc(moi.salon_en_cours || '')}" placeholder="Salon de l'emploi Paris 2026" autocomplete="off"></label>

      <div id="choix" class="pile">
        <label class="btn primaire geant">${icone('photo')} Photographier une carte
          <input type="file" accept="image/*" capture="environment" id="photo" class="sr"></label>
        <label class="btn geant">${icone('image')} Choisir une image
          <input type="file" accept="image/*" id="image" class="sr"></label>
        <button class="btn geant" id="manuel">${icone('crayon')} Saisir sans carte</button>
        <div class="depot" id="depot">Sur ordinateur : glissez ici la photo d'une carte de visite</div>
        <p class="tres-discret">Conseil : posez la carte à plat sur un fond uni, bien éclairée, et cadrez-la en entier.
          ${moi.ia_cle ? 'Lecture par IA activée.' : 'Lecture automatique gratuite.'}</p>
      </div>

      <div id="lecture" class="carte pile" hidden>
        <img id="apercu" class="apercu-carte" alt="Carte de visite">
        <p id="etape" class="discret">Lecture de la carte…</p>
        <div class="progression"><div id="barre"></div></div>
      </div>
    </div>`;

  $('#salon', vue).addEventListener('change', (e) => {
    enregistrerProfil({ salon_en_cours: e.target.value.trim() });
    toast('Salon enregistré', 'ok');
  });

  const traiter = async (fichier) => {
    if (!fichier || !fichier.type.startsWith('image/')) return toast('Choisissez une photo', 'erreur');
    $('#choix', vue).hidden = true;
    $('#lecture', vue).hidden = false;
    $('#apercu', vue).src = URL.createObjectURL(fichier);
    const progression = (v, texte) => {
      $('#barre', vue).style.width = `${Math.round(v * 100)}%`;
      if (texte) $('#etape', vue).textContent = texte;
    };
    try {
      const image = await chargerImage(fichier);
      const photoBlob = await canvasEnBlob(redimensionner(image, 1400));
      let champs = {};
      let ocr_texte = '';
      if (moi.ia_cle && navigator.onLine) {
        progression(0.4, "Lecture de la carte par l'IA…");
        try {
          champs = await lireCarteIA(image, moi.ia_cle);
        } catch (e) {
          console.warn('IA', e);
          toast('IA indisponible, lecture classique', 'erreur');
        }
      }
      if (!Object.keys(champs).length) {
        ocr_texte = await lireTexte(image, progression);
        champs = analyserTexte(ocr_texte);
      }
      progression(1, 'Terminé');
      definirBrouillon({ champs, photoBlob, ocr_texte });
      aller('nouveau');
    } catch (e) {
      console.error(e);
      toast(navigator.onLine ? 'Lecture impossible, saisissez la fiche' : 'Pas de réseau : saisissez la fiche, la photo est gardée', 'erreur');
      const image = await chargerImage(fichier).catch(() => null);
      const photoBlob = image ? await canvasEnBlob(redimensionner(image, 1400)) : null;
      definirBrouillon({ champs: {}, photoBlob });
      aller('nouveau');
    }
  };

  $('#photo', vue).addEventListener('change', (e) => traiter(e.target.files[0]));
  $('#image', vue).addEventListener('change', (e) => traiter(e.target.files[0]));
  $('#manuel', vue).addEventListener('click', () => {
    definirBrouillon({ champs: {} });
    aller('nouveau');
  });

  const depot = $('#depot', vue);
  depot.addEventListener('dragover', (e) => {
    e.preventDefault();
    depot.classList.add('survol');
  });
  depot.addEventListener('dragleave', () => depot.classList.remove('survol'));
  depot.addEventListener('drop', (e) => {
    e.preventDefault();
    depot.classList.remove('survol');
    traiter(e.dataTransfer.files[0]);
  });
}
