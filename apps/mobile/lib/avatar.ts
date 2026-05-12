import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { apiFetch, patchUser } from './api';

export type PickedImage = { uri: string; width: number; height: number };

export async function pickImageFromLibrary(): Promise<PickedImage | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;
  const { uri, width, height } = result.assets[0];
  return { uri, width, height };
}

export async function takePhotoFromCamera(): Promise<PickedImage | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;
  const { uri, width, height } = result.assets[0];
  return { uri, width, height };
}

export async function uploadAvatarFromUri(uri: string): Promise<string | null> {
  // Compress (assumes URI is already square-cropped by CircularCropModal)
  const img = await ImageManipulator.manipulate(uri)
    .resize({ width: 500, height: 500 })
    .renderAsync();
  const compressed = await img.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });

  let uploadUrl: string, publicUrl: string;
  try {
    const res = await apiFetch<{ uploadUrl: string; path: string; publicUrl: string }>(
      '/api/users/me/avatar-upload-url',
      { method: 'POST', body: JSON.stringify({ ext: 'jpg', contentType: 'image/jpeg' }) },
    );
    uploadUrl = res.uploadUrl;
    publicUrl = res.publicUrl;
  } catch (err) {
    console.error('[avatar] Failed to get upload URL:', err);
    throw err;
  }

  const fileResponse = await fetch(compressed.uri);
  const blob = await fileResponse.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text().catch(() => '');
    console.error('[avatar] Supabase PUT failed:', uploadResponse.status, body);
    throw new Error(`Storage upload failed (${uploadResponse.status}): ${body}`);
  }

  await patchUser({ image: publicUrl });
  return publicUrl;
}

// Legacy helpers kept for backward compatibility
export async function pickAndUploadAvatar(): Promise<string | null> {
  const picked = await pickImageFromLibrary();
  if (!picked) return null;
  // Auto center-crop to square when called without the crop modal
  const { uri, width, height } = picked;
  const cropSz = Math.min(width, height);
  const img = await ImageManipulator.manipulate(uri)
    .crop({ originX: (width - cropSz) / 2, originY: (height - cropSz) / 2, width: cropSz, height: cropSz })
    .resize({ width: 500, height: 500 })
    .renderAsync();
  const saved = await img.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
  return uploadAvatarFromUri(saved.uri);
}

export async function takeAndUploadAvatar(): Promise<string | null> {
  const picked = await takePhotoFromCamera();
  if (!picked) return null;
  const { uri, width, height } = picked;
  const cropSz = Math.min(width, height);
  const img = await ImageManipulator.manipulate(uri)
    .crop({ originX: (width - cropSz) / 2, originY: (height - cropSz) / 2, width: cropSz, height: cropSz })
    .resize({ width: 500, height: 500 })
    .renderAsync();
  const saved = await img.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
  return uploadAvatarFromUri(saved.uri);
}
