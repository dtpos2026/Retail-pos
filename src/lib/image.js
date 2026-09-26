// Resize an image file in the browser before sending it to the database.
export function readImage(file, { maxSize = 480, type = 'image/webp', quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected.'));
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return reject(new Error('Please choose a PNG or JPG image.'));
    if (file.size > 10 * 1024 * 1024) return reject(new Error('Image is too large (max 10 MB).'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('This image could not be opened.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const c = canvas.getContext('2d');
        if (type === 'image/jpeg') {
          c.fillStyle = '#fff';
          c.fillRect(0, 0, w, h);
        }
        c.imageSmoothingQuality = 'high';
        c.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL(type, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
