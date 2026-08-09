import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Compresses an image file or base64 string to a highly optimized JPEG.
 * Reduces dimensions to a maximum of 1200px and sets compression quality to 75%.
 * This reduces typical smartphone photo sizes from 10MB+ down to ~150KB,
 * preventing browser out-of-memory errors on mobile devices.
 */
export const compressImage = (
  source: File | string,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.75
): Promise<Blob | string> => {
  return new Promise((resolve, reject) => {
    const isBase64 = typeof source === 'string';
    
    // Create an image element
    const img = new Image();
    
    img.onload = () => {
      // Calculate new dimensions keeping aspect ratio
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback if canvas context cannot be created
        if (isBase64) resolve(source);
        else resolve(source as File);
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      if (isBase64) {
        // Return compressed base64 JPEG
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        // Return compressed Blob JPEG
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(source as File);
            }
          },
          'image/jpeg',
          quality
        );
      }
    };
    
    img.onerror = (err) => {
      console.error('Error loading image for compression:', err);
      // Fallback to original source if an error occurs
      resolve(source);
    };
    
    if (isBase64) {
      img.src = source as string;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          img.src = e.target.result as string;
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(source as File);
    }
  });
};

/**
 * Uploads a file (or Blob) to Firebase Storage and returns its public download URL.
 */
export const uploadFileToStorage = async (
  file: File | Blob,
  path: string
): Promise<string> => {
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
};

/**
 * Uploads a base64 string to Firebase Storage and returns its public download URL.
 * Includes a 1.5-second timeout with automatic fallback to inline base64 to prevent
 * hanging the interface indefinitely if Firebase Storage is not provisioned or active.
 */
export const uploadBase64ToStorage = async (
  base64Data: string,
  path: string
): Promise<string> => {
  const cleanBase64 = base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`;
  
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Firebase Storage timeout')), 1500)
  );

  const uploadPromise = (async () => {
    const fileRef = ref(storage, path);
    await uploadString(fileRef, cleanBase64, 'data_url');
    return getDownloadURL(fileRef);
  })();

  try {
    return await Promise.race([uploadPromise, timeoutPromise]);
  } catch (err) {
    console.warn('Firebase Storage signature upload failed or timed out. Falling back to inline Base64 storage:', err);
    // Return clean inline base64 which Firestore easily supports for small signatures
    return cleanBase64;
  }
};
