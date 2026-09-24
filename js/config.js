// Connexion au projet Supabase « prospection-salon » (organisation Intérim Qualité,
// compte Supabase ouvert avec le GitHub Interim-qualite75 — séparé de RH Project).
// La clé publique est faite pour être dans l'app : la sécurité est assurée
// par les règles de la base (chacun ne voit que ses propres fiches).
export const SUPABASE_URL = 'https://ejtrsiibmutofinwkfmi.supabase.co';
export const SUPABASE_CLE_PUBLIQUE = 'sb_publishable_XefQbk-aSuU75lyPfqn8wQ_1E0rAZJ5';

// Coordonnées proposées au premier lancement (modifiables dans Réglages).
// Ce fichier est public une fois en ligne : le portable se saisit dans Réglages
// (il est alors enregistré dans Supabase, pas ici).
export const PROFIL_PAR_DEFAUT = {
  prenom: 'Soraya',
  nom: 'PROUX',
  fonction: "Responsable d'Agence",
  societe: 'Intérim Qualité',
  slogan: 'Des hommes et des femmes de qualité',
  tel_mobile: '',
  tel_fixe: '01 58 45 26 10',
  email: 'soraya.proux@groupeip.fr',
  site: 'www.interimqualite.fr',
  adresse: '27, rue Balard',
  code_postal: '75015',
  ville: 'Paris',
};
