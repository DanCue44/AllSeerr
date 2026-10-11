interface TadbArtist {
  strArtistThumb: string | null;
  strArtistFanart: string | null;
  // English biography; other languages are strBiographyDE, strBiographyFR...
  strBiography?: string | null;
  [biography: `strBiography${string}`]: string | null | undefined;
}

export interface TadbArtistResponse {
  artists?: TadbArtist[];
}
