/**
 * The wall manifest is what we persist per saved wall. The `state` is the
 * arranger's own serialized gallery from the frontend; the backend treats it as
 * mostly opaque, only reaching into `images[]` to swap freshly uploaded photos
 * for their CDN URLs.
 */

/** One image inside a saved wall's state. Extra fields pass through untouched. */
export interface WallStateImage {
  id: string;
  src: string;
  [key: string]: unknown;
}

/** The frontend's serialized gallery. Only `images` is inspected server-side. */
export interface WallState {
  images: WallStateImage[];
  [key: string]: unknown;
}

/** The full stored record for one wall. */
export interface WallManifest {
  id: string;
  name: string;
  state: WallState;
  createdAt: string;
  updatedAt: string;
}

/** The lightweight shape returned by the list endpoint. */
export interface WallSummary {
  id: string;
  name: string;
  updatedAt: string;
}
