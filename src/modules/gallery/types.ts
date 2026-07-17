export interface GalleryRow {
  id: string;
  title: string;
  description: string;
  image_url: string;
  date: string;
  user_sub: string | null;
}

export interface GalleryItem {
  id: string;
  text: string;
  description: string;
  imageUrl: string;
  date: string;
  user_sub: string | null;
}

export interface CreateGalleryInput {
  text: string;
  description: string;
  imageUrl: string;
  date: Date;
  user_sub?: string;
}
