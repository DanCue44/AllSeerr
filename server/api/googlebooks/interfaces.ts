export interface GoogleBooksVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    // ISO 639-1 code, sometimes with a region such as zh-CN
    language?: string;
    // YYYY, YYYY-MM or YYYY-MM-DD, in the future for books not out yet
    publishedDate?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
  saleInfo?: {
    country?: string;
    saleability?: string;
    isEbook?: boolean;
  };
  accessInfo?: {
    epub?: { isAvailable?: boolean };
    pdf?: { isAvailable?: boolean };
  };
}

export interface GoogleBooksVolumesResponse {
  totalItems?: number;
  items?: GoogleBooksVolume[];
}

export interface GoogleBooksErrorResponse {
  error?: {
    code?: number;
    message?: string;
    errors?: { reason?: string; message?: string }[];
  };
}
