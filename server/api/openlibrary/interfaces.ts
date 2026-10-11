// OpenLibrary text fields are either plain strings or typed text objects
export type OlText = string | { type?: string; value: string };

export interface OlKeyRef {
  key: string;
}

export interface OlSearchDoc {
  key: string;
  title: string;
  subtitle?: string;
  author_name?: string[];
  author_key?: string[];
  first_publish_year?: number;
  cover_i?: number;
  edition_count?: number;
  number_of_pages_median?: number;
  ratings_average?: number;
  ratings_count?: number;
  subject?: string[];
  language?: string[];
}

export interface OlSearchResponse {
  numFound: number;
  start: number;
  docs: OlSearchDoc[];
}

export interface OlAuthorSearchDoc {
  key: string;
  name: string;
  birth_date?: string;
  death_date?: string;
  top_work?: string;
  work_count?: number;
  top_subjects?: string[];
}

export interface OlAuthorSearchResponse {
  numFound: number;
  start: number;
  docs: OlAuthorSearchDoc[];
}

export interface OlRedirect {
  key: string;
  type: OlKeyRef;
  location?: string;
}

export interface OlWork {
  key: string;
  title: string;
  subtitle?: string;
  type: OlKeyRef;
  location?: string;
  description?: OlText;
  authors?: { author: OlKeyRef; type?: OlKeyRef }[];
  covers?: number[];
  subjects?: string[];
  subject_places?: string[];
  subject_people?: string[];
  subject_times?: string[];
  first_publish_date?: string;
  links?: { title: string; url: string }[];
}

export interface OlAuthor {
  key: string;
  name: string;
  type: OlKeyRef;
  location?: string;
  personal_name?: string;
  bio?: OlText;
  birth_date?: string;
  death_date?: string;
  photos?: number[];
  links?: { title: string; url: string }[];
  wikipedia?: string;
}

// Trending lists return search documents
export interface OlTrendingResponse {
  query: string;
  works: OlSearchDoc[];
}

export interface OlSubjectWork {
  key: string;
  title: string;
  edition_count?: number;
  cover_id?: number | null;
  first_publish_year?: number;
  authors?: { key: string; name: string }[];
}

export interface OlSubjectResponse {
  key: string;
  name: string;
  work_count: number;
  works: OlSubjectWork[];
}

export interface OlSubjectSearchDoc {
  key: string;
  name: string;
  /** subject, person, place or time */
  subject_type?: string;
  work_count?: number;
}

export interface OlSubjectSearchResponse {
  numFound: number;
  start: number;
  docs: OlSubjectSearchDoc[];
}
