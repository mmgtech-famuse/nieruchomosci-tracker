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
  notes: string | null;
  archived: boolean;
  flagged: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type RatingStats = Record<number, { avg: number; count: number }>;
