let logoDataUrl;

/** Load the shared transparent logo for generated PDF invoices. */
export function getBrandLogoDataUrl() {
  if (!logoDataUrl) {
    logoDataUrl = fetch('/logo.png')
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load invoice logo');
        return response.blob();
      })
      .then((blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      }))
      .catch((error) => {
        logoDataUrl = undefined;
        throw error;
      });
  }
  return logoDataUrl;
}
