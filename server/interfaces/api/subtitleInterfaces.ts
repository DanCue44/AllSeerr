export interface SubtitleLanguage {
  code: string;
  name: string;
  forced: boolean;
  hi: boolean;
}

export interface SubtitleTrack extends SubtitleLanguage {
  // Embedded in the video file rather than a separate subtitle file
  embedded: boolean;
  fileName?: string;
  size?: number;
}

export interface SubtitleStatus {
  subtitles: SubtitleTrack[];
  missing: SubtitleLanguage[];
}

export interface EpisodeSubtitleStatus extends SubtitleStatus {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}

export interface MediaSubtitlesResponse {
  // Languages the item's Bazarr language profile asks for
  wanted: SubtitleLanguage[];
  // Languages enabled in Bazarr that can be requested
  available: Omit<SubtitleLanguage, 'forced' | 'hi'>[];
  movie?: SubtitleStatus;
  episodes?: EpisodeSubtitleStatus[];
}

export interface SubtitleRequestBody {
  language: string;
  forced?: boolean;
  hi?: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
}
