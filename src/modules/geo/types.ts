export interface GeoLocation {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  regionName: string;
}

export interface IpApiResponse {
  status: string;
  message?: string;
  lat: number;
  lon: number;
  city: string;
  country: string;
  regionName: string;
}
