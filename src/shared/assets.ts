import { z } from 'zod';

export const MAX_ASSET_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_ASSET_FILENAME_LENGTH = 255;

export const assetIdSchema = z.string().uuid();

export interface AssetResponse {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentUrl: string;
}
