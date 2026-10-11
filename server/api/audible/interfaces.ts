export interface AudibleContributor {
  asin?: string;
  name: string;
}

export interface AudibleProduct {
  asin: string;
  title?: string;
  subtitle?: string;
  authors?: AudibleContributor[];
  narrators?: AudibleContributor[];
  // From the product_attrs response group
  runtime_length_min?: number;
  // From the media response group, keyed by image size
  product_images?: Record<string, string>;
}

export interface AudibleProductsResponse {
  products?: AudibleProduct[];
  total_results?: number;
}
