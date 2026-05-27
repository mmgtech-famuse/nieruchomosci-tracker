// Shared types used by both client and server

export interface Listing {
  id: number;
  url: string;
  wojewodztwo: string;
  powiat: string;
  gmina: string;
  miejscowosc: string;
  rozmiarDzialki: string;
  media: string;
  przeznaczenie: string;
  zabudowania: string;
  cena: string;
  latitude: string | null;
  longitude: string | null;
  createdAt: Date;
  updatedAt: Date;
}
