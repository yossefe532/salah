export const optimizeProfilePhoto = async (file: File, size = 600, quality = 0.82) => {
  if (!file.type.startsWith('image/')) {
    throw new Error('يجب اختيار ملف صورة صالح');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('فشل قراءة الصورة'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('فشل تجهيز الصورة'));
    img.src = dataUrl;
  });

  const sourceSize = Math.min(image.width, image.height);
  const sourceX = (image.width - sourceSize) / 2;
  const sourceY = (image.height - sourceSize) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('فشل تجهيز الصورة');
  }

  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);

  const optimized = canvas.toDataURL('image/jpeg', quality);
  if (!optimized) {
    throw new Error('فشل ضغط الصورة');
  }

  return optimized;
};
