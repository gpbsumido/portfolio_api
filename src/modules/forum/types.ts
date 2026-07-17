export interface TableColumn {
  column_name: string;
  data_type: string;
}

export interface ForumPost {
  id: number;
  title: string;
  text: string;
  username: string;
}

export interface ForumPostsResponse {
  data: ForumPost[];
  meta: {
    total_count: number;
    current_page: number;
    per_page: number;
  };
}

export interface Marker {
  id: number;
  latitude: number;
  longitude: number;
  text: string;
}
